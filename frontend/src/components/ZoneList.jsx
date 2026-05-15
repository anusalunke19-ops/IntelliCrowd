/**
 * ZoneList — Left sidebar scrollable zone list with mini risk bars.
 * Risk level and density % come directly from the backend.
 */
import React from 'react';

const RISK_COLORS = {
  safe:     { bar: '#38BDF8', text: 'text-sky-400',  pill: 'pill-safe' },
  warning:  { bar: '#EF9F27', text: 'text-cs-amber', pill: 'pill-warning' },
  critical: { bar: '#E24B4A', text: 'text-cs-red',   pill: 'pill-critical' },
};

export default function ZoneList({ zones = [] }) {
  return (
    <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-180px)]">
      {zones.map(zone => {
        // Use backend-computed risk level and density — no capacity math here
        const riskKey = zone.risk_level || 'safe';
        const colors  = RISK_COLORS[riskKey] || RISK_COLORS.safe;
        // density % from backend (0-100, driven by physical area density)
        const density = Math.min(100, Math.round(zone.occupancy ?? 0));

        return (
          <div key={zone.id} className="card-sm p-2.5 hover:bg-white/5 transition-colors cursor-default">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: colors.bar }}/>
                <span className="text-white text-xs font-medium">{zone.label}</span>
              </div>
              <span className={`${colors.pill} text-[10px]`}>{riskKey.toUpperCase()}</span>
            </div>

            {/* Density bar */}
            <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden mb-1">
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                style={{ width: `${density}%`, background: colors.bar }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-gray-400">
              <span>{zone.currentCount} detected</span>
              <span className={colors.text}>{density}% density</span>
            </div>

            {/* Flow direction + avg speed */}
            <div className="flex items-center gap-1 mt-1">
              <span className="text-gray-600 text-[9px] uppercase tracking-wider">flow</span>
              <span className="text-gray-400 text-[9px] capitalize">
                {zone.flow_direction || zone.movementVector?.direction || '—'}
              </span>
              {zone.avg_speed != null && (
                <span className="ml-auto text-gray-600 text-[9px]">{zone.avg_speed.toFixed(2)} m/s</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
