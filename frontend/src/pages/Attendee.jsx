/**
 * Attendee — Mobile-first safety companion panel.
 * Horizontal grid layout. Zone metrics pulled from user-defined zones (FootageContext).
 */
import React, { useState } from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';
import { useFootage } from '../context/FootageContext.jsx';

// Simulated static data for nearby infrastructure
const EXITS = [
  { name: 'South Exit', distance: '120m', status: 'clear', icon: '🚪' },
  { name: 'East Exit',  distance: '280m', status: 'busy',  icon: '🚪' },
  { name: 'West Gate',  distance: '350m', status: 'clear', icon: '🚪' },
];
const MEDICAL_POSTS = [
  { name: 'Medical Bay 1',   distance: '90m',  staffed: true },
  { name: 'First Aid Point', distance: '210m', staffed: true },
  { name: 'Medical Bay 2',   distance: '400m', staffed: false },
];

// ─── Zone Status Card (compact horizontal tile) ────────────────────────────

function ZoneTile({ zone, isSelected, onClick }) {
  if (!zone) return null;
  const occ = Math.min(100, Math.round((zone.currentCount / zone.capacity) * 100));
  const isHigh = occ >= 85;
  const isMid  = occ >= 60;
  const barColor = isHigh ? 'bg-red-500' : isMid ? 'bg-amber-500' : 'bg-green-500';
  const borderColor = isHigh ? 'border-red-400' : isMid ? 'border-amber-400' : 'border-green-400';
  const emoji = isHigh ? '⚠️' : isMid ? '🟡' : '✅';

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer w-full ${
        isSelected
          ? `${borderColor} shadow-lg`
          : 'theme-border card hover:opacity-90'
      }`}
      style={isSelected ? { borderColor: isHigh ? '#f87171' : isMid ? '#fbbf24' : '#34d399' } : {}}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="theme-text-muted text-xs font-semibold uppercase tracking-wider truncate pr-2">
          {zone.label}
        </span>
        <span className="text-lg flex-shrink-0">{emoji}</span>
      </div>
      <div className="text-2xl font-bold font-mono theme-text-primary mb-1">{occ}%</div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${occ}%` }} />
      </div>
      <div className="flex justify-between mt-2 text-xs theme-text-muted font-mono">
        <span>{zone.currentCount} ppl</span>
        <span>cap {zone.capacity}</span>
      </div>
    </button>
  );
}

// ─── Big selected zone detail panel ──────────────────────────────────────

