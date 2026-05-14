# IntelliCrowd — Frontend

React 18 + Vite operator dashboard, attendee view, and post-event analytics.

## Setup

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

## Routes

| Path | View | Theme |
|------|------|-------|
| `/dashboard` | Operator Command Center | Dark |
| `/attendee` | Attendee Safety Companion | Light |
| `/analytics` | Post-Event Analytics | Dark |

## Architecture

```
src/
├── engine/
│   └── dataEngine.js        # Crowd simulation engine (CrowdEngine class)
├── context/
│   └── CrowdDataContext.jsx # React Context provider wrapping the engine
├── components/
│   ├── VenueMap.jsx         # SVG venue floor plan with zone overlays
│   ├── AlertFeed.jsx        # Scrollable alert cards with actions
│   ├── RiskPanel.jsx        # Top-3 risk zone ranking display
│   ├── ZoneList.jsx         # Left sidebar zone list with progress bars
│   ├── ForecastSparkline.jsx# Linear regression 30-min forecast chart
│   └── IncidentPanel.jsx    # Incident declaration form + active incidents
└── pages/
    ├── Dashboard.jsx        # Full operator command dashboard
    ├── Attendee.jsx         # Mobile-first attendee safety view
    └── Analytics.jsx        # Charts + report export
```

## Simulation Events

The `CrowdEngine` in `dataEngine.js` injects these scripted anomalies:

| Elapsed | Event | Zone | Alert Type |
|---------|-------|------|------------|
| 60s | Density spike → 97% capacity | Main Stage | DENSITY_CRITICAL |
| 120s | 25% headcount surge | Gate South | SURGE_DETECTED |
| 180s | Opposing movement vectors | Gate East | COUNTER_FLOW |
| 240s | Flow rate near-zero | Food Court | BOTTLENECK |

## Connecting to Real Backend

The Vite dev server proxies `/api` and `/ws` to `http://localhost:8000`.
To wire the dashboard to live backend data instead of simulation, the context
can be extended to consume the WebSocket at `ws://localhost:8000/ws/live`.

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| `cs-bg` | `#0A0A0F` | Dashboard background |
| `cs-surface` | `#12121A` | Cards, panels |
| `cs-amber` | `#EF9F27` | Accents, warnings |
| `cs-red` | `#E24B4A` | Critical alerts |
| `cs-green` | `#1D9E75` | Safe status |
| `cs-blue` | `#3B82F6` | P3 severity chips |
