/**
 * IntelliCrowd — Data Engine (dataEngine.js)
 * Self-contained simulation engine with scripted anomaly events.
 * Exposes live crowd data via CrowdDataContext.
 */

// ─── Zone Definitions ──────────────────────────────────────────────────────

export const ZONE_DEFS = {
  gate_n: {
    id: 'gate_n', label: 'Gate North', type: 'entry',
    capacity: 120, x: 320, y: 20, w: 160, h: 90,
    color: '#1D9E75',
  },
  gate_s: {
    id: 'gate_s', label: 'Gate South', type: 'exit',
    capacity: 120, x: 320, y: 390, w: 160, h: 90,
    color: '#1D9E75',
  },
  gate_e: {
    id: 'gate_e', label: 'Gate East', type: 'entry',
    capacity: 80, x: 650, y: 190, w: 90, h: 120,
    color: '#1D9E75',
  },
  gate_w: {
    id: 'gate_w', label: 'Gate West', type: 'entry',
    capacity: 80, x: 60, y: 190, w: 90, h: 120,
    color: '#1D9E75',
  },
  main_stage: {
    id: 'main_stage', label: 'Main Stage', type: 'open_area',
    capacity: 500, x: 170, y: 160, w: 460, h: 180,
    color: '#1D9E75',
  },
  food_court: {
    id: 'food_court', label: 'Food Court', type: 'open_area',
    capacity: 200, x: 60, y: 310, w: 250, h: 70,
    color: '#1D9E75',
  },
  parking_exit: {
    id: 'parking_exit', label: 'Parking Exit', type: 'exit',
    capacity: 60, x: 650, y: 340, w: 90, h: 140,
    color: '#1D9E75',
  },
  muster_point_a: {
    id: 'muster_point_a', label: 'Muster Point A', type: 'muster',
    capacity: 300, x: 340, y: 490, w: 120, h: 80,
    color: '#1D9E75',
  },
};

// ─── Risk Score Formula ────────────────────────────────────────────────────

const WEATHER_PENALTY = 0.18; // 32°C, partly cloudy — fixed demo value

function calcRiskScore(zone) {
  const densityPct = Math.min(1, zone.currentCount / zone.capacity);
  const flowAnomaly = zone._flowAnomaly || 0.1;
  const dwellAnomaly = zone._dwellAnomaly || 0.1;
  return Math.min(100,
    (densityPct * 0.4 + flowAnomaly * 0.3 + dwellAnomaly * 0.2 + WEATHER_PENALTY * 0.1) * 100
  );
}

// ─── Anomaly Detection ────────────────────────────────────────────────────

let _alertIdCounter = 1;

function makeAlert(type, severity, zoneId, zoneLabel, message, action) {
  return {
    id: `ALT-${String(_alertIdCounter++).padStart(4, '0')}`,
    type,
    severity,
    zone: zoneId,
    zoneLabel,
    timestamp: new Date(),
    message,
    recommendedAction: action,
    status: 'open',
  };
}

