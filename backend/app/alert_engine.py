"""
IntelliCrowd — Alert Engine (Refined)
Detects anomalies and emits structured alerts.

Refinement:
  - PREDICTIVE_WARNING alert when zone is predicted to hit critical
    within 60 seconds (Refinement #10)
"""
from __future__ import annotations
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.schemas import Alert, AlertSeverity, AlertType, ZoneMetrics
from app.prediction_engine import PredictionEngine


# ─── Alert thresholds ─────────────────────────────────────────────────────────

DENSITY_CRITICAL_THRESHOLD = 70.0     # occupancy % — triggers at 70% capacity
SURGE_THRESHOLD = 1.10                 # 10% rise within window (was 20%)
SURGE_WINDOW_FRAMES = 10              # ~30s at 3 ticks/s (was 40 = 2 min)
BOTTLENECK_MIN_FRAMES = 5             # ~15s sustained (was 15 = 3 min)
CROWD_STOP_SPEED = 0.05               # m/s — catches slower movement (was 0.02)

# Predictive warning thresholds
PREDICTIVE_WARNING_SECS = 60.0         # warn if critical predicted within 60s


class AlertEngine:
    """
    Stateful alert detector — call .process() every pipeline tick.
    Maintains rolling occupancy history per zone for surge detection.
    """

    def __init__(self, max_history: int = 500):
        # zone_id → deque of (timestamp, occupancy_percent)
        self._occ_history: Dict[str, deque] = defaultdict(lambda: deque(maxlen=SURGE_WINDOW_FRAMES * 2))
        # zone_id → consecutive frames with bottleneck condition
        self._bottleneck_counter: Dict[str, int] = defaultdict(int)
        # alert history (last max_history)
        self._history: deque[Alert] = deque(maxlen=max_history)
        # suppress duplicate alerts within cooldown period
        self._last_alert: Dict[str, datetime] = {}

    def _suppress(self, key: str, cooldown_secs: int = 30) -> bool:
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
        now = datetime.now(timezone.utc)

        for m in metrics:
            zid = m.zone_id
            self._occ_history[zid].append((now, m.occupancy_percent))

            # ── DENSITY_CRITICAL ──────────────────────────────────────────
            if m.occupancy_percent >= DENSITY_CRITICAL_THRESHOLD:
                key = f"DENSITY_CRITICAL:{zid}"
                if not self._suppress(key, 15):   # cooldown 15s (was 45s)
                    new_alerts.append(self._emit(
                        "DENSITY_CRITICAL", zid, "P1",
                        f"{m.label} is at {m.occupancy_percent:.0f}% capacity — imminent crush risk",
                        "Close all inflow immediately and activate emergency dispersal protocol",
                    ))

            # ── SURGE_DETECTED ────────────────────────────────────────────
            history = list(self._occ_history[zid])
            if len(history) >= SURGE_WINDOW_FRAMES:
                baseline = history[-SURGE_WINDOW_FRAMES][1]
                current = history[-1][1]
                if baseline > 2 and current / baseline >= SURGE_THRESHOLD:
                    key = f"SURGE:{zid}"
                    if not self._suppress(key, 20):  # was 60s
                        new_alerts.append(self._emit(
                            "SURGE_DETECTED", zid, "P1",
                            f"{m.label} headcount surged {current / baseline * 100 - 100:.0f}% in <2 min",
                            "Deploy stewards to regulate inflow — open alternate access routes",
                        ))

            # ── COUNTER_FLOW ──────────────────────────────────────────────
            if m.flow_direction == "opposing":
                key = f"COUNTER_FLOW:{zid}"
                if not self._suppress(key, 20):  # was 60s
                    new_alerts.append(self._emit(
                        "COUNTER_FLOW", zid, "P2",
                        f"Opposing crowd flows detected in {m.label} — collision risk elevated",
                        "Segregate flows with physical barriers; assign 2 stewards immediately",
                    ))

            # ── BOTTLENECK ────────────────────────────────────────────────
            if m.flow_direction in ("stationary", "opposing") and m.people_count > 3:  # was 10
                self._bottleneck_counter[zid] += 1
            else:
                self._bottleneck_counter[zid] = 0

            if self._bottleneck_counter[zid] >= BOTTLENECK_MIN_FRAMES:
                key = f"BOTTLENECK:{zid}"
                if not self._suppress(key, 30):  # was 90s
                    new_alerts.append(self._emit(
                        "BOTTLENECK", zid, "P2",
                        f"Persistent bottleneck in {m.label} — flow obstructed for >3 min",
                        "Remove obstructions and widen exit points; use PA to redirect crowd",
                    ))

            # ── CROWD_STOP ────────────────────────────────────────────────
            if m.avg_speed < CROWD_STOP_SPEED and m.people_count > 3:  # was 15
                key = f"CROWD_STOP:{zid}"
                if not self._suppress(key, 20):  # was 60s
                    new_alerts.append(self._emit(
                        "CROWD_STOP", zid, "P2",
                        f"Crowd movement has stopped in {m.label} — pressure build-up possible",
                        "Assess cause of stoppage; prepare stewards for controlled dispersal",
                    ))

            # ── CLUSTER ──────────────────────────────────────────────────
            if m.people_count >= 10 and m.occupancy_percent > 70:
                key = f"CLUSTER:{zid}"
                if not self._suppress(key, 60):
                    new_alerts.append(self._emit(
                        "CLUSTER_DETECTED", zid, "P2",
                        f"Crowd cluster detected in {m.label}",
                        "Dispatch stewards to monitor cluster and ensure safety",
                    ))

            # ── PREDICTIVE_WARNING (Refinement #10) ──────────────────────
            if prediction_engine and prediction_engine.is_imminent_critical(zid, PREDICTIVE_WARNING_SECS):
                pred = prediction_engine.get_prediction(zid)
                if pred:
                    key = f"PREDICTIVE:{zid}"
                    if not self._suppress(key, 30):
                        ttc = pred.predicted_time_to_critical
                        ttc_str = f"{ttc:.0f}s" if ttc is not None else "soon"
                        new_alerts.append(self._emit(
                            "PREDICTIVE_WARNING", zid, "P1",
                            f"⚠️ {pred.prediction_text}",
                            f"Pre-emptively slow inflow to {m.label} — critical capacity predicted in {ttc_str}",
                        ))

        return new_alerts

    def all_alerts(self) -> List[Alert]:
        return list(self._history)

    def open_alerts(self) -> List[Alert]:
        return [a for a in self._history if a.status == "open"]
