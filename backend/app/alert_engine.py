"""
IntelliCrowd — Alert Engine (Simplified & Calibrated)

Only two alert types are emitted to avoid false-alarm fatigue:

  1. DENSITY_CRITICAL  — zone density ≥ 85 % (physical people/m² near crush limit).
                         Cooldown: 60 s to prevent repeat-fire.

  2. STAMPEDE_DETECTED — crowd is BOTH dense (≥ 60 %) AND moving abnormally fast
                         (avg_speed ≥ 2.5 m/s).  Fast-moving sparse crowds are NOT
                         flagged (normal activity).  Dense-but-slow crowds are already
                         caught by DENSITY_CRITICAL.  Cooldown: 30 s.

Thresholds are anchored to real-world benchmarks:
  - Crush/dangerous density ≈ 4 p/m² → maps to 100 % in ZoneState.density_score.
    85 % ≈ 3.4 p/m², a well-recognised danger threshold (Fruin Level F).
  - Panic speed ≥ 2.5 m/s (≈ 9 km/h) is clearly running-in-crowd territory.
  - 60 % density floor prevents false stampede alerts from thin, fast-moving queues.
"""
from __future__ import annotations
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.schemas import Alert, AlertSeverity, AlertType, ZoneMetrics
from app.prediction_engine import PredictionEngine


# ─── Thresholds ──────────────────────────────────────────────────────────────

# Density-only threshold (Fruin Level-F danger zone ≈ 3.4 p/m²)
DENSITY_CRITICAL_THRESHOLD = 85.0      # occupancy % (density-based)

# Combined stampede: zone must be crowd-dense AND crowd is running
STAMPEDE_DENSITY_FLOOR    = 60.0       # minimum density % before velocity matters
STAMPEDE_SPEED_THRESHOLD  = 2.5        # m/s — clearly running/panic speed

# Cooldowns (seconds) — prevent alert storm
DENSITY_COOLDOWN  = 60
STAMPEDE_COOLDOWN = 30


class AlertEngine:
    """
    Stateful alert detector — call .process() every pipeline tick.
    Emits at most two distinct alert types to keep the feed meaningful.
    """

    def __init__(self, max_history: int = 200):
        self._history: deque[Alert] = deque(maxlen=max_history)
        self._last_alert: Dict[str, datetime] = {}

    def _suppress(self, key: str, cooldown_secs: int) -> bool:
        last = self._last_alert.get(key)
        now = datetime.now(timezone.utc)
        if last and (now - last).total_seconds() < cooldown_secs:
            return True
        self._last_alert[key] = now
        return False

    def _emit(self, alert_type: AlertType, zone_id: str, severity: AlertSeverity,
              message: str, action: str) -> Alert:
        a = Alert(
            alert_id=str(uuid.uuid4()),
            type=alert_type,
            zone_id=zone_id,
            severity=severity,
            timestamp=datetime.now(timezone.utc),
            message=message,
            recommended_action=action,
            status="open",
        )
        self._history.append(a)
        return a

    def process(
        self,
        metrics: List[ZoneMetrics],
        prediction_engine: Optional[PredictionEngine] = None,
    ) -> List[Alert]:
        """Check all zone metrics and return newly triggered alerts."""
        new_alerts: List[Alert] = []

        for m in metrics:
            zid = m.zone_id

            # ── 1. DENSITY_CRITICAL ──────────────────────────────────────
            # Fires when the physical crowd density in the zone crosses the
            # Fruin Level-F danger boundary (~3.4 people/m²).
            if m.occupancy_percent >= DENSITY_CRITICAL_THRESHOLD:
                key = f"DENSITY:{zid}"
                if not self._suppress(key, DENSITY_COOLDOWN):
                    new_alerts.append(self._emit(
                        "DENSITY_CRITICAL", zid, "P1",
                        f"Stampede Possibility in {m.label}",
                        (
                            f"Crowd density is critically high ({m.occupancy_percent:.0f}% of safe limit). "
                            f"Redirect inflow immediately and deploy stewards."
                        ),
                    ))

            # ── 2. STAMPEDE_DETECTED ─────────────────────────────────────
            # Fires only when the zone is already crowded AND the crowd is
            # moving at panic speed.  Avoids false alerts on sparse-but-fast
            # scenarios (e.g., an open corridor with a few runners).
            elif (
                m.avg_speed >= STAMPEDE_SPEED_THRESHOLD
                and m.occupancy_percent >= STAMPEDE_DENSITY_FLOOR
                and m.people_count > 5
            ):
                key = f"STAMPEDE:{zid}"
                if not self._suppress(key, STAMPEDE_COOLDOWN):
                    new_alerts.append(self._emit(
                        "STAMPEDE_DETECTED", zid, "P1",
                        f"Stampede Possibility in {m.label}",
                        (
                            f"Abnormal crowd velocity ({m.avg_speed:.2f} m/s) detected in a dense zone "
                            f"({m.occupancy_percent:.0f}% density). Possible panic. "
                            f"Open all emergency exits and deploy medical response."
                        ),
                    ))

            # ── 3. CLUSTER_DETECTED ─────────────────────────────────────
            # Detects high-density clusters within a zone even if the overall
            # zone density isn't critical yet.
            critical_clusters = [c for c in m.clusters if c.risk_level == "critical"]
            if critical_clusters:
                key = f"CLUSTER:{zid}"
                if not self._suppress(key, 45): # 45s cooldown
                    new_alerts.append(self._emit(
                        "CLUSTER_DETECTED", zid, "P2",
                        f"High-Density Cluster in {m.label}",
                        f"Detected {len(critical_clusters)} localized high-density cluster(s). Monitor for local congestion.",
                    ))

        # ── 4. ZONE_IMBALANCE ──────────────────────────────────────────
        # Detects if one zone has significantly more people than others.
        if len(metrics) > 1:
            total_people = sum(m.people_count for m in metrics)
            avg_people = total_people / len(metrics)
            
            for m in metrics:
                # If a zone has > 2x average and at least 20 people more than average
                if m.people_count > (avg_people * 2.0) and m.people_count > (avg_people + 20):
                    key = f"IMBALANCE:{m.zone_id}"
                    if not self._suppress(key, 120): # 2 min cooldown
                        new_alerts.append(self._emit(
                            "ZONE_IMBALANCE", m.zone_id, "P2",
                            f"Crowd Imbalance: {m.label}",
                            f"Zone has {m.people_count} people, significantly higher than average ({avg_people:.0f}). Redirect flow to underutilized zones.",
                        ))

        return new_alerts

    def all_alerts(self) -> List[Alert]:
        return list(self._history)

    def open_alerts(self) -> List[Alert]:
        return [a for a in self._history if a.status == "open"]
