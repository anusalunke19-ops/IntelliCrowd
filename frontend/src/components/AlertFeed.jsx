/**
 * AlertFeed — Scrollable alert card list.
 * Red = capacity exceeded. Amber = moderate warning.
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

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Determine alert visual severity based on severity field
// P1 (capacity exceeded threshold) → red; P2/P3 → amber moderate
function alertStyle(alert) {
  if (alert.severity === 'P1') {
    return {
      border: 'border-cs-red/50',
      bg: 'bg-cs-red/8',
      dot: 'bg-cs-red',
      chip: 'bg-cs-red/20 text-cs-red border-cs-red/40',
    };
  }
  return {
    border: 'border-cs-amber/40',
    bg: 'bg-cs-amber/5',
    dot: 'bg-cs-amber',
    chip: 'bg-cs-amber/20 text-cs-amber border-cs-amber/40',
  };
}

export default function AlertFeed({ maxVisible = 20 }) {
  const { alerts } = useCrowdData();

  const visible = [...alerts].reverse().slice(0, maxVisible);

  if (!visible.length) {
    return (
      <div className="flex flex-col items-center justify-center h-32 theme-text-dim text-sm gap-2">
        <span className="text-2xl">✅</span>
        No active alerts
      </div>
    );
  }

  return (
    <div
      className="space-y-2 overflow-y-auto h-full pb-8 pr-1"
      style={{
        maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
      }}
    >
      {visible.map(alert => {
        const s = alertStyle(alert);
        return (
          <div
            key={alert.id}
            className={`rounded-[18px] border p-3 transition-all animate-fade-in ${s.border} ${s.bg}`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                <span className="theme-text-primary text-xs font-semibold font-mono truncate">
                  {ALERT_TYPE_ICONS[alert.type] || '⚠️'} {alert.type}
                </span>
                <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full border ${s.chip}`}>
                  {alert.severity}
                </span>
              </div>
              <span className="theme-text-dim text-[10px] font-mono whitespace-nowrap shrink-0">
                {timeAgo(alert.timestamp)}
              </span>
            </div>

            {/* Zone + message */}
            <div className={`text-xs font-semibold mb-1 ${alert.severity === 'P1' ? 'text-cs-red' : 'text-cs-amber'}`}>
              {alert.zoneLabel || alert.zone}
            </div>
            <div className="theme-text-muted text-xs leading-relaxed">{alert.message}</div>
            {alert.recommendedAction && (
              <div className="theme-text-dim text-[10px] italic mt-1">💡 {alert.recommendedAction}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
