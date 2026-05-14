/**
 * ZoneList — Left sidebar scrollable zone list with mini risk bars.
 * Module A5
 */
import React from 'react';

const RISK_COLORS = {
  safe:     { bar: '#1D9E75', text: 'text-cs-green', pill: 'pill-safe' },
  warning:  { bar: '#EF9F27', text: 'text-cs-amber', pill: 'pill-warning' },
  critical: { bar: '#E24B4A', text: 'text-cs-red',   pill: 'pill-critical' },
};

export default function ZoneList({ zones = [] }) {
  return (
    <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-180px)]">
      {zones.map(zone => {
        // Allow up to 120% so bars visually overflow when count exceeds defined capacity
        const occ = Math.min(120, Math.round((zone.currentCount / Math.max(1, zone.capacity)) * 100));
        const risk = occ >= 85 ? 'critical' : occ >= 60 ? 'warning' : 'safe';
        const colors = RISK_COLORS[risk];

        return (
          <div key={zone.id} className="card-sm p-2.5 hover:bg-white/5 transition-colors cursor-default">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: colors.bar }}/>
                <span className="text-white text-xs font-medium">{zone.label}</span>
              </div>
              <span className={`${colors.pill} text-[10px]`}>{risk.toUpperCase()}</span>
            </div>

            {/* Mini progress bar */}
            <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden mb-1">
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                style={{ width: `${occ}%`, background: colors.bar }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-gray-400">
              <span>{zone.currentCount}/{zone.capacity}</span>
              <span className={colors.text}>{occ}%</span>
            </div>

            {/* Flow direction indicator */}
            <div className="flex items-center gap-1 mt-1">
              <span className="text-gray-600 text-[9px] uppercase tracking-wider">flow</span>
              <span className="text-gray-400 text-[9px] capitalize">{zone.movementVector?.direction || '—'}</span>
              <span className="ml-auto text-gray-600 text-[9px]">
                {zone.flowRate?.toFixed(0) || 0}/min
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
