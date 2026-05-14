"""
IntelliCrowd — Detection Module
Handles person detection via YOLOv8 or simulated crowd data.
Falls back to simulation mode automatically if YOLO/video unavailable.
"""
from __future__ import annotations
import random
import time
import math
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


# ─── Real video pipeline (optional) ──────────────────────────────────────────

class VideoDetector:
    """
    Real video detection using OpenCV + YOLOv8.
    Falls back to SimulatedCrowdEngine if unavailable.
    """

    def __init__(
        self,
        source: Optional[str] = None,
        model_path: str = "yolov8l.pt",
        fps: int = 5,
        camera_id: str = "cam_01",
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
        self._latest_frame = None  # NEW: Store latest DetectionFrame

        if source and CV2_AVAILABLE:
            try:
                src = int(source) if source.isdigit() else source
                cap = cv2.VideoCapture(src)
                if cap.isOpened():
                    self._cap = cap
                    if YOLO_AVAILABLE:
                        try:
                            self._model = YOLO(model_path)
                            self._real = True
                            print(f"[detection] Real pipeline active: {source}")
                        except Exception as e:
                            print(f"[detection] YOLO load failed: {e} — using simulation")
                    else:
                        print("[detection] YOLO not available — using simulation")
                else:
                    print(f"[detection] Cannot open source {source} — using simulation")
            except Exception as e:
                print(f"[detection] Source error: {e} — using simulation")
        else:
            print("[detection] No source configured — simulation mode")

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

        # Run CSRNet first (as it might take longer on CPU)
        self._latest_density_map = self._csrnet.predict_density(frame)
        if self._latest_density_map is not None:
            self._latest_heatmap = self._csrnet.render_heatmap(self._latest_density_map)

        # Use YOLO tracking with optimized parameters for dense crowds
        results = self._model.track(
            frame, 
            classes=[0], 
            imgsz=1280, 
            conf=0.10, 
            persist=True, 
            verbose=False
        )[0]
        boxes: List[BoundingBox] = []
        H, W = frame.shape[:2]
        for i, box in enumerate(results.boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            tid = int(box.id[0]) if box.id is not None else i
            boxes.append(BoundingBox(
                x1=x1 / W, 
                y1=y1 / H, 
                x2=x2 / W, 
                y2=y2 / H, 
                confidence=conf, 
                track_id=tid
            ))

        self._latest_frame = DetectionFrame(
            frame_id=0,
            timestamp=datetime.now(timezone.utc),
            camera_id=self.camera_id,
            boxes=boxes,
        )
        return self._latest_frame

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
            ret, frame = self._cap.read()
            if not ret:
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
