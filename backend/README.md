# IntelliCrowd — Backend

FastAPI-powered crowd analytics pipeline with WebSocket streaming.

## Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Simulation Mode (Default)

The backend runs in **simulation mode** by default — no video file or camera required.
`SimulatedCrowdEngine` generates realistic crowd data that drives the entire pipeline.

The simulated data:
- 6 polygon zones with individual movement patterns
- Persons with centroid-based pseudo-tracking
- Scripted event injections (density spike, surge, counter-flow, bottleneck)

## Enable Real Video Detection

1. Uncomment `ultralytics>=8.2.0` in `requirements.txt` and `pip install ultralytics`
2. Place an MP4 file in `backend/videos/`
3. In `app/main.py`, change the `VideoDetector` constructor:

```python
detector = VideoDetector(
    source="videos/your_file.mp4",
    model_path="yolov8n.pt",
    fps=5,
    camera_id="cam_entrance_01",
)
```

The system auto-downloads `yolov8n.pt` on first run.

## Enable Live Webcam

```python
detector = VideoDetector(source="0", fps=10, camera_id="webcam_01")
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/zones` | Current zone metrics |
| GET | `/api/alerts` | Alert history (last 100) |
| GET | `/api/incidents` | Active incidents |
| POST | `/api/incidents` | Declare new incident |
| PATCH | `/api/alerts/{id}/status` | Update alert status |
| GET | `/api/frame/latest` | Latest annotated JPEG frame |
| GET | `/api/cameras` | Camera configuration |
| WS | `/ws/live` | Live push payload (2s interval) |

## Zone Configuration

Edit `zones_config.json` to define custom polygon zones:

```json
{
  "zones": [{
    "zone_id": "gate_a",
    "label": "Gate A",
    "type": "entry",
    "polygon": [[120,80],[310,80],[330,250],[100,250]],
    "capacity": 50,
    "warning_threshold": 0.60,
    "critical_threshold": 0.85,
    "direction_rule": "entry_only"
  }]
}
```

Polygon coordinates must match the pixel space of your input video.
