/**
 * AlertFeed — Scrollable alert card list with acknowledge/escalate/resolve actions.
 * Module A4 / A5
 */
import React from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';

const ALERT_TYPE_ICONS = {
  DENSITY_CRITICAL: '🔴',
  SURGE_DETECTED:   '📈',
  COUNTER_FLOW:     '↔️',
  BOTTLENECK:       '🚧',
  CROWD_STOP:       '⛔',
};

const SEVERITY_CHIP = {
  P1: 'chip-p1',
  P2: 'chip-p2',
  P3: 'chip-p3',
};

const STATUS_COLORS = {
  open:         'border-cs-red/40 bg-cs-red/5',
  acknowledged: 'border-cs-amber/30 bg-cs-amber/5',
  escalated:    'border-purple-500/40 bg-purple-500/5',
  resolved:     'border-gray-600/30 bg-white/2',
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function AlertFeed({ maxVisible = 20 }) {
  const { alerts, acknowledgeAlert, escalateAlert, resolveAlert, declareIncident, logAction } = useCrowdData();

  // Latest alert on top — reverse chronological
  const visible = [...alerts].reverse().slice(0, maxVisible);

  const handleDeclare = (alert) => {
    declareIncident({
      type: alert.type === 'DENSITY_CRITICAL' ? 'Overcrowding' : 'Security',
      affectedZones: [alert.zone],
      affected_zones: [alert.zone],
      severity: alert.severity,
      assignedResponder: 'Auto-assigned',
    });
    logAction(`Incident declared from alert ${alert.id} — ${alert.zoneLabel}`);
  };

  if (!visible.length) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
        <span className="text-2xl mb-2">✅</span>
        No active alerts
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
      {visible.map(alert => (
        <div
          key={alert.id}
          className={`rounded-lg border p-3 transition-all animate-fade-in ${STATUS_COLORS[alert.status] || STATUS_COLORS.open}`}
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">{ALERT_TYPE_ICONS[alert.type] || '⚠️'}</span>
              <span className="text-white text-xs font-semibold font-mono">{alert.type}</span>
              <span className={SEVERITY_CHIP[alert.severity] || 'chip-p3'}>{alert.severity}</span>
              <span className="text-gray-500 text-xs capitalize border border-gray-700/50 px-1.5 py-0.5 rounded">
                {alert.status}
              </span>
            </div>
            <span className="text-gray-500 text-xs font-mono whitespace-nowrap shrink-0">
              {timeAgo(alert.timestamp)}
            </span>
          </div>

          {/* Zone + message */}
          <div className="text-xs text-cs-amber font-mono mb-1">{alert.zoneLabel || alert.zone}</div>
          <div className="text-gray-300 text-xs mb-2 leading-relaxed">{alert.message}</div>
          <div className="text-gray-400 text-xs italic mb-2">💡 {alert.recommendedAction}</div>

          {/* Action buttons */}
          {alert.status === 'open' && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { acknowledgeAlert(alert.id); logAction(`Alert ${alert.id} acknowledged`); }}
                className="text-xs px-2 py-1 rounded bg-cs-amber/20 text-cs-amber border border-cs-amber/30 hover:bg-cs-amber/30 transition-colors"
              >
                Acknowledge
              </button>
              <button
                onClick={() => { escalateAlert(alert.id); logAction(`Alert ${alert.id} escalated`); }}
                className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
              >
                Escalate
              </button>
            </div>
          )}
          {alert.status === 'acknowledged' && (
            <div className="flex gap-1.5">
              <button
                onClick={() => { resolveAlert(alert.id); logAction(`Alert ${alert.id} resolved`); }}
                className="text-xs px-2 py-1 rounded bg-cs-green/20 text-cs-green border border-cs-green/30 hover:bg-cs-green/30 transition-colors"
              >
                Resolve
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
