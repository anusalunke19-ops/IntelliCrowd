/**
 * Attendee — Mobile-first safety companion panel.
 * Module A8: light theme, zone status card, SOS button, exits & medical posts.
 */
import React, { useState } from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';

// Simulated static data for nearby infrastructure
const EXITS = [
  { name: 'South Exit', distance: '120m', status: 'clear', icon: '🚪' },
  { name: 'East Exit',  distance: '280m', status: 'busy',  icon: '🚪' },
  { name: 'West Gate',  distance: '350m', status: 'clear', icon: '🚪' },
];
const MEDICAL_POSTS = [
  { name: 'Medical Bay 1',  distance: '90m',  staffed: true },
  { name: 'First Aid Point', distance: '210m', staffed: true },
  { name: 'Medical Bay 2',  distance: '400m', staffed: false },
];

const ZONE_NAME_MAP = {
  gate_n: 'Gate North', gate_s: 'Gate South', gate_e: 'Gate East', gate_w: 'Gate West',
  main_stage: 'Main Stage', food_court: 'Food Court', parking_exit: 'Parking Exit', muster_point_a: 'Muster Point A',
};

// Attendee's "current zone" rotates for demo
const DEMO_ZONE_SEQ = ['main_stage', 'food_court', 'gate_s', 'muster_point_a'];

function ZoneStatusCard({ zone }) {
  if (!zone) return null;
  const occ = Math.min(100, Math.round((zone.currentCount / zone.capacity) * 100));
  const isHigh = occ >= 85;
  const isMid  = occ >= 60;

  const bgColor  = isHigh ? 'bg-red-50 border-red-200'   : isMid ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200';
  const barColor = isHigh ? 'bg-red-500'   : isMid ? 'bg-amber-500' : 'bg-green-500';
  const textColor= isHigh ? 'text-red-600' : isMid ? 'text-amber-600' : 'text-green-600';
  const label    = isHigh ? 'Crowded'      : isMid ? 'Moderate'       : 'Comfortable';
  const emoji    = isHigh ? '⚠️' : isMid ? '🟡' : '✅';

  return (
    <div className={`rounded-2xl border-2 p-5 ${bgColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-500 text-sm font-medium uppercase tracking-wide">Your Zone</span>
        <span className="text-xl">{emoji}</span>
      </div>
      <div className="text-gray-900 text-2xl font-bold mb-1">{zone.label || ZONE_NAME_MAP[zone.id]}</div>
      <div className={`text-lg font-semibold mb-3 ${textColor}`}>{label}</div>

      {/* Occupancy bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Occupancy</span><span>{occ}%</span>
        </div>
        <div className="h-3 bg-white/60 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${occ}%` }}/>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div className="bg-white/60 rounded-xl p-3 text-center">
          <div className="text-gray-500 text-xs mb-0.5">People nearby</div>
          <div className="text-gray-900 font-bold text-xl">{zone.currentCount}</div>
        </div>
        <div className="bg-white/60 rounded-xl p-3 text-center">
          <div className="text-gray-500 text-xs mb-0.5">Flow</div>
          <div className="text-gray-900 font-bold text-base capitalize">{zone.movementVector?.direction || 'Normal'}</div>
        </div>
      </div>

      {/* Personalised message */}
      {isHigh && (
        <div className="mt-3 bg-red-100 border border-red-300 rounded-xl p-3 text-red-700 text-sm">
          <span className="font-semibold">Heads up:</span> {zone.label} is at {occ}% capacity.
          {' '}Use <span className="font-semibold">South Exit</span> for a faster route out.
        </div>
      )}
      {isMid && !isHigh && (
        <div className="mt-3 bg-amber-100 border border-amber-300 rounded-xl p-3 text-amber-700 text-sm">
          Getting busier here — consider moving to a less crowded area.
        </div>
      )}
    </div>
  );
}

