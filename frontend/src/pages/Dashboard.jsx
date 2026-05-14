/**
 * Dashboard — Operator Command Center
 * Module A5: Full-screen dark command UI with all panels.
 * Now supports uploaded footage + user-defined polygons.
 */
import React, { useState, useEffect } from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';
import { useFootage } from '../context/FootageContext.jsx';
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
  const maxRisk = Math.max(...zones.map(z => z.riskScore || 0));
  const hasCritical = zones.some(z => (z.currentCount / z.capacity) >= 0.85);
  const level = hasCritical ? 'CRITICAL' : maxRisk >= 40 ? 'ELEVATED' : 'SAFE';
  const styles = {
    CRITICAL: 'bg-cs-red/20 text-cs-red border-cs-red/50 animate-pulse',
    ELEVATED: 'bg-cs-amber/20 text-cs-amber border-cs-amber/50',
    SAFE:     'bg-cs-green/20 text-cs-green border-cs-green/50',
  };
  return (
    <span className={`border px-3 py-1 rounded font-mono text-xs font-bold tracking-widest ${styles[level]}`}>
      {level}
    </span>
  );
}

// ─── Connectivity Bar ─────────────────────────────────────────────────────

function ConnectivityBar({ degraded, lastKnownAt, onSimulate, onResume }) {
  if (degraded) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-cs-amber/10 border-b border-cs-amber/30 text-xs">
        <span className="w-2 h-2 rounded-full bg-cs-amber animate-pulse flex-shrink-0"/>
        <span className="text-cs-amber font-semibold">
          ⚠️ Data feed interrupted — showing last known state as of{' '}
          {lastKnownAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <button onClick={onResume} className="ml-auto text-cs-green border border-cs-green/40 px-3 py-0.5 rounded hover:bg-cs-green/10 transition-colors">
          ▶ Resume Feed
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b text-xs theme-surface theme-border">
      <span className="w-2 h-2 rounded-full bg-cs-green flex-shrink-0"/>
      <span className="theme-text-muted">Live feed active</span>
      <button onClick={onSimulate} className="ml-auto theme-text-dim border px-3 py-0.5 rounded hover:bg-white/5 transition-colors theme-border">
        Simulate Network Loss
      </button>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: '📢', label: 'PA Announcement', msg: 'PA system announcement triggered' },
  { icon: '⚠️', label: 'Declare Incident', msg: 'General incident declared by operator' },
];

function QuickActions({ onAction, auditLog }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {QUICK_ACTIONS.map(qa => (
          <button
            key={qa.label}
            onClick={() => onAction(qa.msg)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold theme-text-muted card-sm hover:opacity-80 transition-all"
          >
            <span>{qa.icon}</span>
            <span>{qa.label}</span>
          </button>
        ))}
      </div>
      {/* Audit trail */}
      <div className="rounded border theme-border p-2 max-h-24 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.15)' }}>
        <div className="theme-text-dim text-[10px] font-mono uppercase tracking-wider mb-1">Audit Trail</div>
        {auditLog.length === 0 && <div className="theme-text-dim text-[10px]">No actions recorded</div>}
        {auditLog.slice(0, 8).map((entry, i) => (
          <div key={i} className="flex gap-2 text-[10px] font-mono leading-relaxed">
            <span className="theme-text-dim shrink-0">
              {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="theme-text-muted">{entry.message}</span>
          </div>
        ))}
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

  const [rightTab, setRightTab] = useState('Alerts');
  const openAlerts = alerts.filter(a => a.status === 'open');

  // Event title / venue — from uploaded footage if present, else default
  const eventName  = footage?.name  || 'SUNBURN FESTIVAL 2026';
  const venueLine  = [footage?.venue, footage?.city].filter(Boolean).join(' · ') || 'Main Venue · Goa, India';

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Connectivity bar */}
      <ConnectivityBar
        degraded={networkDegraded}
        lastKnownAt={lastKnownAt}
        onSimulate={simulateNetworkLoss}
        onResume={resumeFeed}
      />

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 card-sm" style={{ borderRadius: 0 }}>
        <div>
          <h1 className="theme-text-primary font-bold text-sm tracking-wide">{eventName}</h1>
          <div className="theme-text-dim text-[10px] font-mono">{venueLine}</div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="theme-text-muted text-xs">Incidents</span>
            <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
              incidents.filter(i => i.status !== 'Resolved').length > 0
                ? 'bg-cs-red/20 text-cs-red'
                : 'bg-white/10 theme-text-muted'
            }`}>
              {incidents.filter(i => i.status !== 'Resolved').length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="theme-text-muted text-xs">Alerts</span>
            <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
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
      <div className="flex flex-1 overflow-hidden">

        {/* Left — Zone list */}
        <aside className="w-52 border-r flex flex-col shrink-0 theme-surface theme-border">
          <div className="px-3 py-2 border-b theme-border">
            <div className="theme-text-dim text-[10px] font-mono uppercase tracking-wider">Zones</div>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <ZoneList zones={zones} />
          </div>
        </aside>

        {/* Centre — Map only, no sparklines below */}
        <main className="flex-1 flex flex-col overflow-hidden p-3 gap-3 min-w-0">
          <VenueMap zonesData={zones} incidents={incidents} />
        </main>

        {/* Right — Tabbed panel */}
        <aside className="w-72 border-l flex flex-col shrink-0 theme-surface theme-border">
          {/* Tabs */}
          <div className="flex border-b theme-border shrink-0">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  rightTab === tab
                    ? 'text-cs-amber border-b-2 border-cs-amber bg-cs-amber/5'
                    : 'theme-text-dim hover:theme-text-muted'
                }`}
              >
                {tab}
                {tab === 'Alerts' && openAlerts.length > 0 && (
                  <span className="ml-1 bg-cs-red text-white text-[9px] px-1 rounded-full">
                    {openAlerts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden p-3">
            {rightTab === 'Alerts'  && <AlertFeed />}
            {rightTab === 'Incidents' && <IncidentPanel />}
            {rightTab === 'Risk'    && <RiskPanel zones={zones} />}
          </div>
        </aside>
      </div>

    </div>
  );
}