function ZoneDetailPanel({ zone }) {
  if (!zone) return (
    <div className="card rounded-2xl p-6 text-center theme-text-muted text-sm">
      Select a zone above to view details
    </div>
  );

  const occ = Math.min(100, Math.round((zone.currentCount / zone.capacity) * 100));
  const isHigh = occ >= 85;
  const isMid  = occ >= 60;
  const barColor = isHigh ? 'bg-red-500' : isMid ? 'bg-amber-500' : 'bg-green-500';
  const textColor = isHigh ? 'text-red-500' : isMid ? 'text-amber-500' : 'text-green-500';
  const label = isHigh ? 'Crowded' : isMid ? 'Moderate' : 'Comfortable';

  return (
    <div className="card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="theme-text-muted text-xs uppercase tracking-wider mb-0.5">Selected Zone</div>
          <div className="theme-text-primary text-xl font-bold">{zone.label}</div>
        </div>
        <div className={`text-lg font-bold px-3 py-1 rounded-full border text-sm ${textColor}`}
             style={{ borderColor: 'currentColor', background: 'rgba(0,0,0,0.05)' }}>
          {label}
        </div>
      </div>

      {/* Occupancy bar */}
      <div>
        <div className="flex justify-between text-xs theme-text-muted mb-1">
          <span>Occupancy</span>
          <span className={`font-mono font-bold ${textColor}`}>{occ}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${occ}%` }} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'People',    val: zone.currentCount,                      unit: '' },
          { label: 'Capacity',  val: zone.capacity,                          unit: '' },
          { label: 'Flow',      val: zone.movementVector?.direction || '—',  unit: '' },
        ].map(({ label, val, unit }) => (
          <div key={label} className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)' }}>
            <div className="theme-text-muted text-xs mb-0.5">{label}</div>
            <div className="theme-text-primary font-bold text-base font-mono capitalize">{val}{unit}</div>
          </div>
        ))}
      </div>

      {isHigh && (
        <div className="bg-red-500/10 border border-red-400/40 rounded-xl p-3 text-red-400 text-sm">
          <span className="font-semibold">⚠️ Heads up:</span> {zone.label} is at {occ}% capacity.
          {' '}Consider using <span className="font-semibold">South Exit</span> for a faster route.
        </div>
      )}
      {isMid && !isHigh && (
        <div className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-3 text-amber-400 text-sm">
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

  if (sent) return (
    <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 text-center">
      <div className="text-4xl mb-2">🆘</div>
      <div className="text-red-700 font-bold text-lg">SOS Sent!</div>
      <div className="text-red-600 text-sm mt-1">Security is being notified. Stay where you are.</div>
    </div>
  );

  if (confirm) return (
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

// ─── Main Attendee Page ──────────────────────────────────────────────────────

export default function Attendee() {
  const { zones, alerts, logAction } = useCrowdData();
  const { userZones } = useFootage();
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Use user-defined zones from FootageContext if available; otherwise fall back to backend zones
  const displayZones = userZones.length > 0
    ? userZones.map(uz => {
        // Try to find matching backend zone by label for live metrics
        const backendZone = zones.find(z => z.label?.toLowerCase() === uz.label?.toLowerCase());
        return {
          id: uz.id,
          label: uz.label,
          color: uz.color,
          currentCount: backendZone?.currentCount ?? Math.floor(Math.random() * 30 + 5),
          capacity: backendZone?.capacity ?? 100,
          movementVector: backendZone?.movementVector,
          riskScore: backendZone?.riskScore ?? 0,
        };
      })
    : zones.slice(0, 8);

  const selectedZone = displayZones[selectedIdx] || displayZones[0];
  const criticalAlerts = alerts.filter(a => a.severity === 'P1' && a.status === 'open').slice(0, 2);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="theme-text-primary text-xl font-bold">Safety Companion</h1>
            <p className="theme-text-muted text-sm">
              {userZones.length > 0 ? `${userZones.length} custom zones loaded` : 'Live venue monitoring'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
               style={{ background: 'var(--surface-2)' }}>👤</div>
        </div>

        {/* Critical broadcast alerts */}
        {criticalAlerts.map(a => (
          <div key={a.id} className="bg-red-500/10 border border-red-400/40 rounded-xl p-3 flex gap-3">
            <span className="text-xl shrink-0">🔔</span>
            <div>
              <div className="text-red-400 font-semibold text-sm">Safety Alert — {a.zone_id}</div>
              <div className="text-red-400/80 text-xs mt-0.5">{a.message}</div>
            </div>
          </div>
        ))}

        {/* Zone tiles — horizontal grid */}
        {displayZones.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {displayZones.map((zone, i) => (
              <ZoneTile
                key={zone.id}
                zone={zone}
                isSelected={i === selectedIdx}
                onClick={() => setSelectedIdx(i)}
              />
            ))}
          </div>
        ) : (
          <div className="card rounded-2xl p-6 text-center theme-text-muted text-sm">
            No zones loaded — upload footage and mark zones first.
          </div>
        )}

        {/* Selected zone detail */}
        <ZoneDetailPanel zone={selectedZone} />

        {/* SOS Button */}
        <SOSButton onSOS={() => logAction('🆘 SOS triggered by attendee')} />

        {/* Exits & Medical — horizontal two-column layout */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border overflow-hidden card">
            <div className="px-4 py-3 border-b theme-border">
              <h2 className="theme-text-primary font-semibold text-sm">🚪 Nearest Exits</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {EXITS.map(exit => (
                <div key={exit.name} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="theme-text-primary font-medium text-xs">{exit.name}</div>
                    <div className="theme-text-muted text-[10px]">{exit.distance}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    exit.status === 'clear' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {exit.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden card">
            <div className="px-4 py-3 border-b theme-border">
              <h2 className="theme-text-primary font-semibold text-sm">🏥 Medical Posts</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {MEDICAL_POSTS.map(post => (
                <div key={post.name} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="theme-text-primary font-medium text-xs">{post.name}</div>
                    <div className="theme-text-muted text-[10px]">{post.distance}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    post.staffed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {post.staffed ? 'STAFFED' : 'UNSTAFFED'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Safety tips */}
        <div className="bg-blue-500/10 border border-blue-400/30 rounded-2xl p-4">
          <h3 className="text-blue-400 font-semibold text-sm mb-2">💡 Safety Tips</h3>
          <ul className="text-blue-300/80 text-xs space-y-1">
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
