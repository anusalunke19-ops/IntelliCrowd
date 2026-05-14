/**
 * VenueMap — Interactive SVG floor plan with zone risk overlays.
 * Module A2: color-coded zones, hover tooltips, incident pins.
 */
import React, { useState } from 'react';

const VIEWBOX_W = 800;
const VIEWBOX_H = 500;

// Zone polygon definitions (pixel coords in 800×500 space)
const ZONES = [
  { id: 'gate_n',         label: 'Gate North',    points: '270,10 530,10 530,85 270,85',     cx: 400, cy: 48 },
  { id: 'gate_s',         label: 'Gate South',    points: '270,415 530,415 530,490 270,490', cx: 400, cy: 453 },
  { id: 'gate_e',         label: 'Gate East',     points: '700,160 790,160 790,340 700,340', cx: 745, cy: 250 },
  { id: 'gate_w',         label: 'Gate West',     points: '10,160 100,160 100,340 10,340',   cx: 55,  cy: 250 },
  { id: 'main_stage',     label: 'Main Stage',    points: '110,150 690,150 690,310 110,310', cx: 400, cy: 230 },
  { id: 'food_court',     label: 'Food Court',    points: '110,320 420,320 420,405 110,405', cx: 265, cy: 363 },
  { id: 'parking_exit',   label: 'Parking Exit',  points: '430,320 690,320 690,405 430,405', cx: 560, cy: 363 },
  { id: 'muster_point_a', label: 'Muster Pt A',   points: '310,415 490,415 490,490 310,490', cx: 400, cy: 453 },
];

function zoneColor(riskScore, occupancyPct) {
  if (occupancyPct >= 95) return { fill: '#E24B4A', stroke: '#FF6B6A', pulse: true };
  if (occupancyPct >= 85 || riskScore >= 70) return { fill: '#E24B4A', stroke: '#E24B4A', pulse: false };
  if (occupancyPct >= 60 || riskScore >= 40) return { fill: '#EF9F27', stroke: '#EF9F27', pulse: false };
  return { fill: '#1D9E75', stroke: '#1D9E75', pulse: false };
}

function Tooltip({ zone, metrics }) {
  const m = metrics;
  if (!m) return null;
  const occ = Math.round(m.occupancy || 0);
  const risk = Math.round(m.riskScore || 0);
  return (
    <div className="pointer-events-none absolute z-30 bg-cs-bg border border-cs-border rounded-lg p-3 shadow-2xl w-56 text-xs"
         style={{ left: zone._tipX, top: zone._tipY }}>
      <div className="font-semibold text-white mb-2">{zone.label}</div>
      <div className="space-y-1 font-mono text-gray-300">
        <div className="flex justify-between"><span>Headcount</span><span className="text-white">{m.currentCount || 0} / {m.capacity || '—'}</span></div>
        <div className="flex justify-between"><span>Occupancy</span><span className={occ >= 85 ? 'text-cs-red' : occ >= 60 ? 'text-cs-amber' : 'text-cs-green'}>{occ}%</span></div>
        <div className="flex justify-between"><span>Flow Rate</span><span className="text-white">{m.flowRate?.toFixed(1) || '—'} /min</span></div>
        <div className="flex justify-between"><span>Dwell Time</span><span className="text-white">{m.dwellTime?.toFixed(1) || '—'} min</span></div>
        <div className="flex justify-between"><span>Risk Score</span>
          <span className={risk >= 70 ? 'text-cs-red' : risk >= 40 ? 'text-cs-amber' : 'text-cs-green'}>{risk}</span>
        </div>
        <div className="flex justify-between"><span>Direction</span><span className="text-white capitalize">{m.movementVector?.direction || '—'}</span></div>
      </div>
    </div>
  );
}

