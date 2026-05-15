/**
 * AlertFeed — Scrollable alert card list.
 * Monitors for Critical Density, Stampede, Clusters, and Zone Imbalances.
 * P1 alerts are red/pulsing. P2/P3 are amber.
 */
import React from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';

const ALERT_META = {
  DENSITY_CRITICAL: {
    icon: '🫁',
    label: 'Critical Density',
  },
  STAMPEDE_DETECTED: {
    icon: '🚨',
    label: 'Stampede Possibility',
  },
  CLUSTER_DETECTED: {
    icon: '📍',
    label: 'High-Density Cluster',
  },
  ZONE_IMBALANCE: {
    icon: '⚖️',
    label: 'Crowd Imbalance',
  },
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function AlertFeed({ maxVisible = 20 }) {
  const { alerts, zones } = useCrowdData();

  // Latest first, only open
  const visible = [...alerts]
    .filter(a => a.status === 'open')
    .reverse()
    .slice(0, maxVisible);

  if (!visible.length) {
    return (
      <div className="flex flex-col items-center justify-center h-32 theme-text-dim text-sm gap-2">
        <span className="text-2xl">✅</span>
        All zones nominal — no active alerts
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
        const meta = ALERT_META[alert.type] || { icon: '⚠️', label: alert.type, detail: '' };
        // All emitted alerts are P1 (red) — amber styling kept for potential future P2 downgrade
        const isP1 = alert.severity === 'P1';
        const border = isP1 ? 'border-cs-red/50'  : 'border-cs-amber/40';
        const bg     = isP1 ? 'bg-cs-red/8'        : 'bg-cs-amber/5';
        const dot    = isP1 ? 'bg-cs-red animate-pulse' : 'bg-cs-amber';
        const chip   = isP1 ? 'bg-cs-red/20 text-cs-red border-cs-red/40' : 'bg-cs-amber/20 text-cs-amber border-cs-amber/40';
        const msgCol = isP1 ? 'text-cs-red' : 'text-cs-amber';

        // Look up the human-readable zone label
        const zoneObj = zones?.find(z => z.id === alert.zone_id);
        const displayZoneName = zoneObj?.label || alert.zone_id;

        return (
          <div
            key={alert.alert_id || alert.id}
            className={`rounded-[18px] border p-3 transition-all animate-fade-in ${border} ${bg}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <span className="theme-text-primary text-xs font-semibold font-mono">
                  {meta.icon} {meta.label}
                </span>
                <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full border ${chip}`}>
                  {alert.severity}
                </span>
              </div>
              <span className="theme-text-dim text-[10px] font-mono whitespace-nowrap shrink-0">
                {timeAgo(alert.timestamp)}
              </span>
            </div>

            {/* Zone label */}
            <div className={`text-xs font-semibold mb-1 ${msgCol}`}>
              Zone: {displayZoneName}
            </div>

            {/* Message (from backend — includes density % or speed) */}
            <div className="theme-text-muted text-xs leading-relaxed">{alert.message}</div>

            {/* Recommended action */}
            {alert.recommended_action && (
              <div className="theme-text-dim text-[10px] italic mt-1.5 border-t border-white/5 pt-1.5">
                💡 {alert.recommended_action}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
