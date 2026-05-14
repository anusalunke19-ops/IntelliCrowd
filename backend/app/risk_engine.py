"""
IntelliCrowd — Risk Engine
Classifies zone risk levels and computes composite scores.
"""
from __future__ import annotations
from typing import Dict, List
from app.schemas import ZoneMetrics


def classify_global_risk(metrics: List[ZoneMetrics]) -> str:
    critical = sum(1 for m in metrics if m.risk_level == "critical")
    warning = sum(1 for m in metrics if m.risk_level == "warning")
    if critical >= 1:
        return "CRITICAL"
    if warning >= 2:
        return "ELEVATED"
    return "SAFE"


def top_risk_zones(metrics: List[ZoneMetrics], n: int = 3) -> List[ZoneMetrics]:
    return sorted(metrics, key=lambda m: m.risk_score, reverse=True)[:n]
