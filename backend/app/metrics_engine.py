"""
IntelliCrowd — Metrics Engine (Refined)
Computes per-zone metrics from ZoneState snapshots.

Refinements:
  - Entry/exit counts and net flow in metrics
  - Smoothed values from temporal smoother
  - Prediction text and time-to-critical from PredictionEngine
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.schemas import ZoneMetrics, ClusterInfo
from app.zone_engine import ZoneState, ZoneConfig
from app.prediction_engine import PredictionEngine

# Simulated weather penalty (e.g. high heat increases dwell anomaly)
WEATHER_PENALTY = 0.15   # fixed value for demo; range 0–1


def _flow_anomaly(state: ZoneState) -> float:
    """Scores how abnormal the current flow rate is (0–1)."""
    rule = state.config.direction_rule
    fd = state.flow_direction
    if fd == "opposing":
        return 1.0
    if rule == "entry_only" and "outbound" in fd:
        return 0.7
    if rule == "exit_only" and "inbound" in fd:
        return 0.7
    if state.trend == "rising" and state.occupancy_percent > 70:
        return 0.6
    return 0.1


def _dwell_anomaly(state: ZoneState) -> float:
    """Scores how abnormally long people are dwelling (0–1)."""
    dt = state.dwell_time   # frames
    if dt > 200:
        return 1.0
    if dt > 100:
        return 0.7
    if dt > 50:
        return 0.4
    return 0.1


def compute_risk_score(state: ZoneState) -> float:
    """
    risk = (density_pct × 0.4) + (flow_rate_anomaly × 0.3)
           + (dwell_time_anomaly × 0.2) + (weather_penalty × 0.1)
    Returns 0–100.
    """
    density_pct = state.occupancy_percent / 100.0   # 0–1
    flow_anom = _flow_anomaly(state)
    dwell_anom = _dwell_anomaly(state)
    raw = (density_pct * 0.4) + (flow_anom * 0.3) + (dwell_anom * 0.2) + (WEATHER_PENALTY * 0.1)
    return round(min(100.0, raw * 100), 1)


def _risk_level(occ: float, flow: str, trend: str, speed: float) -> str:
    # Critical: physical density danger zone OR running-in-dense-crowd panic
    if occ >= 85:
        return "critical"
    if occ >= 60 and speed >= 2.5:
        return "critical"   # dense + fast = stampede risk
    if occ >= 60:
        return "warning"
    return "safe"


def _reasons(state: ZoneState) -> List[str]:
    r: List[str] = []
    if state.occupancy_percent >= 85:
        r.append(f"Critical density ({round(state.occupancy_percent)}%) — stampede risk")
    elif state.occupancy_percent >= 60 and state.avg_speed >= 2.5:
        r.append(f"Dense crowd ({round(state.occupancy_percent)}%) moving at panic speed ({state.avg_speed:.2f} m/s)")
    elif state.occupancy_percent >= 60:
        r.append(f"Elevated density ({round(state.occupancy_percent)}%)")
    return r or ["nominal"]


def _recommended_action(state: ZoneState, risk: str) -> str:
    if risk == "critical":
        if state.occupancy_percent >= 85:
            return "Reduce inflow immediately — activate crowd dispersal protocol"
        # dense + fast
        return "Open emergency exits — deploy medical and security response now"
    if risk == "warning":
        return f"Monitor {state.config.label} closely — pre-position stewards"
    return "No action required — continue monitoring"


def point_in_polygon(x: float, y: float, polygon: List[List[float]]) -> bool:
    """Ray-casting algorithm for point-in-polygon test."""
    n = len(polygon)
    inside = False
    px, py = x, y
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def build_zone_metrics(
    state: ZoneState,
    timestamp: datetime | None = None,
    prediction_engine: Optional[PredictionEngine] = None,
    global_clusters: List[ClusterInfo] = None,
) -> ZoneMetrics:
    ts = timestamp or datetime.now(timezone.utc)
    occ = round(state.occupancy_percent, 1)
    flow = state.flow_direction
    trend = state.trend
    risk_level = _risk_level(occ, flow, trend, state.avg_speed)
    risk_score = compute_risk_score(state)

    # ── Filter clusters for this zone ─────────────────────────────────────
    zone_clusters = []
    if global_clusters:
        for c in global_clusters:
            # centroid is in normalized 0-1 range
            if point_in_polygon(c.centroid.x, c.centroid.y, state.config.polygon):
                zone_clusters.append(c)

    # ── Predictions (Refinement #10) ─────────────────────────────────────
    prediction_text = None
    predicted_ttc = None
    rate_of_change = None

    if prediction_engine:
        critical_pct = state.config.critical_threshold * 100
        pred = prediction_engine.update(
            zone_id=state.config.zone_id,
            label=state.config.label,
            occupancy_percent=occ,
            critical_threshold_pct=critical_pct,
        )
        if pred:
            prediction_text = pred.prediction_text
            predicted_ttc = pred.predicted_time_to_critical
            rate_of_change = pred.rate_per_minute

    return ZoneMetrics(
        zone_id=state.config.zone_id,
        label=state.config.label,
        polygon=state.config.polygon,
        people_count=state.people_count,
        capacity=state.config.capacity,
        occupancy_percent=occ,
        density_score=round(state.density_score, 3),
        avg_speed=state.avg_speed,
        dwell_time=round(state.dwell_time, 1),
        flow_direction=flow,
        risk_level=risk_level,
        risk_score=risk_score,
        trend=trend,
        reason=_reasons(state),
        recommended_action=_recommended_action(state, risk_level),
        timestamp=ts,
        density_history=list(state.density_history),
        # ── Refinement #9: Entry/Exit ──
        entry_count=state.entry_count,
        exit_count=state.exit_count,
        net_flow=state.net_flow,
        # ── Refinement #4: Smoothed values ──
        smoothed_count=state.smoothed_count,
        smoothed_occupancy=round(state.smoothed_occupancy, 1),
        # ── Refinement #10: Predictions ──
        prediction=prediction_text,
        predicted_time_to_critical=predicted_ttc,
        rate_of_change=rate_of_change,
        # ── Clusters ──
        clusters=zone_clusters,
    )


def build_all_metrics(
    zone_states: Dict[str, ZoneState],
    timestamp: datetime | None = None,
    prediction_engine: Optional[PredictionEngine] = None,
    global_clusters: List[ClusterInfo] = None,
) -> List[ZoneMetrics]:
    ts = timestamp or datetime.now(timezone.utc)
    return [build_zone_metrics(s, ts, prediction_engine, global_clusters) for s in zone_states.values()]