function detectAnomalies(zones, prevZones, elapsed, existingAlerts) {
  const alerts = [];
  const now = Date.now();

  for (const [id, zone] of Object.entries(zones)) {
    const prev = prevZones[id];
    const occ = zone.currentCount / zone.capacity;
    const prevOcc = prev ? prev.currentCount / prev.capacity : occ;

    // DENSITY_CRITICAL — >95% capacity
    if (occ >= 0.95) {
      const key = `DENSITY_CRITICAL:${id}`;
      const recent = existingAlerts.find(a => a.type === 'DENSITY_CRITICAL' && a.zone === id &&
        a.status === 'open' && (now - new Date(a.timestamp).getTime()) < 45000);
      if (!recent) {
        alerts.push(makeAlert(
          'DENSITY_CRITICAL', 'P1', id, zone.label,
          `${zone.label} at ${Math.round(occ * 100)}% capacity — crush risk imminent`,
          'Close all inflow immediately and activate emergency dispersal'
        ));
      }
    }

    // SURGE_DETECTED — >20% rise in last tick window
    if (prev && (zone.currentCount - prev.currentCount) / Math.max(1, prev.currentCount) > 0.20) {
      const recent = existingAlerts.find(a => a.type === 'SURGE_DETECTED' && a.zone === id &&
        (now - new Date(a.timestamp).getTime()) < 60000);
      if (!recent) {
        alerts.push(makeAlert(
          'SURGE_DETECTED', 'P1', id, zone.label,
          `Headcount surge in ${zone.label}: +${Math.round((zone.currentCount - prev.currentCount) / prev.currentCount * 100)}% spike`,
          'Deploy stewards to regulate inflow — open alternate routes'
        ));
      }
    }

    // COUNTER_FLOW — opposing movement vectors
    if (zone.movementVector?.direction === 'opposing') {
      const recent = existingAlerts.find(a => a.type === 'COUNTER_FLOW' && a.zone === id &&
        (now - new Date(a.timestamp).getTime()) < 60000);
      if (!recent) {
        alerts.push(makeAlert(
          'COUNTER_FLOW', 'P2', id, zone.label,
          `Opposing crowd flows in ${zone.label} — collision hazard elevated`,
          'Assign stewards at entry/exit to segregate flows'
        ));
      }
    }

    // BOTTLENECK — flow_in < flow_out persisted
    if (zone._bottleneckFrames && zone._bottleneckFrames >= 3) {
      const recent = existingAlerts.find(a => a.type === 'BOTTLENECK' && a.zone === id &&
        (now - new Date(a.timestamp).getTime()) < 90000);
      if (!recent) {
        alerts.push(makeAlert(
          'BOTTLENECK', 'P2', id, zone.label,
          `Persistent bottleneck in ${zone.label} — flow obstructed`,
          'Use PA system to redirect crowd to alternate route'
        ));
      }
    }

    // CROWD_STOP — near-zero flow in active zone
    if (zone.flowRate < 2 && zone.currentCount > 30) {
      const recent = existingAlerts.find(a => a.type === 'CROWD_STOP' && a.zone === id &&
        (now - new Date(a.timestamp).getTime()) < 60000);
      if (!recent) {
        alerts.push(makeAlert(
          'CROWD_STOP', 'P2', id, zone.label,
          `Crowd movement stalled in ${zone.label} — pressure building`,
          'Dispatch steward team to identify and clear obstruction'
        ));
      }
    }
  }
  return alerts;
}

// ─── Engine Init ───────────────────────────────────────────────────────────

function randWalk(val, pct, min, max) {
  const delta = val * pct * (Math.random() * 2 - 1);
  return Math.max(min, Math.min(max, val + delta));
}

function initZones() {
  return {
    gate_n:         { ...ZONE_DEFS.gate_n, currentCount: 45, flowRate: 28, dwellTime: 2.1, movementVector: { direction: 'inbound', speed: 1.2 }, _flowAnomaly: 0.1, _dwellAnomaly: 0.1, _bottleneckFrames: 0, history: [] },
    gate_s:         { ...ZONE_DEFS.gate_s, currentCount: 32, flowRate: 22, dwellTime: 1.8, movementVector: { direction: 'outbound', speed: 1.4 }, _flowAnomaly: 0.1, _dwellAnomaly: 0.1, _bottleneckFrames: 0, history: [] },
    gate_e:         { ...ZONE_DEFS.gate_e, currentCount: 18, flowRate: 14, dwellTime: 1.5, movementVector: { direction: 'inbound', speed: 1.0 }, _flowAnomaly: 0.1, _dwellAnomaly: 0.1, _bottleneckFrames: 0, history: [] },
    gate_w:         { ...ZONE_DEFS.gate_w, currentCount: 22, flowRate: 18, dwellTime: 1.6, movementVector: { direction: 'inbound', speed: 0.9 }, _flowAnomaly: 0.1, _dwellAnomaly: 0.1, _bottleneckFrames: 0, history: [] },
    main_stage:     { ...ZONE_DEFS.main_stage, currentCount: 310, flowRate: 12, dwellTime: 18, movementVector: { direction: 'stationary', speed: 0.3 }, _flowAnomaly: 0.15, _dwellAnomaly: 0.3, _bottleneckFrames: 0, history: [] },
    food_court:     { ...ZONE_DEFS.food_court, currentCount: 88, flowRate: 35, dwellTime: 12, movementVector: { direction: 'bidirectional', speed: 0.8 }, _flowAnomaly: 0.2, _dwellAnomaly: 0.2, _bottleneckFrames: 0, history: [] },
    parking_exit:   { ...ZONE_DEFS.parking_exit, currentCount: 24, flowRate: 20, dwellTime: 2.5, movementVector: { direction: 'outbound', speed: 1.1 }, _flowAnomaly: 0.1, _dwellAnomaly: 0.1, _bottleneckFrames: 0, history: [] },
    muster_point_a: { ...ZONE_DEFS.muster_point_a, currentCount: 12, flowRate: 5,  dwellTime: 8,  movementVector: { direction: 'stationary', speed: 0.2 }, _flowAnomaly: 0.1, _dwellAnomaly: 0.1, _bottleneckFrames: 0, history: [] },
  };
}

