/**
 * RiskPanel — Top 3 highest-risk zones ranked display.
 * Module A3
 */
import React from 'react';

function RiskBar({ score }) {
  const color = score >= 70 ? '#E24B4A' : score >= 40 ? '#EF9F27' : '#1D9E75';
  return (
    <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
        style={{ width: `${score}%`, background: color }}
      />
    </div>
  );
}

function SeverityBadge({ score }) {
  if (score >= 70) return <span className="chip-p1">CRITICAL</span>;
  if (score >= 40) return <span className="chip-p2">WARNING</span>;
  return <span className="chip-p3">SAFE</span>;
}

export default function RiskPanel({ zones = [] }) {
  const topZones = [...zones]
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .slice(0, 3);

  return (
    <div className="space-y-3">
      {topZones.map((zone, i) => {
        const score = Math.round(zone.riskScore || 0);
        const occ   = Math.round((zone.currentCount / zone.capacity) * 100);
        return (
          <div key={zone.id} className="card p-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-500">#{i + 1}</span>
                <span className="text-white text-sm font-semibold">{zone.label}</span>
              </div>
              <SeverityBadge score={score} />
            </div>
            <RiskBar score={score} />
            <div className="flex justify-between mt-1.5 text-xs font-mono">
              <span className="text-gray-400">Risk Score</span>
              <span className={score >= 70 ? 'text-cs-red' : score >= 40 ? 'text-cs-amber' : 'text-cs-green'}>
                {score}/100
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 mt-2 text-xs font-mono text-gray-400">
              <div className="flex justify-between">
                <span>Occupancy</span>
                <span className="text-white">{occ}%</span>
              </div>
              <div className="flex justify-between">
                <span>Count</span>
                <span className="text-white">{zone.currentCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Flow</span>
                <span className="text-white capitalize">{zone.movementVector?.direction || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Trend</span>
                <span className={zone.trend === 'rising' ? 'text-cs-red' : zone.trend === 'falling' ? 'text-cs-green' : 'text-gray-300'}>
                  {zone.trend === 'rising' ? '↑' : zone.trend === 'falling' ? '↓' : '→'} {zone.trend || 'stable'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
