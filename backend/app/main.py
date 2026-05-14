"""
IntelliCrowd — FastAPI Main (Refined)
WebSocket + REST API for the crowd intelligence pipeline.

Wires together all refined engines:
  - VideoDetector (YOLOv8s, ROI, dynamic conf, motion filter, perspective, hybrid)
  - ZoneEngine (entry/exit counting, temporal smoothing, hybrid CSRNet)
  - PredictionEngine (linear extrapolation, time-to-critical)
  - AlertEngine (with PREDICTIVE_WARNING)
"""
from __future__ import annotations
import asyncio
import json
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import tempfile
import shutil

from app.schemas import (
    Alert, AlertStatus, CameraConfig, GlobalStatus, Incident,
    IncidentCreate, LivePayload, ZoneMetrics, ZoneConfig, BoundingBox
)
from app.detection import VideoDetector, CV2_AVAILABLE
from app.zone_engine import ZoneEngine, load_zone_configs
from app.metrics_engine import build_all_metrics
from app.risk_engine import classify_global_risk, top_risk_zones
from app.alert_engine import AlertEngine
from app.prediction_engine import PredictionEngine

# Rebuild models to resolve forward references
LivePayload.model_rebuild()
ZoneMetrics.model_rebuild()
Incident.model_rebuild()

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="IntelliCrowd API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pipeline state (global singletons) ──────────────────────────────────────

zone_configs = load_zone_configs()

# Extract zone polygons for ROI masking
_zone_polygons = [z.polygon for z in zone_configs]

# Auto-recover last uploaded video if it exists
_temp_dir = Path(tempfile.gettempdir()) / "intellicrowd"
_default_src = None
if _temp_dir.exists():
    _mp4s = list(_temp_dir.glob("*.mp4")) + list(_temp_dir.glob("*.mov"))
    if _mp4s:
        # Sort by modification time to get the latest
        _mp4s.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        _default_src = str(_mp4s[0])

detector = VideoDetector(
    source=_default_src,
    camera_id="cam_entrance_01",
    zone_polygons=_zone_polygons,       # ROI masking from zone config
)
zone_engine = ZoneEngine(zone_configs)
alert_engine = AlertEngine()
prediction_engine = PredictionEngine(history_len=30)  # Refinement #10

# In-memory stores
_ws_clients: List[WebSocket] = []
_alert_history: List[Alert] = []
_incidents: Dict[str, Incident] = {}
_latest_metrics: List[ZoneMetrics] = []
_latest_payload: Optional[LivePayload] = None


# ─── Background pipeline loop ─────────────────────────────────────────────────

async def pipeline_loop():
    """Runs detection → zone assignment → metrics → alerting every 0.3 seconds."""
    global _latest_metrics, _latest_payload

    while True:
        try:
            print(f"[pipeline] Processing frame (Real: {detector._real})...", flush=True)
            frame = detector.next_frame()

            # ── Zone assignment with CSRNet hybrid integration ───────────
            print(f"[pipeline] Zone assignment...", flush=True)
            zone_engine.process_frame(
                frame,
                csrnet_density_map=detector.density_map,
                csrnet_engine=detector._csrnet,
            )

            # ── Build metrics with prediction engine ─────────────────────
            print(f"[pipeline] Building metrics...", flush=True)
            metrics = build_all_metrics(
                zone_engine.get_all_states(),
                prediction_engine=prediction_engine,
            )

            # ── Process alerts with prediction awareness ─────────────────
            print(f"[pipeline] Processing alerts...", flush=True)
            new_alerts = alert_engine.process(metrics, prediction_engine=prediction_engine)
            for a in new_alerts:
                _alert_history.append(a)

            overall_risk = classify_global_risk(metrics)
            global_status = GlobalStatus(
                safe_zones=sum(1 for m in metrics if m.risk_level == "safe"),
                warning_zones=sum(1 for m in metrics if m.risk_level == "warning"),
                critical_zones=sum(1 for m in metrics if m.risk_level == "critical"),
                total_people=sum(m.people_count for m in metrics),
                overall_risk=overall_risk,
            )

            # ── Build predictions summary for payload ────────────────────
            predictions_summary = []
            for pred in prediction_engine.get_all_predictions().values():
                predictions_summary.append({
                    "zone_id": pred.zone_id,
                    "label": pred.label,
                    "rate_per_minute": pred.rate_per_minute,
                    "predicted_time_to_critical": pred.predicted_time_to_critical,
                    "prediction_text": pred.prediction_text,
                    "current_occupancy": pred.current_occupancy,
                })

            payload = LivePayload(
                camera_id="cam_entrance_01",
                timestamp=datetime.now(timezone.utc),
                zones=metrics,
                global_status=global_status,
                active_alerts=alert_engine.open_alerts()[-20:],
                heatmap_available=detector._latest_heatmap is not None or not CV2_AVAILABLE,
                detections=frame.boxes,
                incidents=list(_incidents.values()),
                predictions=predictions_summary,
                clusters=detector._latest_clusters,
            )
            _latest_metrics = metrics
            _latest_payload = payload

            # Broadcast to all connected WebSocket clients
            dead = []
            for ws in _ws_clients:
                try:
                    await ws.send_text(payload.model_dump_json())
                    print(f"[pipeline] Sent update to client", flush=True)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                _ws_clients.remove(ws)

        except Exception as e:
            import traceback
            print(f"[pipeline] Error: {e}")
            traceback.print_exc()

        await asyncio.sleep(0.3)


@app.on_event("startup")
async def startup():
    asyncio.create_task(pipeline_loop())


