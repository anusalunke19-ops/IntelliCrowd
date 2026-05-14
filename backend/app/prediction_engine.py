"""
IntelliCrowd — Prediction Engine
Linear-extrapolation engine for predictive crowd analytics.
Forecasts time-to-critical and rate-of-change per zone.
"""
from __future__ import annotations
import time
import math
from collections import defaultdict, deque
from typing import Dict, Optional, Tuple


# Rolling history length (ticks)
HISTORY_LEN = 30

# Minimum data points before making predictions
MIN_POINTS = 5

# Pipeline tick interval (seconds) — used for time extrapolation
TICK_INTERVAL = 0.3


class ZonePrediction:
    """Prediction result for a single zone."""

    def __init__(
        self,
        zone_id: str,
        label: str,
        rate_per_minute: float,
        predicted_time_to_critical: Optional[float],
        prediction_text: str,
        current_occupancy: float,
        critical_threshold: float,
    ):
        self.zone_id = zone_id
        self.label = label
        self.rate_per_minute = rate_per_minute
        self.predicted_time_to_critical = predicted_time_to_critical
        self.prediction_text = prediction_text
        self.current_occupancy = current_occupancy
        self.critical_threshold = critical_threshold


class PredictionEngine:
    """
    Maintains rolling occupancy history per zone and computes:
      - Rate of change (Δ occupancy % per minute)
      - Predicted seconds until critical threshold
      - Human-readable prediction strings
    """

    def __init__(self, history_len: int = HISTORY_LEN):
        self._history_len = history_len
        # zone_id → deque of (timestamp, occupancy_percent)
        self._occ_history: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=history_len)
        )
        self._predictions: Dict[str, ZonePrediction] = {}

    def update(
        self,
        zone_id: str,
        label: str,
        occupancy_percent: float,
        critical_threshold_pct: float = 85.0,
    ) -> Optional[ZonePrediction]:
        """
        Feed new occupancy data and get a prediction.

        Args:
            zone_id: Zone identifier
            label: Human-readable zone label
            occupancy_percent: Current occupancy (0–100)
            critical_threshold_pct: Threshold at which zone becomes critical (default 85%)

        Returns:
            ZonePrediction or None if insufficient data
        """
        now = time.time()
        self._occ_history[zone_id].append((now, occupancy_percent))

        history = list(self._occ_history[zone_id])
        if len(history) < MIN_POINTS:
            return None

        # ── Linear regression on recent history ─────────────────────────
        n = len(history)
        times = [h[0] for h in history]
        occs = [h[1] for h in history]

        t0 = times[0]
        xs = [(t - t0) for t in times]  # seconds from start
        # Weight recent data points more heavily (exponential decay weighting)
        weights = [math.exp(0.2 * (i - n)) for i in range(n)]
        sum_weights = sum(weights)
        
        x_mean = sum(xs[i] * weights[i] for i in range(n)) / sum_weights
        y_mean = sum(occs[i] * weights[i] for i in range(n)) / sum_weights

        numerator = sum(weights[i] * (xs[i] - x_mean) * (occs[i] - y_mean) for i in range(n))
        denominator = sum(weights[i] * (xs[i] - x_mean) ** 2 for i in range(n))

        if denominator < 1e-9:
            slope = 0.0
        else:
            slope = numerator / denominator  # occupancy-% per second

        # ── Acceleration Factor (Second Derivative) ─────────────────────
        # If the crowd is suddenly surging faster than before, apply a momentum multiplier
        if n >= 10:
            recent_slope = (occs[-1] - occs[-5]) / max(0.1, xs[-1] - xs[-5])
            if recent_slope > slope and recent_slope > 0:
                slope = (slope * 0.4) + (recent_slope * 0.6)

        rate_per_minute = round(slope * 60, 2)

        # ── Time-to-critical ────────────────────────────────────────────
        predicted_time_to_critical: Optional[float] = None
        remaining = critical_threshold_pct - occupancy_percent

        if slope > 0.001 and remaining > 0:
            predicted_time_to_critical = round(remaining / slope, 1)
        elif occupancy_percent >= critical_threshold_pct:
            predicted_time_to_critical = 0.0

        # ── Human-readable prediction text ──────────────────────────────
        if occupancy_percent >= critical_threshold_pct:
            prediction_text = f"{label} is at CRITICAL capacity ({occupancy_percent:.0f}%)"
        elif rate_per_minute > 1.0 and predicted_time_to_critical is not None:
            if predicted_time_to_critical < 60:
                prediction_text = (
                    f"{label} occupancy increasing {rate_per_minute:+.1f}%/min "
                    f"— critical threshold predicted in {predicted_time_to_critical:.0f}s"
                )
            elif predicted_time_to_critical < 300:
                mins = predicted_time_to_critical / 60
                prediction_text = (
                    f"{label} occupancy increasing {rate_per_minute:+.1f}%/min "
                    f"— critical in ~{mins:.1f} min"
                )
            else:
                prediction_text = (
                    f"{label} occupancy trending up {rate_per_minute:+.1f}%/min"
                )
        elif rate_per_minute < -1.0:
            prediction_text = (
                f"{label} occupancy decreasing {rate_per_minute:+.1f}%/min — clearing"
            )
        else:
            prediction_text = f"{label} occupancy stable at {occupancy_percent:.0f}%"

        pred = ZonePrediction(
            zone_id=zone_id,
            label=label,
            rate_per_minute=rate_per_minute,
            predicted_time_to_critical=predicted_time_to_critical,
            prediction_text=prediction_text,
            current_occupancy=occupancy_percent,
            critical_threshold=critical_threshold_pct,
        )
        self._predictions[zone_id] = pred
        return pred

    def get_prediction(self, zone_id: str) -> Optional[ZonePrediction]:
        return self._predictions.get(zone_id)

    def get_all_predictions(self) -> Dict[str, ZonePrediction]:
        return dict(self._predictions)

    def is_imminent_critical(self, zone_id: str, threshold_secs: float = 60.0) -> bool:
        """Returns True if zone is predicted to hit critical within threshold_secs."""
        pred = self._predictions.get(zone_id)
        if not pred or pred.predicted_time_to_critical is None:
            return False
        return 0 < pred.predicted_time_to_critical <= threshold_secs