export default function VenueMap({ zonesData = [], incidents = [] }) {
  const [hovered, setHovered] = useState(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  // Map zone data by id
  const dataMap = {};
  for (const z of zonesData) {
    const id = z.id || z.zone_id;
    dataMap[id] = z;
  }

  // Map incident zones to pins
  const incidentPins = incidents
    .filter(i => i.status !== 'Resolved')
    .flatMap((inc, idx) =>
      (inc.affectedZones || inc.affected_zones || []).map(zid => {
        const zdef = ZONES.find(z => z.id === zid);
        return zdef ? { ...inc, _idx: idx, _cx: zdef.cx, _cy: zdef.cy } : null;
      }).filter(Boolean)
    );

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full h-auto rounded-lg border border-cs-border bg-[#0D0D18]"
        style={{ maxHeight: '420px' }}
      >
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a2a" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="800" height="500" fill="url(#grid)"/>

        {/* Venue outline */}
        <rect x="10" y="10" width="780" height="480" rx="4"
              fill="none" stroke="#2A2A3A" strokeWidth="1.5" strokeDasharray="6,3"/>

        {/* Zones */}
        {ZONES.map(zone => {
          const m = dataMap[zone.id];
          const occ = m ? (m.currentCount / m.capacity) * 100 : 30;
          const riskScore = m?.riskScore || 0;
          const { fill, stroke, pulse } = zoneColor(riskScore, occ);

          return (
            <g key={zone.id}
               style={{ cursor: 'pointer' }}
               onMouseEnter={(e) => {
                 const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                 const svgX = zone.cx / VIEWBOX_W * rect.width;
                 const svgY = zone.cy / VIEWBOX_H * rect.height;
                 setTipPos({ x: rect.left + svgX, y: rect.top + svgY });
                 setHovered({ zone: { ...zone, _tipX: svgX + 10, _tipY: svgY + 10 }, metrics: m });
               }}
               onMouseLeave={() => setHovered(null)}
            >
              <polygon
                points={zone.points}
                fill={fill}
                fillOpacity={0.18}
                stroke={stroke}
                strokeWidth={pulse ? 2 : 1.5}
                strokeOpacity={0.85}
                className={pulse ? 'animate-pulse' : ''}
              />
              {/* Zone label */}
              <text
                x={zone.cx}
                y={zone.cy - 6}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontFamily="Inter, sans-serif"
                fontWeight="600"
                opacity="0.9"
              >
                {zone.label}
              </text>
              {/* Headcount */}
              {m && (
                <text
                  x={zone.cx}
                  y={zone.cy + 10}
                  textAnchor="middle"
                  fill={fill}
                  fontSize="13"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {m.currentCount}
                </text>
              )}
              {/* Occupancy % bar */}
              {m && (() => {
                const pts = zone.points.split(' ').map(p => p.split(',').map(Number));
                const xs = pts.map(p => p[0]);
                const ys = pts.map(p => p[1]);
                const x0 = Math.min(...xs) + 4;
                const barW = Math.max(...xs) - Math.min(...xs) - 8;
                const barY = Math.max(...ys) - 8;
                const fill100 = barW * Math.min(1, occ / 100);
                return (
                  <g>
                    <rect x={x0} y={barY} width={barW} height={3} fill="#ffffff10" rx="1.5"/>
                    <rect x={x0} y={barY} width={fill100} height={3} fill={fill} rx="1.5"/>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Incident pins */}
        {incidentPins.map((pin, i) => (
          <g key={`pin-${i}`}>
            <circle cx={pin._cx} cy={pin._cy - 30} r={10}
                    fill="#E24B4A" stroke="#FF6B6A" strokeWidth="1.5"
                    className="animate-pulse"/>
            <text x={pin._cx} y={pin._cy - 26} textAnchor="middle"
                  fill="white" fontSize="9" fontWeight="bold" fontFamily="monospace">
              {pin._idx + 1}
            </text>
          </g>
        ))}

        {/* Legend */}
        <g transform="translate(10, 460)">
          {[['#1D9E75','Safe <60%'],['#EF9F27','Warning 60-85%'],['#E24B4A','Critical >85%']].map(([c,l], i) => (
            <g key={i} transform={`translate(${i * 130}, 0)`}>
              <rect width="10" height="10" fill={c} fillOpacity="0.6" stroke={c} strokeWidth="1" rx="2"/>
              <text x="14" y="9" fill="#aaa" fontSize="9" fontFamily="Inter,sans-serif">{l}</text>
            </g>
          ))}
        </g>
      </svg>

      {/* Floating tooltip */}
      {hovered && (
        <div className="absolute z-30 pointer-events-none" style={{ left: hovered.zone._tipX + 20, top: hovered.zone._tipY - 10 }}>
          <Tooltip zone={hovered.zone} metrics={hovered.metrics} />
        </div>
      )}
    </div>
  );
}
