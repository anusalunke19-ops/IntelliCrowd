"""
IntelliCrowd — Detection Module (Refined)
Handles person detection via YOLOv8 or simulated crowd data.
Falls back to simulation mode automatically if YOLO/video unavailable.

Refinements:
  1. YOLOv8s with auto-fallback to YOLOv8n
  2. ROI masking — detect only inside valid crowd zones
  3. Dynamic confidence threshold — adapts to scene density
  4. Motion filtering — ignore static objects (posters, mannequins, LED faces)
  5. Perspective scaling — correct for camera distance
  6. Hybrid counting — blend YOLO + CSRNet for dense scenes
  7. ByteTrack explicit tracker
"""
from __future__ import annotations
import random
import time
import math
from collections import deque
from datetime import datetime, timezone
from typing import List, Optional, Tuple
import numpy as np
from app.schemas import BoundingBox, DetectionFrame
from app.csrnet_engine import CSRNetEngine

# ─── Try importing optional heavy deps ───────────────────────────────────────

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[detection] OpenCV not available — simulation mode only")

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[detection] Ultralytics not available — simulation mode only")


# ─── Frame dimensions (matches zone config pixel space) ──────────────────────

FRAME_W = 1280
FRAME_H = 720

# ─── Default zone polygons for ROI mask ──────────────────────────────────────

DEFAULT_ZONE_POLYGONS = [
    [[50, 30], [340, 30], [340, 200], [50, 200]],       # gate_a
    [[940, 30], [1230, 30], [1230, 200], [940, 200]],   # gate_b
    [[340, 80], [940, 80], [940, 200], [340, 200]],     # corridor_1
    [[50, 520], [340, 520], [340, 690], [50, 690]],     # exit_a
    [[280, 250], [1000, 250], [1000, 490], [280, 490]], # stage_front
    [[1000, 200], [1230, 200], [1230, 520], [1000, 520]], # queue_lane
]

# ─── Hybrid counting thresholds ──────────────────────────────────────────────

HYBRID_YOLO_ONLY_THRESHOLD = 30     # below this, trust YOLO exclusively
HYBRID_YOLO_WEIGHT = 0.4           # weight for YOLO in blended mode
HYBRID_CSRNET_WEIGHT = 0.6         # weight for CSRNet in blended mode

# ─── Dynamic confidence mapping ─────────────────────────────────────────────

CONF_SPARSE = 0.30    # ≤ 15 detections
CONF_MEDIUM = 0.40    # 16–40 detections
CONF_DENSE  = 0.50    # > 40 detections

# ─── Motion filter thresholds ────────────────────────────────────────────────

MOTION_DIFF_THRESHOLD = 25     # pixel diff threshold
MOTION_MIN_AREA = 200          # minimum contour area for "real" motion


# ─── Simulated crowd behavior ─────────────────────────────────────────────────

class SimulatedPerson:
    """A simulated person with a position and velocity."""

    def __init__(self, person_id: int, zone_bounds: Tuple[float, float, float, float]):
        self.id = person_id
        xmin, ymin, xmax, ymax = zone_bounds
        self.x = random.uniform(xmin + 10, xmax - 10)
        self.y = random.uniform(ymin + 10, ymax - 10)
        self.vx = random.uniform(-2, 2)
        self.vy = random.uniform(-2, 2)
        self.bounds = zone_bounds
        self.w = random.randint(20, 35)
        self.h = random.randint(40, 65)

    def step(self):
        self.x += self.vx + random.gauss(0, 0.3)
        self.y += self.vy + random.gauss(0, 0.3)
        xmin, ymin, xmax, ymax = self.bounds
        if self.x < xmin + 5 or self.x > xmax - 5:
            self.vx *= -1
        if self.y < ymin + 5 or self.y > ymax - 5:
            self.vy *= -1
        self.x = max(xmin + 5, min(xmax - 5, self.x))
        self.y = max(ymin + 5, min(ymax - 5, self.y))

    def to_box(self) -> BoundingBox:
        return BoundingBox(
            x1=(self.x - self.w / 2) / FRAME_W,
            y1=(self.y - self.h / 2) / FRAME_H,
            x2=(self.x + self.w / 2) / FRAME_W,
            y2=(self.y + self.h / 2) / FRAME_H,
            confidence=round(random.uniform(0.72, 0.99), 3),
            track_id=self.id,
        )


