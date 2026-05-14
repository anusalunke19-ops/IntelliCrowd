"""
IntelliCrowd — Pydantic v2 Schemas
All data models shared across the pipeline.
"""
from __future__ import annotations
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field
import uuid


# ─── Geometry ────────────────────────────────────────────────────────────────

class Point(BaseModel):
    x: float
    y: float


# ─── Zone Configuration ───────────────────────────────────────────────────────

class ZoneConfig(BaseModel):
    zone_id: str
    label: str
    type: Literal["entry", "exit", "transit", "open_area", "queue", "muster"] = "open_area"
    polygon: List[List[float]]          # [[x,y], ...]
    capacity: int
    warning_threshold: float = 0.60
    critical_threshold: float = 0.85
    direction_rule: Optional[str] = None   # "entry_only", "exit_only", "bidirectional"
    multiplier: float = 1.0                # Extrapolation factor for headcounts
    roi_polygon: Optional[List[List[float]]] = None  # Optional ROI mask override


# ─── Detection ────────────────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    track_id: Optional[int] = None

    @property
    def centroid(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)


class DetectionFrame(BaseModel):
    frame_id: int
    timestamp: datetime
    camera_id: str
    boxes: List[BoundingBox]


# ─── Zone Metrics ─────────────────────────────────────────────────────────────

class MovementVector(BaseModel):
    dx: float
    dy: float
    speed: float          # pixels/frame


class DensityPoint(BaseModel):
    timestamp: datetime
    count: int
    density_score: float
    occupancy_percent: float


class ZoneMetrics(BaseModel):
    zone_id: str
    label: str
    polygon: List[List[float]]
    people_count: int
    capacity: int
    occupancy_percent: float
    density_score: float               # 0–1
    avg_speed: float                   # m/s approximated
    dwell_time: float                  # mean frames in zone
    flow_direction: Literal[
        "inbound", "outbound", "inbound-heavy",
        "outbound-heavy", "bidirectional", "opposing", "stationary"
    ]
    risk_level: Literal["safe", "warning", "critical"]
    risk_score: float                  # 0–100
    trend: Literal["rising", "stable", "falling"]
    reason: List[str]
    recommended_action: str
    timestamp: datetime
    density_history: List[DensityPoint] = Field(default_factory=list)

    # ── Entry/Exit tracking (Refinement #9) ──
    entry_count: int = 0
    exit_count: int = 0
    net_flow: int = 0                  # entry - exit

    # ── Temporal smoothing (Refinement #4) ──
    smoothed_count: int = 0
    smoothed_occupancy: float = 0.0

    # ── Predictive analytics (Refinement #10) ──
    prediction: Optional[str] = None
    predicted_time_to_critical: Optional[float] = None
    rate_of_change: Optional[float] = None     # %/min


# ─── Alerts ───────────────────────────────────────────────────────────────────

AlertType = Literal[
    "DENSITY_CRITICAL",
    "SURGE_DETECTED",
    "COUNTER_FLOW",
    "BOTTLENECK",
    "CROWD_STOP",
    "CLUSTER_DETECTED",
    "PREDICTIVE_WARNING",
]

AlertSeverity = Literal["P1", "P2", "P3"]
AlertStatus = Literal["open", "acknowledged", "escalated", "resolved"]


class Alert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: AlertType
    zone_id: str
    severity: AlertSeverity
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    message: str
    recommended_action: str
    status: AlertStatus = "open"


# ─── Incidents ────────────────────────────────────────────────────────────────

IncidentType = Literal["Overcrowding", "Medical", "Evacuation", "Security"]
IncidentStatus = Literal["Open", "Responding", "Resolved"]


class TimelineEntry(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    action: str
    actor: str = "System"


class IncidentCreate(BaseModel):
    type: IncidentType
    affected_zones: List[str]
    severity: AlertSeverity
    assigned_responder: str
    notes: Optional[str] = None


class Incident(BaseModel):
    incident_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: IncidentType
    affected_zones: List[str]
    severity: AlertSeverity
    assigned_responder: str
    status: IncidentStatus = "Open"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None
    timeline: List[TimelineEntry] = Field(default_factory=list)


# ─── Global Status ────────────────────────────────────────────────────────────

class GlobalStatus(BaseModel):
    safe_zones: int
    warning_zones: int
    critical_zones: int
    total_people: int
    overall_risk: Literal["SAFE", "ELEVATED", "CRITICAL"]


# ─── WebSocket Payload ────────────────────────────────────────────────────────

class LivePayload(BaseModel):
    camera_id: str
    timestamp: datetime
    zones: List[ZoneMetrics]
    global_status: GlobalStatus
    active_alerts: List[Alert]
    heatmap_available: bool = False
    detections: List[BoundingBox] = []
    incidents: List[Incident] = []
    predictions: List[dict] = Field(default_factory=list)  # Zone predictions


# ─── Camera Config ────────────────────────────────────────────────────────────

class CameraConfig(BaseModel):
    camera_id: str
    label: str
    source: str          # file path or webcam index string
    fps: int = 5
    active: bool = True