# ─── WebSocket endpoint ───────────────────────────────────────────────────────

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    print(f"[ws] Client connected: {websocket.client}", flush=True)
    _ws_clients.append(websocket)
    # Send last known state immediately on connect
    if _latest_payload:
        await websocket.send_text(_latest_payload.model_dump_json())
    try:
        while True:
            await asyncio.sleep(30)  # keep alive
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


# ─── REST endpoints ───────────────────────────────────────────────────────────

@app.get("/api/zones", response_model=List[ZoneMetrics])
async def get_zones():
    return _latest_metrics


@app.get("/api/alerts", response_model=List[Alert])
async def get_alerts(limit: int = 100):
    alerts = list(_alert_history)[-limit:]
    return list(reversed(alerts))


@app.patch("/api/alerts/{alert_id}/status")
async def update_alert_status(alert_id: str, status: AlertStatus):
    for a in _alert_history:
        if a.alert_id == alert_id:
            a.status = status
            return {"ok": True}
    raise HTTPException(404, "Alert not found")


@app.get("/api/incidents", response_model=List[Incident])
async def get_incidents():
    return list(reversed(list(_incidents.values())))


@app.post("/api/incidents", response_model=Incident, status_code=201)
async def create_incident(body: IncidentCreate):
    inc = Incident(
        incident_id=str(uuid.uuid4()),
        type=body.type,
        affected_zones=body.affected_zones,
        severity=body.severity,
        assigned_responder=body.assigned_responder,
        notes=body.notes,
        timeline=[],
    )
    _incidents[inc.incident_id] = inc
    return inc


@app.patch("/api/incidents/{incident_id}/status")
async def update_incident_status(incident_id: str, status: str):
    inc = _incidents.get(incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.status = status  # type: ignore
    inc.updated_at = datetime.now(timezone.utc)
    return inc


@app.get("/api/cameras", response_model=List[CameraConfig])
async def get_cameras():
    return [
        CameraConfig(
            camera_id="cam_entrance_01",
            label="Main Entrance Camera",
            source="videos/sample.mp4",
            fps=5,
            active=True,
        )
    ]


@app.get("/api/config/zones")
async def get_config_zones():
    return [z.dict() for z in zone_engine.config]


@app.post("/api/config/zones")
async def update_zones(zones: List[ZoneConfig]):
    global zone_engine
    zone_engine = ZoneEngine(zones)
    print(f"[main] Updated configuration with {len(zones)} zones")
    return {"ok": True, "zones_loaded": len(zones)}


@app.get("/api/heatmap/latest")
async def get_heatmap():
    heatmap = detector.get_heatmap_jpeg()
    if not heatmap:
        raise HTTPException(503, "Heatmap not available")
    return Response(content=heatmap, media_type="image/jpeg")


@app.get("/api/zones/{zone_id}/density-history")
async def get_zone_density_history(zone_id: str):
    state = zone_engine.zones.get(zone_id)
    if not state:
        raise HTTPException(404, "Zone not found")
    return state.get_density_history(zone_id)


@app.post("/api/video/upload")
async def upload_video(file: UploadFile = File(...)):
    global detector
    # Save the uploaded file to a temporary location
    temp_dir = Path(tempfile.gettempdir()) / "intellicrowd"
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / file.filename

    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    print(f"[main] Video uploaded to {temp_path}")

    # Reinitialize detector with the new video and zone ROI
    if detector:
        detector.release()
    detector = VideoDetector(
        source=str(temp_path),
        zone_polygons=_zone_polygons,
    )

    return {"ok": True, "message": "Video loaded successfully"}


@app.get("/api/frame/latest")
async def get_latest_frame():
    frame_bytes = detector.get_annotated_frame()
    if frame_bytes is None:
        raise HTTPException(503, "No frame available — simulation mode active")
    return Response(content=frame_bytes, media_type="image/jpeg")


# ─── Predictions endpoint (Refinement #10) ───────────────────────────────────

@app.get("/api/predictions")
async def get_predictions():
    """Return predictive analytics for all zones."""
    preds = prediction_engine.get_all_predictions()
    result = []
    for pred in preds.values():
        result.append({
            "zone_id": pred.zone_id,
            "label": pred.label,
            "rate_per_minute": pred.rate_per_minute,
            "predicted_time_to_critical": pred.predicted_time_to_critical,
            "prediction_text": pred.prediction_text,
            "current_occupancy": pred.current_occupancy,
            "critical_threshold": pred.critical_threshold,
            "is_imminent": prediction_engine.is_imminent_critical(pred.zone_id),
        })
    return result


# ─── Zone flow endpoint (Refinement #9) ─────────────────────────────────────

@app.get("/api/zones/{zone_id}/flow")
async def get_zone_flow(zone_id: str):
    """Return entry/exit/net flow data for a specific zone."""
    state = zone_engine.zones.get(zone_id)
    if not state:
        raise HTTPException(404, "Zone not found")
    return {
        "zone_id": zone_id,
        "label": state.config.label,
        "entry_count": state.entry_count,
        "exit_count": state.exit_count,
        "net_flow": state.net_flow,
        "people_count": state.people_count,
        "smoothed_count": state.smoothed_count,
        "trend": state.trend,
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0",
        "refinements": [
            "yolov8s_with_fallback",
            "roi_masking",
            "dynamic_confidence",
            "temporal_smoothing",
            "bytetrack_tracking",
            "perspective_scaling",
            "hybrid_counting",
            "motion_filtering",
            "entry_exit_counting",
            "predictive_analytics",
        ],
    }