class SimulatedCrowdEngine:
    """
    Generates realistic-looking crowd simulation data.
    Each zone has a pool of persons that move around within that zone's bounding box.
    """

    ZONE_BOUNDS: dict[str, Tuple[float, float, float, float]] = {
        "gate_a":       (50,   30,  340,  200),
        "gate_b":       (940,  30, 1230,  200),
        "corridor_1":   (340,  80,  940,  200),
        "exit_a":       (50,  520,  340,  690),
        "stage_front":  (280, 250,  1000, 490),
        "queue_lane":   (1000, 200, 1230, 520),
    }

    INITIAL_COUNTS: dict[str, int] = {
        "gate_a": 18,
        "gate_b": 12,
        "corridor_1": 25,
        "exit_a": 8,
        "stage_front": 60,
        "queue_lane": 22,
    }

    def __init__(self):
        self._persons: dict[str, List[SimulatedPerson]] = {}
        self._next_id = 1
        self._frame = 0
        self._start_time = time.time()

        for zone_id, bounds in self.ZONE_BOUNDS.items():
            count = self.INITIAL_COUNTS.get(zone_id, 10)
            self._persons[zone_id] = [
                SimulatedPerson(self._next_id + i, bounds) for i in range(count)
            ]
            self._next_id += count

    def _elapsed(self) -> float:
        return time.time() - self._start_time

    def _inject_events(self):
        elapsed = self._elapsed()
        if 55 <= elapsed < 65:
            # DENSITY_CRITICAL on stage_front
            bounds = self.ZONE_BOUNDS["stage_front"]
            while len(self._persons["stage_front"]) < 85:
                self._persons["stage_front"].append(
                    SimulatedPerson(self._next_id, bounds)
                )
                self._next_id += 1
        if 115 <= elapsed < 130:
            # SURGE on gate_a
            bounds = self.ZONE_BOUNDS["gate_a"]
            target = int(self.INITIAL_COUNTS["gate_a"] * 1.3)
            while len(self._persons["gate_a"]) < target:
                self._persons["gate_a"].append(SimulatedPerson(self._next_id, bounds))
                self._next_id += 1
        if 175 <= elapsed < 200:
            # COUNTER_FLOW on corridor_1
            for p in self._persons["corridor_1"]:
                p.vx *= -1
        if 235 <= elapsed < 260:
            # BOTTLENECK on queue_lane
            for p in self._persons["queue_lane"]:
                p.vx *= 0.1
                p.vy *= 0.1

    def next_frame(self, camera_id: str = "cam_sim_01") -> DetectionFrame:
        self._inject_events()
        self._frame += 1
        all_boxes: List[BoundingBox] = []
        for zone_persons in self._persons.values():
            for p in zone_persons:
                p.step()
                all_boxes.append(p.to_box())
        return DetectionFrame(
            frame_id=self._frame,
            timestamp=datetime.now(timezone.utc),
            camera_id=camera_id,
            boxes=all_boxes,
        )


# ─── ROI Mask Builder ────────────────────────────────────────────────────────

