/**
 * Dashboard — Operator Command Center
 * Module A5: Full-screen dark command UI with all panels.
 * Now supports uploaded footage + user-defined polygons.
 */
import React, { useState, useEffect } from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';
import { useFootage } from '../context/FootageContext.jsx';
import { useNavigate } from 'react-router-dom';
import VenueMap from '../components/VenueMap.jsx';
import AlertFeed from '../components/AlertFeed.jsx';
import RiskPanel from '../components/RiskPanel.jsx';
import ZoneList from '../components/ZoneList.jsx';
import IncidentPanel from '../components/IncidentPanel.jsx';

// ─── Live Clock ────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <span className="font-mono text-cs-amber text-sm">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

// ─── Overall Risk Badge ────────────────────────────────────────────────────

function RiskBadge({ zones }) {
  const maxRisk = zones.length ? Math.max(...zones.map(z => z.riskScore || 0)) : 0;
  const hasCritical = zones.some(z => (z.currentCount / z.capacity) >= 0.85);
  const level = hasCritical ? 'CRITICAL' : maxRisk >= 40 ? 'ELEVATED' : 'SAFE';
  const styles = {
    CRITICAL: 'bg-cs-red/20 text-cs-red border-cs-red/50 animate-pulse',
    ELEVATED: 'bg-cs-amber/20 text-cs-amber border-cs-amber/50',
    SAFE:     'bg-cs-green/20 text-cs-green border-cs-green/50',
  };
  return (
    <span className={`border px-3 py-1 rounded-[14px] font-mono text-xs font-bold tracking-widest ${styles[level]}`}>
      {level}
    </span>
  );
}

// ─── No Footage State ──────────────────────────────────────────────────────

function NoFootageState() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 py-12 px-6 text-center animate-fade-in">
      <div className="text-7xl mb-2">🎬</div>
      <div>
        <h2 className="theme-text-primary text-xl font-bold mb-1">No Footage Uploaded</h2>
        <p className="theme-text-muted text-sm max-w-sm">
          Upload your surveillance or event footage to start monitoring crowd density, zones, and real-time alerts.
        </p>
      </div>
      <button
        onClick={() => navigate('/upload')}
        className="btn-primary flex items-center gap-2 px-6 py-3 text-sm mt-2"
      >
        <span>⬆</span>
        <span>Upload Footage to Begin</span>
      </button>
    </div>
  );
}

// ─── Blank Card Placeholder ────────────────────────────────────────────────

function BlankCard({ label }) {
  return (
    <div className="card flex flex-col items-center justify-center h-full text-center px-4 py-8">
      <div className="text-3xl mb-3 opacity-30">🔒</div>
      <div className="theme-text-dim text-xs font-mono uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

// ─── Tab selector for right panel ────────────────────────────────────────

const TABS = ['Alerts', 'Incidents', 'Risk'];

// ─── Dashboard Page ───────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    zones, alerts, incidents, eventLog,
    networkDegraded, lastKnownAt,
    simulateNetworkLoss, resumeFeed, logAction,
  } = useCrowdData();

  const { footage } = useFootage();
  const hasFootage = !!footage?.objectUrl;

  const [rightTab, setRightTab] = useState('Alerts');
  const openAlerts = alerts.filter(a => a.status === 'open');

  const eventName  = footage?.name  || 'No Event Loaded';
  const venueLine  = footage
    ? [footage.venue, footage.city].filter(Boolean).join(' · ')
    : 'Upload footage to begin monitoring';

  return (
    <div className="flex flex-col h-[calc(100vh-96px)] overflow-hidden gap-3" style={{ background: 'transparent' }}>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 shrink-0 card" style={{ borderRadius: '24px' }}>
        <div>
          <h1 className="theme-text-primary font-bold text-sm tracking-wide">{eventName}</h1>
          <div className="theme-text-dim text-[10px] font-mono">{venueLine}</div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="theme-text-muted text-xs">Incidents</span>
            <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded-full ${
              incidents.filter(i => i.status !== 'Resolved').length > 0
                ? 'bg-cs-red/20 text-cs-red'
                : 'bg-white/10 theme-text-muted'
            }`}>
              {incidents.filter(i => i.status !== 'Resolved').length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="theme-text-muted text-xs">Alerts</span>
            <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded-full ${
              openAlerts.length > 0 ? 'bg-cs-red/20 text-cs-red animate-pulse' : 'bg-white/10 theme-text-muted'
            }`}>
              {openAlerts.length}
            </span>
          </div>
          <RiskBadge zones={zones} />
          <LiveClock />
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden gap-3">

        {/* Left — Zone list */}
        <aside className="w-64 flex flex-col shrink-0 card">
          <div className="px-4 py-3 border-b theme-border shrink-0">
            <div className="theme-text-dim text-[10px] font-mono uppercase tracking-wider">Zones</div>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            {hasFootage ? <ZoneList zones={zones} /> : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <div className="theme-text-dim text-[10px] font-mono">Upload footage first</div>
              </div>
            )}
          </div>
        </aside>

        {/* Centre — Map / No footage CTA */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 card">
          {hasFootage
            ? <VenueMap zonesData={zones} incidents={incidents} />
            : <NoFootageState />
          }
        </main>

        {/* Right — Tabbed panel */}
        <aside className="w-80 flex flex-col shrink-0 card">
          {/* Tabs */}
          <div className="flex border-b theme-border shrink-0 px-2 pt-2 gap-1">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2 px-2 text-[10px] font-semibold uppercase tracking-wider transition-all rounded-[14px] mb-1 ${
                  rightTab === tab
                    ? 'bg-cs-amber text-cs-bg'
                    : 'theme-text-dim hover:theme-text-muted hover:bg-white/5'
                }`}
                style={rightTab === tab ? { boxShadow: '0 1px 4px rgba(239,159,39,0.25)' } : {}}
              >
                {tab}
                {tab === 'Alerts' && openAlerts.length > 0 && (
                  <span className="ml-1 bg-cs-red text-white text-[9px] px-1.5 py-0.5 rounded-full">
                    {openAlerts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden p-4">
            {!hasFootage ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <div className="text-2xl opacity-30">📡</div>
                <div className="theme-text-dim text-xs">Upload footage first</div>
              </div>
            ) : (
              <>
                {rightTab === 'Alerts'    && <AlertFeed />}
                {rightTab === 'Incidents' && <IncidentPanel />}
                {rightTab === 'Risk'      && <RiskPanel zones={zones} />}
              </>
            )}
          </div>
        </aside>
      </div>

    </div>
  );
}