function SOSButton({ onSOS }) {
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSOS = () => {
    setSent(true);
    setConfirm(false);
    onSOS();
    setTimeout(() => setSent(false), 5000);
  };

  if (sent) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 text-center">
        <div className="text-4xl mb-2">🆘</div>
        <div className="text-red-700 font-bold text-lg">SOS Sent!</div>
        <div className="text-red-600 text-sm mt-1">Security is being notified. Stay where you are.</div>
      </div>
    );
  }

  if (confirm) {
    return (
      <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-red-700 font-bold text-base">Confirm SOS Request?</div>
          <div className="text-gray-500 text-sm mt-1">This will alert security immediately.</div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setConfirm(false)} className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-600 font-semibold">Cancel</button>
          <button onClick={handleSOS} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-lg">Send SOS</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="w-full py-5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xl rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-red-200"
    >
      <span className="text-3xl">🆘</span>
      Emergency SOS
    </button>
  );
}

export default function Attendee() {
  const { zones, alerts, logAction } = useCrowdData();
  const [currentZoneIdx, setCurrentZoneIdx] = useState(0);
  const currentZoneId = DEMO_ZONE_SEQ[currentZoneIdx % DEMO_ZONE_SEQ.length];
  const currentZone = zones.find(z => z.id === currentZoneId) || zones[0];

  const criticalAlerts = alerts.filter(a => a.severity === 'P1' && a.status === 'open').slice(0, 2);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="theme-text-primary text-xl font-bold">Safety Companion</h1>
            <p className="theme-text-muted text-sm">Sunburn Festival 2026</p>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--surface-2)' }}>👤</div>
        </div>

        {/* Critical broadcast alerts */}
        {criticalAlerts.map(a => (
          <div key={a.id} className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-3">
            <span className="text-xl shrink-0">🔔</span>
            <div>
              <div className="text-red-700 font-semibold text-sm">Safety Alert — {a.zoneLabel}</div>
              <div className="text-red-600 text-xs mt-0.5">{a.message}</div>
            </div>
          </div>
        ))}

        {/* Zone status */}
        <ZoneStatusCard zone={currentZone} />

        {/* Zone switcher (demo) */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DEMO_ZONE_SEQ.map((zid, i) => {
            const z = zones.find(z => z.id === zid);
            const occ = z ? Math.round((z.currentCount / z.capacity) * 100) : 0;
            const dot = occ >= 85 ? 'bg-red-500' : occ >= 60 ? 'bg-amber-500' : 'bg-green-500';
            const isActive = i === currentZoneIdx % DEMO_ZONE_SEQ.length;
            return (
              <button
                key={zid}
                onClick={() => setCurrentZoneIdx(i)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all font-medium"
                style={isActive ? {
                  background: '#EF9F27',
                  borderColor: '#EF9F27',
                  color: '#0A0A0F',
                } : {
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <span className={`w-2 h-2 rounded-full ${dot}`}/>
                {ZONE_NAME_MAP[zid]}
              </button>
            );
          })}
        </div>

        {/* SOS Button */}
        <SOSButton onSOS={() => logAction('🆘 SOS triggered by attendee')} />

        {/* Exits */}
        <div className="rounded-2xl border overflow-hidden card">
          <div className="px-4 py-3 border-b theme-border">
            <h2 className="theme-text-primary font-semibold text-base">Nearest Exits</h2>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {EXITS.map(exit => (
              <div key={exit.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{exit.icon}</span>
                  <div>
                    <div className="theme-text-primary font-medium text-sm">{exit.name}</div>
                    <div className="theme-text-muted text-xs">{exit.distance} away</div>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  exit.status === 'clear'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {exit.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Medical posts */}
        <div className="rounded-2xl border overflow-hidden card">
          <div className="px-4 py-3 border-b theme-border">
            <h2 className="theme-text-primary font-semibold text-base">Medical Posts</h2>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {MEDICAL_POSTS.map(post => (
              <div key={post.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏥</span>
                  <div>
                    <div className="theme-text-primary font-medium text-sm">{post.name}</div>
                    <div className="theme-text-muted text-xs">{post.distance} away</div>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  post.staffed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {post.staffed ? 'STAFFED' : 'UNSTAFFED'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <h3 className="text-blue-800 font-semibold text-sm mb-2">💡 Safety Tips</h3>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Stay with your group and agree on a meeting point</li>
            <li>• If you feel pushed, keep arms out to protect space</li>
            <li>• Move with the crowd — never against it</li>
            <li>• Report any hazards to the nearest steward</li>
          </ul>
        </div>

        <div className="theme-text-dim text-center text-xs pb-4">
          IntelliCrowd Safety System · Version 1.0
        </div>
      </div>
    </div>
  );
}
