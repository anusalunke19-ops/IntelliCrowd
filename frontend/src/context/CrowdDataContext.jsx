/**
 * CrowdDataContext — React context wrapping the CrowdEngine.
 * Provides live zone data, alerts, incidents and audit log to all routes.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
// import { CrowdEngine } from '../engine/dataEngine'; // Remove mock engine

const CrowdDataContext = createContext(null);

export function CrowdDataProvider({ children }) {
  const engineRef = useRef(null);
  const [state, setState] = useState(null);
  const [lastKnownAt, setLastKnownAt] = useState(null);
  const [eventLog, setEventLog] = useState([]);

  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const connect = () => {
      console.log("[ws] Connecting to direct backend at ws://localhost:8000/ws/live...");
      socket = new WebSocket('ws://localhost:8000/ws/live');

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // data matches LivePayload schema from backend
        // Transform backend fields if necessary (e.g., camelCase)
        const transformedState = {
          zones: (data.zones || []).map(z => ({
            ...z,
            id: z.zone_id,
            currentCount: z.people_count,
            occupancy: z.occupancy_percent,
            riskScore: z.risk_score,
            densityHistory: (z.density_history || []).map(dp => ({
              ...dp,
              occupancyPercent: dp.occupancy_percent
            })),
          })),
          alerts: data.active_alerts || [],
          incidents: (data.incidents || []).map(i => ({
            ...i,
            id: i.incident_id,
            affectedZones: i.affected_zones,
            assignedResponder: i.assigned_responder,
            createdAt: i.created_at
          })),
          globalStatus: data.global_status,
          timestamp: data.timestamp,
          heatmapAvailable: data.heatmap_available,
          detections: data.detections || []
        };
        setState(transformedState);
        setLastKnownAt(null);
      };

      socket.onclose = () => {
        console.warn("[ws] Connection closed. Reconnecting in 3s...");
        setLastKnownAt(new Date());
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("[ws] Socket error:", err);
        socket.close();
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const simulateNetworkLoss = () => {};
  const resumeFeed = () => {};
  const declareIncident = (data) => console.log("Declare:", data);
  const updateIncidentStatus = (id, status) => console.log("Update:", id, status);
  const acknowledgeAlert = async (id) => console.log("Ack:", id);
  const escalateAlert = (id) => console.log("Escalate:", id);
  const resolveAlert = (id) => console.log("Resolve:", id);
  const logAction = (msg) => {
    setEventLog(prev => [{ ts: new Date().toISOString(), message: msg }, ...prev]);
  };

  if (!state) {
    return (
      <div className="min-h-screen theme-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cs-amber border-t-transparent rounded-full animate-spin" />
          <p className="theme-text-primary font-medium animate-pulse">Connecting to Live Feed...</p>
        </div>
      </div>
    );
  }

  return (
    <CrowdDataContext.Provider value={{
      ...state,
      lastKnownAt,
      simulateNetworkLoss,
      resumeFeed,
      declareIncident,
      updateIncidentStatus,
      acknowledgeAlert,
      escalateAlert,
      resolveAlert,
      logAction,
      eventLog,
    }}>
      {children}
    </CrowdDataContext.Provider>
  );
}

export function useCrowdData() {
  const ctx = useContext(CrowdDataContext);
  if (!ctx) throw new Error('useCrowdData must be used within CrowdDataProvider');
  return ctx;
}
