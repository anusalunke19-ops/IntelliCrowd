"""
IntelliCrowd — Temporal Smoother
Rolling-average engine to stabilize flickering counts, density scores,
and occupancy percentages across recent frames.
"""
from __future__ import annotations
from collections import defaultdict, deque
from typing import Dict, Tuple


# Default smoothing window (number of frames)
DEFAULT_WINDOW = 10


class TemporalSmoother:
    """
    Maintains per-zone rolling windows for:
      - person counts
      - density scores
      - occupancy percentages
    Returns smoothed (averaged) values to eliminate jitter.
    """

    def __init__(self, window: int = DEFAULT_WINDOW):
        self._window = window
        self._counts: Dict[str, deque] = defaultdict(lambda: deque(maxlen=window))
        self._density: Dict[str, deque] = defaultdict(lambda: deque(maxlen=window))
        self._occupancy: Dict[str, deque] = defaultdict(lambda: deque(maxlen=window))

    def smooth(
        self,
        zone_id: str,
        raw_count: int,
        raw_density: float,
        raw_occupancy: float,
    ) -> Tuple[int, float, float]:
        """
        Feed raw values and get back temporally smoothed versions.

        Returns:
            (smoothed_count, smoothed_density, smoothed_occupancy)
        """
        self._counts[zone_id].append(raw_count)
        self._density[zone_id].append(raw_density)
        self._occupancy[zone_id].append(raw_occupancy)

        buf_c = self._counts[zone_id]
        buf_d = self._density[zone_id]
        buf_o = self._occupancy[zone_id]

        smoothed_count = round(sum(buf_c) / len(buf_c))
        smoothed_density = round(sum(buf_d) / len(buf_d), 4)
        smoothed_occupancy = round(sum(buf_o) / len(buf_o), 2)

        return smoothed_count, smoothed_density, smoothed_occupancy

    def get_trend_data(self, zone_id: str) -> list:
        """Return raw count history for a zone (useful for trend calcs)."""
        return list(self._counts.get(zone_id, []))

    def reset(self, zone_id: str | None = None):
        """Clear history for one zone or all zones."""
        if zone_id:
            self._counts.pop(zone_id, None)
            self._density.pop(zone_id, None)
            self._occupancy.pop(zone_id, None)
        else:
            self._counts.clear()
            self._density.clear()
            self._occupancy.clear()
