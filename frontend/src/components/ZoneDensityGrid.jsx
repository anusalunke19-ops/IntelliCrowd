import React from 'react';
import ZoneDensityChart from './ZoneDensityChart.jsx';

export default function ZoneDensityGrid({ zones }) {
  if (!zones || zones.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto">
      {zones.map((zone) => {
        const occ = Math.round((zone.currentCount / zone.capacity) * 100);
        const isCritical = occ >= 85;
        const isWarning = occ >= 60 && !isCritical;
        
        return (
          <div key={zone.id} className="card p-3 flex flex-col h-48">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm theme-text-primary truncate" title={zone.label}>
                {zone.label}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                isCritical ? 'bg-cs-red/20 text-cs-red animate-pulse' :
                isWarning ? 'bg-cs-amber/20 text-cs-amber' :
                'bg-cs-green/20 text-cs-green'
              }`}>
                {occ}%
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ZoneDensityChart zone={zone} compact={true} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
