/**
 * Attendee — Mobile-first safety companion panel.
 * Horizontal grid layout. Zone metrics pulled from user-defined zones (FootageContext).
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
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

function SOSButton({ onSOS, zone, contact, incidents, activeIncidentId, setActiveIncidentId }) {
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState(false);

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const lfoRef = useRef(null);
  const vibrateIntervalRef = useRef(null);

  const stopAlarm = () => {
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch(e){}
      oscillatorRef.current = null;
    }
    if (lfoRef.current) {
      try { lfoRef.current.stop(); } catch(e){}
      lfoRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch(e){}
      audioCtxRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
  };

  // Watch for incident status resolving on the dashboard
  useEffect(() => {
    if (sent && activeIncidentId) {
      const inc = incidents.find(i => i.id === activeIncidentId || i.incident_id === activeIncidentId);
      if (inc && inc.status === 'Resolved') {
        stopAlarm();
        setSent(false);
        setActiveIncidentId(null);
      }
    }
  }, [incidents, activeIncidentId, sent, setActiveIncidentId]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopAlarm();
  }, []);

  const handleSOS = async () => {
    setSent(true);
    setConfirm(false);
    const incId = await onSOS();
    if (incId) setActiveIncidentId(incId);
    
    // Play Continuous Siren using AudioContext
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const mainGain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.value = 600;

        lfo.type = 'sine';
        lfo.frequency.value = 2.5; // sweep 2.5 times a second
        
        lfoGain.gain.value = 200; // Sweep between 400 and 800 Hz

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.connect(mainGain);
        mainGain.connect(ctx.destination);
        
        mainGain.gain.value = 0.5;

        osc.start();
        lfo.start();

        oscillatorRef.current = osc;
        lfoRef.current = lfo;
      }
    } catch (e) {
      console.warn('AudioContext not supported');
    }

    // Trigger Continuous Vibration
    if (navigator.vibrate) {
      // initial
      navigator.vibrate([500, 200, 500, 200]);
      vibrateIntervalRef.current = setInterval(() => {
        navigator.vibrate([500, 200, 500, 200]);
      }, 1500);
    }

    // Dial emergency number if contact is provided
    if (contact) {
      const numbers = contact.replace(/[^0-9+]/g, '');
      if (numbers) {
        window.location.href = `tel:${numbers}`;
      }
    }
  };

  if (sent) return (
    <div className="card border-2 border-red-500/40 rounded-2xl p-5 text-center">
      <div className="text-4xl mb-2">🆘</div>
      <div className="text-red-500 font-bold text-lg mb-4">SOS Sent! Security Notified.</div>
      
      {/* Mini map container */}
      <div className="rounded-xl p-3 mb-4 h-32 flex flex-col items-center justify-center border theme-border" style={{ background: 'var(--surface-2)' }}>
         <div className="text-2xl mb-1">📍</div>
         <div className="theme-text-primary font-semibold text-sm">Location Shared:</div>
         <div className="theme-text-muted text-xs">{zone?.label || 'Current Location'}</div>
      </div>
      
      <div className="rounded-xl p-3 text-left border border-red-500/20 mb-4" style={{ background: 'var(--surface)' }}>
        <div className="theme-text-muted text-xs mb-1">Emergency Contact Notified:</div>
        <div className="font-bold theme-text-primary">{contact || 'None saved'}</div>
      </div>

      <button onClick={() => { stopAlarm(); setSent(false); setActiveIncidentId(null); }} className="w-full py-2 rounded-[20px] theme-text-primary font-semibold text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Dismiss</button>
    </div>
  );

  if (confirm) return (
    <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-5">
      <div className="text-center mb-4">
        <div className="text-red-500 font-bold text-base">Confirm SOS Request?</div>
        <div className="theme-text-muted text-sm mt-1">This will alert security immediately.</div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setConfirm(false)} className="flex-1 py-3 rounded-xl border-2 theme-border theme-text-primary font-semibold hover:bg-white/5">Cancel</button>
        <button onClick={handleSOS} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-lg hover:bg-red-700">Send SOS</button>
      </div>
    </div>
  );

  return (
    <button
      onClick={() => setConfirm(true)}
      className="w-full py-5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xl rounded-[24px] flex items-center justify-center gap-3 transition-all"
      style={{ boxShadow: '0 2px 8px rgba(226,75,74,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}
    >
      <span className="text-3xl">🆘</span>
      <span className="text-white font-bold">Emergency SOS</span>
    </button>
  );
}

// ─── Main Attendee Page ──────────────────────────────────────────────────────

export default function Attendee() {
  const { zones, alerts, logAction, declareIncident, incidents } = useCrowdData();
  const { userZones } = useFootage();
  const [selectedIdx, setSelectedIdx] = useState(0);
  
  // Emergency Contact State
  const [contact, setContact] = useState('');
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [tempContact, setTempContact] = useState('');

  // Track active incident ID
  const [activeIncidentId, setActiveIncidentId] = useState(null);

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

  // Build a zone label map from userZones for alert display
  const zoneLabelMap = useMemo(() => {
    const map = {};
    userZones.forEach(z => { map[z.id] = z.label; });
    return map;
  }, [userZones]);

  const resolveAlertZone = (a) => {
    if (a.zone_id && zoneLabelMap[a.zone_id]) return zoneLabelMap[a.zone_id];
    if (a.zone && zoneLabelMap[a.zone]) return zoneLabelMap[a.zone];
    return a.zoneLabel || a.zone || a.zone_id || 'Unknown Zone';
  };

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
              <div className="text-red-400 font-semibold text-sm">Safety Alert — {resolveAlertZone(a)}</div>
              <div className="text-red-400/80 text-xs mt-0.5">{a.message}</div>
            </div>
          </div>
        ))}

        {/* Zone tiles — horizontal grid */}
        {displayZones.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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

        {/* Emergency Contact */}
        <div className="card rounded-2xl p-5 mb-4 border border-blue-400/30 bg-blue-500/5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="theme-text-primary font-semibold text-sm">📞 Emergency Contact</h2>
            {!isEditingContact && (
              <button 
                onClick={() => { setTempContact(contact); setIsEditingContact(true); }}
                className="text-xs text-blue-500 hover:text-blue-400 font-semibold"
              >
                {contact ? 'Edit' : '+ Add Contact'}
              </button>
            )}
          </div>
          
          {isEditingContact ? (
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="e.g. John Doe (555-0198)" 
                value={tempContact} 
                onChange={e => setTempContact(e.target.value)}
                className="flex-1 bg-transparent border theme-border rounded px-3 py-1.5 text-sm theme-text-primary focus:outline-none focus:border-blue-500"
              />
              <button 
                onClick={() => { setContact(tempContact); setIsEditingContact(false); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-semibold"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="theme-text-muted text-sm">
              {contact || 'No emergency contact saved. Add one for SOS notifications.'}
            </div>
          )}
        </div>

        {/* SOS Button */}
        <SOSButton 
          zone={selectedZone}
          contact={contact}
          incidents={incidents}
          activeIncidentId={activeIncidentId}
          setActiveIncidentId={setActiveIncidentId}
          onSOS={async () => {
            logAction('🆘 SOS triggered by attendee');
            if (declareIncident) {
              const inc = await declareIncident({
                type: 'Medical',
                severity: 'P1',
                assigned_responder: 'Unassigned',
                affected_zones: [selectedZone?.id || 'Unknown'],
                notes: `SOS triggered by Attendee from ${selectedZone?.label || 'Unknown'} area. Contact: ${contact || 'None'}`
              });
              return inc?.incident_id || inc?.id;
            }
            return null;
          }} 
        />

        {/* Exits & Medical — horizontal two-column layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <h3 className="text-blue-500 font-semibold text-sm mb-2">💡 Safety Tips</h3>
          <ul className="theme-text-primary text-xs space-y-1">
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
