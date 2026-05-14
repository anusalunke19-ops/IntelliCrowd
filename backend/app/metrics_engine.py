"""
IntelliCrowd — Metrics Engine
Computes per-zone metrics from ZoneState snapshots.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Dict, List
from app.schemas import ZoneMetrics
from app.zone_engine import ZoneState, ZoneConfig

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


def _risk_level(occ: float, flow: str, trend: str) -> str:
    if occ >= 85 or (flow == "opposing") or (occ < 60 and trend == "rising" and occ > 50):
        return "critical"
    if occ >= 60 or trend == "rising":
        return "warning"
    return "safe"


def _reasons(state: ZoneState) -> List[str]:
    r: List[str] = []
    if state.occupancy_percent >= 95:
        r.append("near-capacity — critical density")
    elif state.occupancy_percent >= 85:
        r.append("high occupancy")
    if state.flow_direction == "opposing":
        r.append("opposing crowd flows detected")
    if state.avg_speed < 0.05 and state.people_count > 5:
        r.append("crowd movement stalled")
    if state.trend == "rising":
        r.append("headcount rising rapidly")
    if state.dwell_time > 150:
        r.append("extended dwell time")
    return r or ["nominal"]


def _recommended_action(state: ZoneState, risk: str) -> str:
    if risk == "critical":
        if state.flow_direction == "opposing":
            return "Separate flows immediately — assign stewards at zone entry/exit"
        if state.occupancy_percent >= 95:
            return "Close inflow gate immediately and activate overflow route"
        return "Deploy emergency response team — assess evacuation need"
    if risk == "warning":
        if state.trend == "rising":
            return f"Slow inflow to {state.config.label} — redirect to nearest alternate zone"
        return f"Monitor {state.config.label} closely — pre-position stewards"
    return "No action required — continue monitoring"


def build_zone_metrics(
    state: ZoneState,
    timestamp: datetime | None = None,
) -> ZoneMetrics:
    ts = timestamp or datetime.now(timezone.utc)
    occ = round(state.occupancy_percent, 1)
    flow = state.flow_direction
    trend = state.trend
    risk_level = _risk_level(occ, flow, trend)
    risk_score = compute_risk_score(state)

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
    )


def build_all_metrics(
    zone_states: Dict[str, ZoneState],
    timestamp: datetime | None = None,
) -> List[ZoneMetrics]:
    ts = timestamp or datetime.now(timezone.utc)
    return [build_zone_metrics(s, ts) for s in zone_states.values()]
