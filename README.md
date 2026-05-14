# IntelliCrowd — Crowd Intelligence & Safety Platform

Real-time crowd intelligence platform for festivals, concerts, rallies, and mass gatherings.

```
Architecture:
┌─────────────────────────────────────────────────────────────┐
│                     IntelliCrowd                            │
│                                                             │
│  ┌─────────────────────┐     ┌───────────────────────────┐  │
│  │   Frontend (React)  │     │   Backend (FastAPI)        │  │
│  │   localhost:5173    │◄───►│   localhost:8000           │  │
│  │                     │ WS  │                            │  │
│  │  /dashboard  (ops)  │     │  /ws/live (push 2s)       │  │
│  │  /attendee   (att)  │     │  /api/zones               │  │
│  │  /analytics  (mgmt) │     │  /api/alerts              │  │
│  └─────────────────────┘     │  /api/incidents           │  │
│                              │                            │  │
│                              │  ┌────────────────────┐   │  │
│                              │  │  Detection Pipeline │   │  │
│                              │  │  YOLOv8 / Simulated│   │  │
│                              │  └────────┬───────────┘   │  │
│                              │           │                │  │
│                              │  ┌────────▼───────────┐   │  │
│                              │  │  Zone Engine        │   │  │
│                              │  │  Metrics Engine     │   │  │
│                              │  │  Risk Engine        │   │  │
│                              │  │  Alert Engine       │   │  │
│                              │  └────────────────────┘   │  │
│                              └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at **http://localhost:8000**
- API docs: http://localhost:8000/docs
- WebSocket: ws://localhost:8000/ws/live

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

Open your browser and navigate to:
- `/dashboard` — Operator command center
- `/attendee` — Attendee safety companion
- `/analytics` — Post-event analytics

---

## Features

| Module | Description |
|--------|-------------|
| Live Heat Map | SVG venue map with real-time color-coded zone overlays |
| Risk Engine | Composite risk scoring with density, flow, dwell anomalies |
| Anomaly Detection | DENSITY_CRITICAL, SURGE, COUNTER_FLOW, BOTTLENECK, CROWD_STOP |
| Incident Command | P1/P2/P3 incident workflow with timeline audit log |
| Predictive Forecast | 30-minute crowd forecast via linear regression sparklines |
| Attendee View | Mobile-first safety companion with SOS button |
| Degraded Mode | Network loss simulation with staleness warning |
| Analytics | Post-event bar/line charts + .txt report export |

## Simulation Events

The frontend data engine injects scripted anomalies for demo purposes:

| Time | Event | Zone |
|------|-------|------|
| t+60s | DENSITY_CRITICAL spike (97% capacity) | Main Stage |
| t+120s | SURGE (+25% headcount spike) | Gate South |
| t+180s | COUNTER_FLOW (opposing vectors) | Gate East |
| t+240s | BOTTLENECK (flow obstruction) | Food Court |
