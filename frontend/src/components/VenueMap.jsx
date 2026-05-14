/**
 * VenueMap — Interactive SVG floor plan OR video feed with zone overlays.
 * When footage is uploaded, shows the video with user-defined polygons.
 * Module A2 + footage integration.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFootage } from '../context/FootageContext.jsx';
import { useCrowdData } from '../context/CrowdDataContext.jsx';
import HeatmapOverlay from './HeatmapOverlay.jsx';

const VIEWBOX_W = 800;
const VIEWBOX_H = 500;

// Default SVG zone definitions (pixel coords in 800×500 space)
const SVG_ZONES = [
  { id: 'gate_n', label: 'Gate North', points: '270,10 530,10 530,85 270,85', cx: 400, cy: 48 },
  { id: 'gate_s', label: 'Gate South', points: '270,415 530,415 530,490 270,490', cx: 400, cy: 453 },
  { id: 'gate_e', label: 'Gate East', points: '700,160 790,160 790,340 700,340', cx: 745, cy: 250 },
  { id: 'gate_w', label: 'Gate West', points: '10,160 100,160 100,340 10,340', cx: 55, cy: 250 },
  { id: 'main_stage', label: 'Main Stage', points: '110,150 690,150 690,310 110,310', cx: 400, cy: 230 },
  { id: 'food_court', label: 'Food Court', points: '110,320 420,320 420,405 110,405', cx: 265, cy: 363 },
  { id: 'parking_exit', label: 'Parking Exit', points: '430,320 690,320 690,405 430,405', cx: 560, cy: 363 },
  { id: 'muster_point_a', label: 'Muster Pt A', points: '310,415 490,415 490,490 310,490', cx: 400, cy: 453 },
];

function zoneColor(riskScore, occupancyPct) {
  if (occupancyPct >= 95) return { fill: '#E24B4A', stroke: '#FF6B6A', pulse: true };
  if (occupancyPct >= 85 || riskScore >= 70) return { fill: '#E24B4A', stroke: '#E24B4A', pulse: false };
  if (occupancyPct >= 60 || riskScore >= 40) return { fill: '#EF9F27', stroke: '#EF9F27', pulse: false };
  return { fill: '#1D9E75', stroke: '#1D9E75', pulse: false };
}

// ─── SVG Tooltip ─────────────────────────────────────────────────────────────

function Tooltip({ zone, metrics }) {
  const m = metrics;
  if (!m) return null;
  const occ = Math.round(m.occupancy || 0);
  const risk = Math.round(m.riskScore || 0);
  return (
    <div className="pointer-events-none absolute z-30 card rounded-lg p-3 shadow-2xl w-56 text-xs"
      style={{ left: zone._tipX, top: zone._tipY }}>
      <div className="font-semibold theme-text-primary mb-2">{zone.label}</div>
      <div className="space-y-1 font-mono theme-text-muted">
        <div className="flex justify-between"><span>Headcount</span><span className="theme-text-primary">{m.currentCount || 0} / {m.capacity || '—'}</span></div>
        <div className="flex justify-between"><span>Occupancy</span><span className={occ >= 85 ? 'text-cs-red' : occ >= 60 ? 'text-cs-amber' : 'text-cs-green'}>{occ}%</span></div>
        <div className="flex justify-between"><span>Flow Rate</span><span className="theme-text-primary">{m.flowRate?.toFixed(1) || '—'} /min</span></div>
        <div className="flex justify-between"><span>Dwell Time</span><span className="theme-text-primary">{m.dwellTime?.toFixed(1) || '—'} min</span></div>
        <div className="flex justify-between"><span>Risk Score</span>
          <span className={risk >= 70 ? 'text-cs-red' : risk >= 40 ? 'text-cs-amber' : 'text-cs-green'}>{risk}</span>
        </div>
        <div className="flex justify-between"><span>Direction</span><span className="theme-text-primary capitalize">{m.movementVector?.direction || '—'}</span></div>
      </div>
    </div>
  );
}

// ─── Default SVG Map ──────────────────────────────────────────────────────────

function SVGMap({ zonesData = [], incidents = [] }) {
  const [hovered, setHovered] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const dataMap = {};
  for (const z of zonesData) {
    const id = z.id || z.zone_id;
    dataMap[id] = z;
  }

  const incidentPins = incidents
    .filter(i => i.status !== 'Resolved')
    .flatMap((inc, idx) =>
      (inc.affectedZones || inc.affected_zones || []).map(zid => {
        const zdef = SVG_ZONES.find(z => z.id === zid);
        return zdef ? { ...inc, _idx: idx, _cx: zdef.cx, _cy: zdef.cy } : null;
      }).filter(Boolean)
    );

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full h-auto rounded-lg border border-cs-border"
        style={{ maxHeight: '420px', background: '#0D0D18' }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a2a" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="800" height="500" fill="url(#grid)" />
        <rect x="10" y="10" width="780" height="480" rx="4"
          fill="none" stroke="#2A2A3A" strokeWidth="1.5" strokeDasharray="6,3" />

        {SVG_ZONES.map(zone => {
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
              <text x={zone.cx} y={zone.cy - 6} textAnchor="middle"
                fill="white" fontSize="10" fontFamily="Inter, sans-serif"
                fontWeight="600" opacity="0.9">
                {zone.label}
              </text>
              {m && (
                <text x={zone.cx} y={zone.cy + 10} textAnchor="middle"
                  fill={fill} fontSize="13" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                  {m.currentCount}
                </text>
              )}
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
                    <rect x={x0} y={barY} width={barW} height={3} fill="#ffffff10" rx="1.5" />
                    <rect x={x0} y={barY} width={fill100} height={3} fill={fill} rx="1.5" />
                  </g>
                );
              })()}
            </g>
          );
        })}

        {incidentPins.map((pin, i) => (
          <g key={`pin-${i}`}>
            <circle cx={pin._cx} cy={pin._cy - 30} r={10}
              fill="#E24B4A" stroke="#FF6B6A" strokeWidth="1.5"
              className="animate-pulse" />
            <text x={pin._cx} y={pin._cy - 26} textAnchor="middle"
              fill="white" fontSize="9" fontWeight="bold" fontFamily="monospace">
              {pin._idx + 1}
            </text>
          </g>
        ))}

        <g transform="translate(10, 460)">
          {[['#1D9E75', 'Safe <60%'], ['#EF9F27', 'Warning 60-85%'], ['#E24B4A', 'Critical >85%']].map(([c, l], i) => (
            <g key={i} transform={`translate(${i * 130}, 0)`}>
              <rect width="10" height="10" fill={c} fillOpacity="0.6" stroke={c} strokeWidth="1" rx="2" />
              <text x="14" y="9" fill="#aaa" fontSize="9" fontFamily="Inter,sans-serif">{l}</text>
            </g>
          ))}
        </g>
      </svg>

      {hovered && (
        <div className="absolute z-30 pointer-events-none" style={{ left: hovered.zone._tipX + 20, top: hovered.zone._tipY - 10 }}>
          <Tooltip zone={hovered.zone} metrics={hovered.metrics} />
        </div>
      )}

      <HeatmapOverlay visible={showHeatmap} isSimulated={true} />

      <button
        onClick={() => setShowHeatmap(!showHeatmap)}
        className={`absolute top-2 right-2 z-20 px-3 py-1.5 rounded text-xs font-bold transition-colors ${showHeatmap ? 'bg-cs-amber text-black shadow-[0_0_10px_rgba(239,159,39,0.5)]' : 'bg-black/50 text-white hover:bg-black/80'
          }`}
      >
        Heatmap {showHeatmap ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

// ─── Video Map with User Polygons ─────────────────────────────────────────────

function VideoMap({ incidents = [] }) {
  const { footage, userZones } = useFootage();
  const { detections = [], alerts = [] } = useCrowdData();
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [showHeatmap, setShowHeatmap] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw video
    if (videoReady) {
      try { ctx.drawImage(video, 0, 0, W, H); } catch (_) { }
    } else {
      ctx.fillStyle = '#0D0D18';
      ctx.fillRect(0, 0, W, H);
    }

    // Draw user-defined polygons (points are normalized 0-1)
    userZones.forEach(zone => {
      if (!zone.points || zone.points.length < 3) return;
      const pts = zone.points.map(p => ({ x: p.x * W, y: p.y * H }));

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = zone.color + '30';
      ctx.fill();
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulsing ring for active alert zones
      const hasAlert = alerts.some(a => a.zone_id === zone.id && !dismissedAlerts.has(a.id));
      if (hasAlert) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.strokeStyle = '#E24B4A';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 300);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Label
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

      // Background pill for label
      ctx.font = 'bold 12px Inter, sans-serif';
      const tw = ctx.measureText(zone.label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(cx - tw / 2 - 6, cy - 9, tw + 12, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.label, cx, cy);

      // Vertex dots
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = zone.color;
        ctx.fill();
      });
    });

    // Draw real-time bounding boxes from backend
    detections.forEach(box => {
      const x1 = box.x1 * W;
      const y1 = box.y1 * H;
      const x2 = box.x2 * W;
      const y2 = box.y2 * H;
      const bw = x2 - x1;
      const bh = y2 - y1;

      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x1, y1, bw, bh);

      // Track ID
      ctx.fillStyle = '#00FF00';
      ctx.font = '9px monospace';
      ctx.fillText(`ID:${box.track_id}`, x1, y1 > 10 ? y1 - 2 : y1 + 10);
    });

    // Incident pins
    incidents.filter(i => i.status !== 'Resolved').forEach((inc, idx) => {
      if (userZones.length === 0) return;
      const zone = userZones[idx % userZones.length];
      if (!zone || !zone.points || zone.points.length === 0) return;
      const cx = zone.points.reduce((s, p) => s + p.x * W, 0) / zone.points.length;
      const cy = zone.points.reduce((s, p) => s + p.y * H, 0) / zone.points.length;
      ctx.beginPath();
      ctx.arc(cx, cy - 20, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#E24B4A';
      ctx.fill();
      ctx.strokeStyle = '#FF6B6A';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(idx + 1, cx, cy - 20);
    });
  }, [userZones, videoReady, alerts, detections, dismissedAlerts, incidents]);

  // Animation loop
  useEffect(() => {
    let rafId;
    const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

  // Canvas resize
  useEffect(() => {
    const update = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = Math.min(Math.round(window.innerHeight * 0.72), Math.round(rect.width * 9 / 16));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const activeAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));

  return (
    <div className="relative w-full select-none">
      {/* Footage badge */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold"
          style={{
            background: 'rgba(0,0,0,0.65)',
            color: '#ffffff',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-cs-red animate-pulse flex-shrink-0" />
          LIVE MONITORING
        </div>
        {userZones.length > 0 && (
          <div className="bg-cs-amber/20 border border-cs-amber/40 backdrop-blur px-2 py-0.5 rounded-full text-[10px] text-cs-amber font-mono">
            {userZones.length} zone{userZones.length > 1 ? 's' : ''} active
          </div>
        )}
      </div>

      {/* Hidden video element for drawing */}
      <video
        ref={videoRef}
        src={footage.objectUrl}
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={(e) => {
          setVideoReady(true);
          e.target.play().catch(err => console.error("Video autoplay blocked:", err));
        }}
      />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full block rounded-lg border border-cs-border"
        style={{ background: '#0D0D18' }}
      />

      {/* Real-time alert toasts overlaid on the video */}
      {activeAlerts.length > 0 && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-2 max-w-xs z-20">
          {activeAlerts.slice(0, 3).map(alert => (
            <div
              key={alert.id}
              className={`rounded-lg border p-2.5 text-xs backdrop-blur-sm animate-fade-in shadow-lg
                ${alert.severity === 'CRITICAL' || alert.severity === 'P1'
                  ? 'bg-cs-red/20 border-cs-red/50 text-cs-red'
                  : alert.severity === 'WARNING' || alert.severity === 'P2'
                    ? 'bg-cs-amber/20 border-cs-amber/50 text-cs-amber'
                    : 'bg-cs-blue/20 border-cs-blue/50 text-cs-blue'
                }`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-1.5 font-semibold font-mono">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] text-white
                    ${alert.severity === 'CRITICAL' || alert.severity === 'P1' ? 'bg-cs-red' : alert.severity === 'WARNING' || alert.severity === 'P2' ? 'bg-cs-amber' : 'bg-cs-blue'}`}>
                    {alert.severity}
                  </span>
                  {alert.type}
                </div>
                <button
                  onClick={() => setDismissedAlerts(s => new Set([...s, alert.id]))}
                  className="opacity-60 hover:opacity-100 text-white text-xs"
                >✕</button>
              </div>
              <div className="opacity-80 mb-0.5">{alert.zone_id}</div>
              <div className="text-white/80">{alert.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* No zones hint */}
      {userZones.length === 0 && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
          <div className="bg-black/70 text-white text-xs px-4 py-2 rounded-full backdrop-blur">
            No zones defined — go to Upload Footage to mark monitoring zones
          </div>
        </div>
      )}

      <HeatmapOverlay visible={showHeatmap} isSimulated={false} />

      <button
        onClick={() => setShowHeatmap(!showHeatmap)}
        className={`absolute top-2 right-2 z-20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
          showHeatmap
            ? 'bg-cs-amber border-cs-amber text-black shadow-[0_0_12px_rgba(239,159,39,0.6)]'
            : 'bg-gray-900 border-gray-600 text-gray-100 hover:border-cs-amber hover:text-cs-amber'
        }`}
      >
        🌡 Heatmap {showHeatmap ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function VenueMap({ zonesData = [], incidents = [] }) {
  const { footage } = useFootage();

  if (footage?.objectUrl) {
    return <VideoMap incidents={incidents} />;
  }

  return <SVGMap zonesData={zonesData} incidents={incidents} />;
}
