/**
 * CrowdDataContext — React context wrapping the CrowdEngine.
 * Provides live zone data, alerts, incidents and audit log to all routes.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CrowdEngine } from '../engine/dataEngine';

const CrowdDataContext = createContext(null);

export function CrowdDataProvider({ children }) {
  const engineRef = useRef(null);
  const [state, setState] = useState(null);
  const [lastKnownAt, setLastKnownAt] = useState(null);

  useEffect(() => {
    const engine = new CrowdEngine();
    engineRef.current = engine;

    // Initial state before first tick
    setState(engine.getState());

    const unsub = engine.subscribe((newState) => {
      setState(newState);
    });

    engine.start(3000);

    return () => {
      engine.stop();
      unsub();
    };
  }, []);

  const simulateNetworkLoss = () => {
    if (!engineRef.current) return;
    setLastKnownAt(new Date());
    engineRef.current.simulateNetworkLoss();
  };

  const resumeFeed = () => {
    if (!engineRef.current) return;
    setLastKnownAt(null);
    engineRef.current.resumeFeed();
  };

  const declareIncident = (data) => engineRef.current?.declareIncident(data);
  const updateIncidentStatus = (id, status) => engineRef.current?.updateIncidentStatus(id, status);
  const acknowledgeAlert = (id) => engineRef.current?.acknowledgeAlert(id);
  const escalateAlert = (id) => engineRef.current?.escalateAlert(id);
  const resolveAlert = (id) => engineRef.current?.resolveAlert(id);
  const logAction = (msg) => engineRef.current?.logAction(msg);

  if (!state) return null;

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