// ─── Engine Class ─────────────────────────────────────────────────────────

export class CrowdEngine {
  constructor() {
    this.zones = initZones();
    this.alerts = [];
    this.incidents = [];
    this.eventLog = [];
    this.networkDegraded = false;
    this._startTime = Date.now();
    this._tick = 0;
    this._prevZones = { ...this.zones };
    this._subscribers = [];

    // Record initial history point
    for (const z of Object.values(this.zones)) {
      z.history.push({ t: 0, count: z.currentCount });
      z.densityHistory = [{
        timestamp: new Date().toISOString(),
        count: z.currentCount,
        densityScore: calcRiskScore(z),
        occupancyPercent: Math.round((z.currentCount / z.capacity) * 100)
      }];
    }
  }

  subscribe(fn) {
    this._subscribers.push(fn);
    return () => { this._subscribers = this._subscribers.filter(s => s !== fn); };
  }

  _notify() {
    const state = this.getState();
    for (const fn of this._subscribers) fn(state);
  }

  getState() {
    const zoneArr = Object.values(this.zones);
    const riskScores = zoneArr.map(z => ({ ...z, riskScore: calcRiskScore(z) }));
    return {
      zones: riskScores,
      alerts: [...this.alerts],
      incidents: [...this.incidents],
      eventLog: [...this.eventLog],
      networkDegraded: this.networkDegraded,
      elapsed: (Date.now() - this._startTime) / 1000,
      heatmapAvailable: true,
    };
  }

