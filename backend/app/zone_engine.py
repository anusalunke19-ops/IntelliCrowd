"""
IntelliCrowd — Zone Engine (Refined)
Assigns detected persons to polygon zones and tracks them across frames.

Refinements:
  - Zone entry/exit counting with directional flow
  - Temporal smoothing integration
  - Hybrid YOLO + CSRNet density blending
"""
from __future__ import annotations
import json
import math
from collections import deque
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.schemas import BoundingBox, DetectionFrame, MovementVector, ZoneConfig, DensityPoint
from app.temporal_smoother import TemporalSmoother

# ─── Load zone config ─────────────────────────────────────────────────────────

CONFIG_PATH = Path(__file__).parent.parent / "zones_config.json"


def load_zone_configs(path: Path = CONFIG_PATH) -> List[ZoneConfig]:
    with open(path, "r") as f:
        data = json.load(f)
    return [ZoneConfig(**z) for z in data["zones"]]


# ─── Geometry helpers ─────────────────────────────────────────────────────────

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


def polygon_area(polygon: List[List[float]]) -> float:
    n = len(polygon)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i][0] * polygon[j][1]
        area -= polygon[j][0] * polygon[i][1]
    return abs(area) / 2.0


def centroid_of_box(box: BoundingBox) -> Tuple[float, float]:
    return ((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2)


# ─── Per-track history ────────────────────────────────────────────────────────

class TrackHistory:
    """Records the last N centroids for a tracked person."""
    MAX_LEN = 10

    def __init__(self, track_id: int, x: float, y: float):
        self.track_id = track_id
        self.positions: deque[Tuple[float, float]] = deque(maxlen=self.MAX_LEN)
        self.positions.append((x, y))
        self.frames_in_zone: int = 1

    def update(self, x: float, y: float):
        self.positions.append((x, y))
        self.frames_in_zone += 1

    @property
    def velocity(self) -> Tuple[float, float]:
        if len(self.positions) < 2:
            return (0.0, 0.0)
        dx = self.positions[-1][0] - self.positions[-2][0]
        dy = self.positions[-1][1] - self.positions[-2][1]
        return (dx, dy)

    @property
    def speed(self) -> float:
        vx, vy = self.velocity
        return math.sqrt(vx ** 2 + vy ** 2)

    @property
    def movement_vector(self) -> Tuple[float, float]:
        """Cumulative movement direction (first → last position)."""
        if len(self.positions) < 2:
            return (0.0, 0.0)
        dx = self.positions[-1][0] - self.positions[0][0]
        dy = self.positions[-1][1] - self.positions[0][1]
        return (dx, dy)


# ─── Zone State ───────────────────────────────────────────────────────────────

HISTORY_LEN = 60  # frames


class ZoneState:
    """Maintains rolling frame history and active tracks for one zone."""

    def __init__(self, config: ZoneConfig):
        # ── Handle Normalized Polygons ──
        # If the frontend sent normalized coordinates [0-1], scale them to pixel space (1280x720)
        # We use <= 2.0 to be safe against slight out-of-bounds drawing
        if all(p[0] <= 2.0 and p[1] <= 2.0 for p in config.polygon):
            config.polygon = [[p[0] * 1280.0, p[1] * 720.0] for p in config.polygon]

        self.config = config
        self.area = polygon_area(config.polygon)
        # Rolling history: each entry is a list of TrackHistory in zone
        self.frame_counts: deque[int] = deque(maxlen=HISTORY_LEN)
        self.active_tracks: Dict[int, TrackHistory] = {}
        self.density_history: deque[DensityPoint] = deque(maxlen=60)

        # ── Entry/Exit counting (Refinement #9) ──
        self.entry_count: int = 0
        self.exit_count: int = 0

        # ── Smoothed values (Refinement #4) ──
        self.smoothed_count: int = 0
        self.smoothed_density: float = 0.0
        self.smoothed_occupancy: float = 0.0

        # ── Hybrid count from CSRNet (Refinement #7) ──
        self.csrnet_zone_density: float = 0.0

    def update(self, tracks: List[Tuple[int, float, float]]):
        """
        tracks: list of (track_id, cx, cy) for persons assigned to this zone.
        """
        current_ids = {tid for tid, _, _ in tracks}

        # ── Entry/Exit tracking ──────────────────────────────────────────
        prev_ids = set(self.active_tracks.keys())
        new_entries = current_ids - prev_ids
        exits = prev_ids - current_ids

        self.entry_count += len(new_entries)
        self.exit_count += len(exits)

        # Update / create track histories
        for tid, cx, cy in tracks:
            if tid in self.active_tracks:
                self.active_tracks[tid].update(cx, cy)
            else:
                self.active_tracks[tid] = TrackHistory(tid, cx, cy)

        # Expire tracks not seen this frame
        for tid in list(self.active_tracks.keys()):
            if tid not in current_ids:
                del self.active_tracks[tid]

        self.frame_counts.append(len(tracks))
        
        # Append density point
        self.density_history.append(DensityPoint(
            timestamp=datetime.now(timezone.utc),
            count=self.people_count,
            density_score=self.density_score,
            occupancy_percent=self.occupancy_percent
        ))

    @property
    def net_flow(self) -> int:
        """Net flow = entries - exits (positive = filling up)."""
        return self.entry_count - self.exit_count

    @property
    def people_count(self) -> int:
        base_count = len(self.active_tracks)
        multiplier = getattr(self.config, 'multiplier', 1.0)
        return int(base_count * multiplier)

    @property
    def hybrid_count(self) -> int:
        """
        Hybrid YOLO + CSRNet count (Refinement #7).
        Sparse → trust YOLO. Dense → blend with CSRNet.
        """
        yolo_count = self.people_count
        if yolo_count < 30:
            return yolo_count
        # Blend: 40% YOLO + 60% CSRNet
        if self.csrnet_zone_density > 0:
            blended = 0.4 * yolo_count + 0.6 * self.csrnet_zone_density
            return max(yolo_count, int(blended))
        return yolo_count

    @property
    def density_score(self) -> float:
        if self.area < 1:
            return 0.0
        # 1 pixel ≈ 0.05m -> 1 sq pixel ≈ 0.0025 sq m. Critical density is ~4 people/sq m.
        # Max capacity for area = self.area * 0.0025 * 4 = self.area * 0.01
        # Adjusted sensitivity: halfway between 0.0005 (too sensitive) and 0.0015 (too forgiving).
        # New capacity factor: 0.0010
        return min(1.0, self.hybrid_count / (self.area * 0.0010))

    @property
    def occupancy_percent(self) -> float:
        return self.density_score * 100.0

    @property
    def avg_speed(self) -> float:
        if not self.active_tracks:
            return 0.0
        speeds = [t.speed for t in self.active_tracks.values()]
        # Approx: 1 pixel ≈ 0.05 m, 5 fps → ×0.25 m/s per pixel/frame
        return round(sum(speeds) / len(speeds) * 0.05, 3)

    @property
    def dwell_time(self) -> float:
        if not self.active_tracks:
            return 0.0
        return sum(t.frames_in_zone for t in self.active_tracks.values()) / len(self.active_tracks)

    @property
    def mean_velocity(self) -> Tuple[float, float]:
        if not self.active_tracks:
            return (0.0, 0.0)
        vx = sum(t.velocity[0] for t in self.active_tracks.values()) / len(self.active_tracks)
        vy = sum(t.velocity[1] for t in self.active_tracks.values()) / len(self.active_tracks)
        return (vx, vy)

    @property
    def trend(self) -> str:
        counts = list(self.frame_counts)
        if len(counts) < 10:
            return "stable"
        recent = sum(counts[-5:]) / 5
        prior = sum(counts[-10:-5]) / 5
        if recent > prior * 1.1:
            return "rising"
        if recent < prior * 0.9:
            return "falling"
        return "stable"

    @property
    def flow_direction(self) -> str:
        vx, vy = self.mean_velocity
        speed = math.sqrt(vx ** 2 + vy ** 2)
        if speed < 0.3:
            return "stationary"
        # Count inbound vs outbound based on direction_rule
        rule = self.config.direction_rule
        if rule == "entry_only":
            return "inbound" if vx > 0 else "inbound-heavy"
        if rule == "exit_only":
            return "outbound" if vx < 0 else "outbound-heavy"
        # Check for opposing flow
        vxs = [t.velocity[0] for t in self.active_tracks.values()]
        if len(vxs) > 4:
            pos = sum(1 for v in vxs if v > 0.2)
            neg = sum(1 for v in vxs if v < -0.2)
            if pos > 2 and neg > 2:
                return "opposing"
        if vx > 0.5:
            return "inbound-heavy"
        if vx < -0.5:
            return "outbound-heavy"
        return "bidirectional"


# ─── Zone Engine ──────────────────────────────────────────────────────────────

class ZoneEngine:
    """
    Assigns bounding boxes from a detection frame to polygon zones,
    maintains per-zone state, and provides current snapshots.

    Refined with:
      - Entry/exit counting per zone
      - Temporal smoothing integration
      - Cross-zone track migration detection
      - Hybrid YOLO + CSRNet density integration
    """

    def __init__(self, zone_configs: Optional[List[ZoneConfig]] = None):
        configs = zone_configs or load_zone_configs()
        self.config = configs
        self.zones: Dict[str, ZoneState] = {z.zone_id: ZoneState(z) for z in configs}
        self._smoother = TemporalSmoother(window=10)

        # ── Cross-zone tracking (Refinement #9) ──
        # track_id → zone_id (last known zone for each tracked person)
        self._track_zone_map: Dict[int, str] = {}

    def process_frame(self, frame: DetectionFrame, csrnet_density_map=None, csrnet_engine=None):
        """
        Assign boxes to zones and update zone states.
        
        Args:
            frame: Detection frame with bounding boxes
            csrnet_density_map: Optional CSRNet density map for hybrid counting
            csrnet_engine: Optional CSRNetEngine instance for zone-level density
        """
        # ── Update CSRNet zone densities (Refinement #7) ─────────────────
        if csrnet_density_map is not None and csrnet_engine is not None:
            for zone_id, state in self.zones.items():
                state.csrnet_zone_density = csrnet_engine.get_zone_density(
                    csrnet_density_map, state.config.polygon
                )

        # ── Group tracks per zone ────────────────────────────────────────
        zone_tracks: Dict[str, List[Tuple[int, float, float]]] = {zid: [] for zid in self.zones}

        # Frame dimensions for converting normalized coords → pixel coords
        FRAME_W, FRAME_H = 1280, 720

        for i, box in enumerate(frame.boxes):
            cx_norm, cy_norm = centroid_of_box(box)
            # Scale normalized (0–1) coordinates to pixel space to match zone polygons
            cx = cx_norm * FRAME_W
            cy = cy_norm * FRAME_H
            tid = box.track_id if box.track_id is not None else -(i + 1)
            for zone_id, state in self.zones.items():
                if point_in_polygon(cx, cy, state.config.polygon):
                    zone_tracks[zone_id].append((tid, cx, cy))

                    # ── Cross-zone entry/exit detection ──────────────────
                    prev_zone = self._track_zone_map.get(tid)
                    if prev_zone and prev_zone != zone_id:
                        # Person migrated from prev_zone → zone_id
                        if prev_zone in self.zones:
                            self.zones[prev_zone].exit_count += 1
                        state.entry_count += 1
                    self._track_zone_map[tid] = zone_id
                    break  # person assigned to first matching zone

        # ── Update zone states ───────────────────────────────────────────
        for zone_id, tracks in zone_tracks.items():
            self.zones[zone_id].update(tracks)

            # ── Apply temporal smoothing (Refinement #4) ─────────────────
            state = self.zones[zone_id]
            s_count, s_density, s_occ = self._smoother.smooth(
                zone_id,
                state.people_count,
                state.density_score,
                state.occupancy_percent,
            )
            state.smoothed_count = s_count
            state.smoothed_density = s_density
            state.smoothed_occupancy = s_occ

        # ── Clean up stale track→zone mappings ───────────────────────────
        active_tids = {box.track_id for box in frame.boxes if box.track_id is not None}
        stale = [tid for tid in self._track_zone_map if tid not in active_tids]
        for tid in stale:
            del self._track_zone_map[tid]

    def get_all_states(self) -> Dict[str, ZoneState]:
        return self.zones

    def get_density_history(self, zone_id: str) -> List[DensityPoint]:
        state = self.zones.get(zone_id)
        if not state:
            return []
        return list(state.density_history)