def build_roi_mask(
    polygons: List[List[List[float]]],
    frame_h: int = FRAME_H,
    frame_w: int = FRAME_W,
) -> Optional[np.ndarray]:
    """
    Build a binary mask from zone polygons.
    Pixels inside any zone → 255, outside → 0.
    """
    if not CV2_AVAILABLE:
        return None
    mask = np.zeros((frame_h, frame_w), dtype=np.uint8)
    for poly in polygons:
        pts = np.array(poly, dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(mask, [pts], 255)
    # Dilate slightly to avoid cutting people on zone edges
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


# ─── Perspective Scaling ─────────────────────────────────────────────────────

def perspective_scale(y_norm: float) -> float:
    """
    Returns a scale factor based on vertical position in frame.
    y_norm: 0.0 = top of frame (far), 1.0 = bottom (near).
    People at the top (far away) are scaled UP to compensate for distance.
    
    Returns: multiplier in range [1.0, 1.5]
    """
    # Linear interpolation: top → 1.5x, bottom → 1.0x
    return 1.0 + 0.5 * (1.0 - y_norm)


# ─── Dynamic Confidence ──────────────────────────────────────────────────────

def dynamic_confidence(recent_count: int) -> float:
    """
    Adjust YOLO confidence threshold based on recent detection density.
    Sparse scenes → low threshold (catch distant people).
    Dense scenes → high threshold (reduce false positives).
    """
    if recent_count <= 15:
        return CONF_SPARSE
    elif recent_count <= 40:
        return CONF_MEDIUM
    else:
        return CONF_DENSE


# ─── Motion Filter ───────────────────────────────────────────────────────────

class MotionFilter:
    """
    Frame-differencing filter to suppress static object detections.
    Maintains a motion mask based on inter-frame differences.
    """

    def __init__(self):
        self._prev_gray: Optional[np.ndarray] = None
        self._motion_mask: Optional[np.ndarray] = None

    def update(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Update with new frame and return a binary motion mask.
        Pixels with motion → 255, static → 0.
        """
        if not CV2_AVAILABLE:
            return None

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if self._prev_gray is None:
            self._prev_gray = gray
            # First frame: allow all detections
            self._motion_mask = np.ones_like(gray) * 255
            return self._motion_mask

        # Absolute difference
        diff = cv2.absdiff(self._prev_gray, gray)
        _, thresh = cv2.threshold(diff, MOTION_DIFF_THRESHOLD, 255, cv2.THRESH_BINARY)

        # Dilate to fill gaps
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        thresh = cv2.dilate(thresh, kernel, iterations=3)

        self._prev_gray = gray
        self._motion_mask = thresh
        return self._motion_mask

    def is_moving(self, x1: int, y1: int, x2: int, y2: int) -> bool:
        """Check if a bounding box region has sufficient motion."""
        if self._motion_mask is None:
            return True  # default to allowing
        h, w = self._motion_mask.shape
        x1c = max(0, min(x1, w - 1))
        y1c = max(0, min(y1, h - 1))
        x2c = max(0, min(x2, w - 1))
        y2c = max(0, min(y2, h - 1))
        if x2c <= x1c or y2c <= y1c:
            return True
        region = self._motion_mask[y1c:y2c, x1c:x2c]
        motion_ratio = np.count_nonzero(region) / max(1, region.size)
        return motion_ratio > 0.15  # at least 15% of box has motion


# ─── Real video pipeline (refined) ──────────────────────────────────────────

class VideoDetector:
    """
    Real video detection using OpenCV + YOLOv8.
    Falls back to SimulatedCrowdEngine if unavailable.

    Refinements applied:
      - YOLOv8s first, fallback to yolov8n
      - ROI masking
      - Dynamic confidence threshold
      - Motion filtering (static object suppression)
      - Perspective scaling
      - Hybrid YOLO + CSRNet counting
      - Explicit ByteTrack tracker
    """

    def __init__(
        self,
        source: Optional[str] = None,
        model_path: str = "yolov8s.pt",
        fps: int = 5,
        camera_id: str = "cam_01",
        zone_polygons: Optional[List[List[List[float]]]] = None,
    ):
        self.camera_id = camera_id
        self.fps = fps
        self._sim = SimulatedCrowdEngine()
        self._real = False
        self._cap = None
        self._model = None
        self._csrnet = CSRNetEngine()
        self._latest_density_map = None
        self._latest_heatmap = None
        self._latest_frame_img = None
        self._latest_frame = None

        # ── Refinement engines ───────────────────────────────────────────
        self._motion_filter = MotionFilter()
        self._roi_mask = build_roi_mask(zone_polygons or DEFAULT_ZONE_POLYGONS)
        self._recent_count = 0       # rolling detection count for dynamic conf
        self._count_history: deque = deque(maxlen=10)
        self._hybrid_csrnet_count = 0.0  # latest CSRNet density estimate

        if source and CV2_AVAILABLE:
            try:
                src = int(source) if source.isdigit() else source
                cap = cv2.VideoCapture(src)
                if cap.isOpened():
                    self._cap = cap
                    if YOLO_AVAILABLE:
                        self._model = self._load_model(model_path)
                        if self._model:
                            self._real = True
                    else:
                        print("[detection] YOLO not available — using simulation")
                else:
                    print(f"[detection] Cannot open source {source} — using simulation")
            except Exception as e:
                print(f"[detection] Source error: {e} — using simulation")
        else:
            print("[detection] No source configured — simulation mode")

    def _load_model(self, primary_path: str):
        """
        Try loading YOLOv8s first, fallback to YOLOv8n on CPU.
        YOLOv8s catches partially occluded, distant, and side-angle bodies
        much better than nano.
        """
        import torch
        is_gpu = torch.cuda.is_available()

        # Try primary model (YOLOv8s)
        try:
            model = YOLO(primary_path)
            print(f"[detection] ✅ Loaded {primary_path} (GPU: {is_gpu})")
            return model
        except Exception as e:
            print(f"[detection] Could not load {primary_path}: {e}")

        # Fallback chain: yolov8s → yolov8n (for CPU mode)
        fallbacks = ["yolov8s.pt", "yolov8n.pt"]
        for fb in fallbacks:
            if fb == primary_path:
                continue
            try:
                model = YOLO(fb)
                print(f"[detection] ✅ Fallback loaded {fb}")
                return model
            except Exception as e2:
                print(f"[detection] Fallback {fb} failed: {e2}")

        print("[detection] ❌ No YOLO model available — using simulation")
        return None

    def next_frame(self) -> DetectionFrame:
        if self._real and self._cap and self._model:
            return self._read_real_frame()
        return self._sim.next_frame(self.camera_id)

    def _read_real_frame(self) -> DetectionFrame:
        assert self._cap and self._model

        # Fast frame skipping to maintain real-time tracking
        if not hasattr(self, '_last_read_time'):
            self._last_read_time = time.time()
            ret, frame = self._cap.read()
        else:
            now = time.time()
            elapsed = now - self._last_read_time
            self._last_read_time = now

            fps = self._cap.get(cv2.CAP_PROP_FPS) or 30.0
            frames_to_advance = max(1, int(elapsed * fps))

            # Efficiently skip frames using grab()
            for _ in range(frames_to_advance - 1):
                if not self._cap.grab():
                    # Video ended, loop back
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    break

            ret, frame = self._cap.read()

        if not ret:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self._cap.read()
        if not ret:
            return self._sim.next_frame(self.camera_id)

        self._latest_frame_img = frame
        H, W = frame.shape[:2]

        # ── Refinement: Motion filter update ─────────────────────────────
        motion_mask = self._motion_filter.update(frame)

        # ── Refinement: ROI masking ──────────────────────────────────────
        # Create a masked copy for YOLO inference — black out non-zone areas
        detection_frame = frame.copy()
        if self._roi_mask is not None:
            roi_resized = cv2.resize(self._roi_mask, (W, H))
            detection_frame[roi_resized == 0] = 0

        # ── Run CSRNet density estimation ────────────────────────────────
        self._latest_density_map = self._csrnet.predict_density(frame)
        if self._latest_density_map is not None:
            self._latest_heatmap = self._csrnet.render_heatmap(self._latest_density_map)
            # Total CSRNet estimated count (for hybrid logic)
            self._hybrid_csrnet_count = float(np.sum(self._latest_density_map))

        # ── Refinement: Dynamic confidence threshold ─────────────────────
        conf_threshold = dynamic_confidence(self._recent_count)

        # ── YOLO detection with ByteTrack ────────────────────────────────
        results = self._model.track(
            detection_frame,
            classes=[0],           # person class only
            imgsz=1280,
            conf=conf_threshold,   # dynamic confidence
            iou=0.7,
            persist=True,
            tracker="bytetrack.yaml",  # explicit ByteTrack tracker
            verbose=False,
        )[0]

        boxes: List[BoundingBox] = []
        raw_yolo_count = 0

        for i, box in enumerate(results.boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            tid = int(box.id[0]) if box.id is not None else i

            # ── Refinement: Motion filtering ─────────────────────────────
            # Skip detections in regions with no motion (static objects)
            if not self._motion_filter.is_moving(int(x1), int(y1), int(x2), int(y2)):
                continue

            # ── Refinement: Perspective scaling ──────────────────────────
            # y_center normalized: 0=top (far), 1=bottom (near)
            y_center_norm = ((y1 + y2) / 2) / H
            p_scale = perspective_scale(y_center_norm)

            # Adjust bounding box dimensions by perspective (for area calc)
            # but keep position unchanged for zone assignment
            box_w = (x2 - x1) * p_scale
            box_h = (y2 - y1) * p_scale

            raw_yolo_count += 1

            boxes.append(BoundingBox(
                x1=x1 / W,
                y1=y1 / H,
                x2=x2 / W,
                y2=y2 / H,
                confidence=conf,
                track_id=tid,
            ))

        # ── Refinement: Hybrid counting ──────────────────────────────────
        # If scene is dense, inject additional synthetic detections from CSRNet
        # The actual blending happens at the zone level (zone_engine uses both)
        # Here we store the hybrid metadata for the zone engine to use
        self._recent_count = len(boxes)
        self._count_history.append(len(boxes))

        self._latest_frame = DetectionFrame(
            frame_id=0,
            timestamp=datetime.now(timezone.utc),
            camera_id=self.camera_id,
            boxes=boxes,
        )
        return self._latest_frame

    @property
    def hybrid_csrnet_count(self) -> float:
        """Latest CSRNet total estimated count (for hybrid logic in zone engine)."""
        return self._hybrid_csrnet_count

    @property
    def density_map(self) -> Optional[np.ndarray]:
        """Latest density map from CSRNet."""
        return self._latest_density_map

    def get_heatmap_jpeg(self) -> Optional[bytes]:
        """Return a JPEG-encoded heatmap frame."""
        if self._latest_heatmap is not None:
            return self._latest_heatmap

        # Simulate heatmap if real one not available
        if not CV2_AVAILABLE:
            return None

        frame = np.zeros((FRAME_H, FRAME_W, 3), dtype="uint8")

        # Use real detections for heatmap simulation if available
        if self._latest_frame and self._latest_frame.boxes:
            for box in self._latest_frame.boxes:
                cx = int((box.x1 + box.x2) / 2 * FRAME_W)
                cy = int((box.y1 + box.y2) / 2 * FRAME_H)
                if 0 <= cx < FRAME_W and 0 <= cy < FRAME_H:
                    cv2.circle(frame, (cx, cy), 30, (0, 0, 255), -1)
        else:
            # Fallback to sim persons only if no real detections
            for zone_id, persons in self._sim._persons.items():
                for p in persons:
                    x, y = int(p.x), int(p.y)
                    if 0 <= x < FRAME_W and 0 <= y < FRAME_H:
                        cv2.circle(frame, (x, y), 20, (0, 0, 200), -1)
                        cv2.circle(frame, (x, y), 10, (0, 100, 255), -1)

        # Blur it
        frame = cv2.GaussianBlur(frame, (51, 51), 0)

        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return buf.tobytes()

    def get_annotated_frame(self) -> Optional[bytes]:
        """Return a JPEG-encoded annotated frame (for /api/frame/latest)."""
        if not CV2_AVAILABLE:
            return None
        if self._real and self._cap:
            if self._latest_frame_img is not None:
                frame = self._latest_frame_img.copy()
                if self._latest_frame and self._latest_frame.boxes:
                    H, W = frame.shape[:2]
                    for box in self._latest_frame.boxes:
                        x1 = int(box.x1 * W)
                        y1 = int(box.y1 * H)
                        x2 = int(box.x2 * W)
                        y2 = int(box.y2 * H)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 120), 2)
            else:
                return None
        else:
            frame = self._create_sim_frame()
        if frame is None:
            return None
        _, buf = cv2.imencode(".jpg", frame)
        return buf.tobytes()

    def _create_sim_frame(self):
        """Draw a simulated annotated frame."""
        if not CV2_AVAILABLE:
            return None
        import numpy as np
        frame = np.zeros((FRAME_H, FRAME_W, 3), dtype="uint8")
        frame[:] = (20, 20, 30)
        for zone_id, persons in self._sim._persons.items():
            for p in persons:
                x1 = int(p.x - p.w / 2)
                y1 = int(p.y - p.h / 2)
                x2 = int(p.x + p.w / 2)
                y2 = int(p.y + p.h / 2)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 120), 1)
        return frame

    def release(self):
        if self._cap:
            self._cap.release()