  tick() {
    if (this.networkDegraded) return;

    const elapsed = (Date.now() - this._startTime) / 1000;
    this._tick++;
    const prev = JSON.parse(JSON.stringify(this.zones));

    // ── Normal random walk ────────────────────────────────────────────────
    for (const [id, z] of Object.entries(this.zones)) {
      z.currentCount = Math.max(0, Math.min(z.capacity,
        Math.round(randWalk(z.currentCount, 0.05, 0, z.capacity))
      ));
      z.flowRate = Math.max(0, randWalk(z.flowRate, 0.10, 0, 120));
      z.dwellTime = Math.max(0.5, randWalk(z.dwellTime, 0.05, 0.5, 60));
      z._flowAnomaly = Math.max(0.05, Math.min(1, randWalk(z._flowAnomaly, 0.08, 0.05, 1)));
      z._dwellAnomaly = Math.max(0.05, Math.min(1, randWalk(z._dwellAnomaly, 0.05, 0.05, 1)));

      // Rolling history (last 40 points for sparklines)
      z.history.push({ t: elapsed, count: z.currentCount });
      if (z.history.length > 40) z.history.shift();

      // Density history for full charts
      z.densityHistory.push({
        timestamp: new Date().toISOString(),
        count: z.currentCount,
        densityScore: calcRiskScore(z),
        occupancyPercent: Math.round((z.currentCount / z.capacity) * 100)
      });
      if (z.densityHistory.length > 60) z.densityHistory.shift();
    }

    // ── Scripted anomaly events ───────────────────────────────────────────

    // t=60s: DENSITY_CRITICAL spike on main_stage
    if (elapsed >= 60 && elapsed < 90) {
      this.zones.main_stage.currentCount = Math.round(this.zones.main_stage.capacity * 0.97);
      this.zones.main_stage._flowAnomaly = 0.9;
      this.zones.main_stage.movementVector = { direction: 'stationary', speed: 0.05 };
    }

    // t=120s: SURGE on gate_s (20%+ headcount rise)
    if (elapsed >= 120 && elapsed < 150) {
      this.zones.gate_s.currentCount = Math.min(
        this.zones.gate_s.capacity,
        Math.round(prev.gate_s.currentCount * 1.25)
      );
      this.zones.gate_s.flowRate = 2;
    }

    // t=180s: COUNTER_FLOW on gate_e
    if (elapsed >= 180 && elapsed < 210) {
      this.zones.gate_e.movementVector = { direction: 'opposing', speed: 1.5 };
      this.zones.gate_e._flowAnomaly = 1.0;
    }

    // t=240s: BOTTLENECK on food_court
    if (elapsed >= 240 && elapsed < 280) {
      this.zones.food_court.flowRate = 1.2;
      this.zones.food_court._bottleneckFrames = (this.zones.food_court._bottleneckFrames || 0) + 1;
      this.zones.food_court._flowAnomaly = 0.85;
    } else if (elapsed >= 280) {
      this.zones.food_court._bottleneckFrames = 0;
    }

    // ── Detect anomalies and emit alerts ─────────────────────────────────
    const newAlerts = detectAnomalies(this.zones, prev, elapsed, this.alerts);
    if (newAlerts.length) {
      this.alerts = [...newAlerts, ...this.alerts].slice(0, 200);
    }

    this._prevZones = prev;
    this._notify();
  }

  start(intervalMs = 3000) {
    this._interval = setInterval(() => this.tick(), intervalMs);
    return this;
  }

  stop() {
    clearInterval(this._interval);
  }

  simulateNetworkLoss() {
    this.networkDegraded = true;
    this._lastKnownAt = new Date();
    this.stop();
    this._notify();
  }

  resumeFeed() {
    this.networkDegraded = false;
    this._lastKnownAt = null;
    this.start();
    this._notify();
  }

  declareIncident(incident) {
    const inc = {
      ...incident,
      id: `INC-${String(this.incidents.length + 1).padStart(3, '0')}`,
      createdAt: new Date(),
      status: 'Open',
      timeline: [{ ts: new Date(), action: 'Incident declared', actor: 'Operator' }],
    };
    this.incidents = [inc, ...this.incidents];
    this.logAction(`Incident declared: ${inc.id} — ${inc.type} (${inc.severity})`);
    this._notify();
    return inc;
  }

  updateIncidentStatus(id, status) {
    this.incidents = this.incidents.map(inc =>
      inc.id === id
        ? {
            ...inc,
            status,
            timeline: [...inc.timeline, { ts: new Date(), action: `Status → ${status}`, actor: 'Operator' }],
          }
        : inc
    );
    this._notify();
  }

  acknowledgeAlert(alertId) {
    this.alerts = this.alerts.map(a => a.id === alertId ? { ...a, status: 'acknowledged' } : a);
    this._notify();
  }

  escalateAlert(alertId) {
    this.alerts = this.alerts.map(a => a.id === alertId ? { ...a, status: 'escalated' } : a);
    this._notify();
  }

  resolveAlert(alertId) {
    this.alerts = this.alerts.map(a => a.id === alertId ? { ...a, status: 'resolved' } : a);
    this._notify();
  }

  logAction(msg) {
    this.eventLog = [{ ts: new Date(), message: msg }, ...this.eventLog].slice(0, 100);
    this._notify();
  }
}
