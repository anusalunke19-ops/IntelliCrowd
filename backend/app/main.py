"""
IntelliCrowd — FastAPI Main
WebSocket + REST API for the crowd intelligence pipeline.
"""
from __future__ import annotations
import asyncio
import json
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse

from app.schemas import (
    Alert, AlertStatus, CameraConfig, GlobalStatus, Incident,
    IncidentCreate, LivePayload, ZoneMetrics,
)
from app.detection import VideoDetector
from app.zone_engine import ZoneEngine, load_zone_configs
from app.metrics_engine import build_all_metrics
from app.risk_engine import classify_global_risk, top_risk_zones
from app.alert_engine import AlertEngine

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="IntelliCrowd API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pipeline state (global singletons) ──────────────────────────────────────

zone_configs = load_zone_configs()
detector = VideoDetector(camera_id="cam_entrance_01")
zone_engine = ZoneEngine(zone_configs)
alert_engine = AlertEngine()

# In-memory stores
_incidents: Dict[str, Incident] = {}
_alert_history: deque[Alert] = deque(maxlen=500)
_latest_metrics: List[ZoneMetrics] = []
_latest_payload: Optional[LivePayload] = None

# WebSocket connection manager
_ws_clients: List[WebSocket] = []


# ─── Background pipeline loop ─────────────────────────────────────────────────

async def pipeline_loop():
    """Runs detection → zone assignment → metrics → alerting every 2 seconds."""
    global _latest_metrics, _latest_payload

    while True:
        try:
            frame = detector.next_frame()
            zone_engine.process_frame(frame)
            metrics = build_all_metrics(zone_engine.get_all_states())
            new_alerts = alert_engine.process(metrics)
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

            payload = LivePayload(
                camera_id="cam_entrance_01",
                timestamp=datetime.now(timezone.utc),
                zones=metrics,
                global_status=global_status,
                active_alerts=alert_engine.open_alerts()[-20:],
            )
            _latest_metrics = metrics
            _latest_payload = payload

            # Broadcast to all connected WebSocket clients
            dead = []
            for ws in _ws_clients:
                try:
                    await ws.send_text(payload.model_dump_json())
                except Exception:
                    dead.append(ws)
            for ws in dead:
                _ws_clients.remove(ws)

        except Exception as e:
            print(f"[pipeline] Error: {e}")

        await asyncio.sleep(2)


@app.on_event("startup")
async def startup():
    asyncio.create_task(pipeline_loop())


# ─── WebSocket endpoint ───────────────────────────────────────────────────────

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
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
async def get_zone_config():
    cfg_path = Path(__file__).parent.parent / "zones_config.json"
    return JSONResponse(content=json.loads(cfg_path.read_text()))


@app.post("/api/config/zones")
async def update_zone_config(body: dict):
    cfg_path = Path(__file__).parent.parent / "zones_config.json"
    cfg_path.write_text(json.dumps(body, indent=2))
    global zone_configs, zone_engine
    zone_configs = load_zone_configs()
    zone_engine = ZoneEngine(zone_configs)
    return {"ok": True, "zones_loaded": len(zone_configs)}


@app.get("/api/frame/latest")
async def get_latest_frame():
    frame_bytes = detector.get_annotated_frame()
    if frame_bytes is None:
        raise HTTPException(503, "No frame available — simulation mode active")
    return Response(content=frame_bytes, media_type="image/jpeg")


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
