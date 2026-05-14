/**
 * IncidentPanel — Active incidents list (seamless carousel, no declare button).
 * Module A7
 */
import React, { useState, useMemo } from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';
import { useFootage } from '../context/FootageContext.jsx';

const STATUS_COLORS = {
  Open:       'text-cs-red',
  Responding: 'text-cs-amber',
  Resolved:   'text-cs-green',
};

const STATUS_BG = {
  Open:       'bg-cs-red/10 border-cs-red/30',
  Responding: 'bg-cs-amber/10 border-cs-amber/30',
  Resolved:   'bg-cs-green/10 border-cs-green/30',
};

function timeStr(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function IncidentPanel() {
  const { incidents, updateIncidentStatus, zones: defaultZones } = useCrowdData();
  const { userZones } = useFootage();
  const [expandedId, setExpandedId] = useState(null);

  const availableZones = useMemo(() => {
    if (userZones && userZones.length > 0) {
      return userZones.map(z => ({ id: z.id, label: z.label }));
    }
    return defaultZones.map(z => ({ id: z.id, label: z.label || z.id }));
  }, [userZones, defaultZones]);

  const getZoneLabel = (zid) => {
    const z = availableZones.find(az => az.id === zid);
    return z ? z.label : zid;
  };

  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
        <span className="text-3xl">🟢</span>
        <div className="theme-text-dim text-xs font-mono uppercase tracking-wider">No active incidents</div>
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
      {incidents.map(inc => (
        <div
          key={inc.id}
          className={`rounded-[18px] border p-3 transition-all animate-fade-in ${STATUS_BG[inc.status] || STATUS_BG.Open}`}
        >
          <div className="flex items-start justify-between mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border chip-${inc.severity.toLowerCase()}`}>
                {inc.severity}
              </span>
              <span className="theme-text-primary text-xs font-semibold truncate">{inc.type}</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[inc.status]}`}>
              {inc.status}
            </span>
          </div>

          <div className="theme-text-muted text-[10px] mb-1.5 space-y-0.5">
            <div><span className="theme-text-dim">Responder:</span> {inc.assignedResponder}</div>
            <div><span className="theme-text-dim">Zones:</span> {(inc.affectedZones || inc.affected_zones || []).map(z => getZoneLabel(z)).join(', ') || '—'}</div>
          </div>

          {inc.notes?.includes('SOS triggered by Attendee') ? (
            <div className="bg-cs-red/10 border border-cs-red/30 rounded-[12px] p-2 mb-2 text-xs flex items-start gap-2">
              <span className="text-lg leading-none">📍</span>
              <div>
                <div className="text-cs-red font-bold mb-0.5 text-[11px]">Attendee SOS</div>
                <div className="text-cs-red/80 text-[10px]">
                  {(inc.affectedZones || inc.affected_zones || []).map(z => getZoneLabel(z)).join(', ')}
                </div>
                {inc.notes.split('Contact: ')[1] && (
                  <div className="text-cs-red/80 text-[10px]">
                    Emergency Contact: {inc.notes.split('Contact: ')[1]}
                  </div>
                )}
              </div>
            </div>
          ) : inc.notes ? (
            <div className="theme-text-dim text-[10px] mb-2 italic">"{inc.notes}"</div>
          ) : null}

          {/* Status controls */}
          <div className="flex gap-1.5 flex-wrap">
            {inc.status === 'Open' && (
              <button
                onClick={() => updateIncidentStatus(inc.id, 'Responding')}
                className="text-[10px] px-2 py-0.5 rounded-[10px] bg-cs-amber/20 text-cs-amber border border-cs-amber/30 hover:bg-cs-amber/30 transition-colors"
              >
                → Responding
              </button>
            )}
            {inc.status !== 'Resolved' && (
              <button
                onClick={() => updateIncidentStatus(inc.id, 'Resolved')}
                className="text-[10px] px-2 py-0.5 rounded-[10px] bg-cs-green/20 text-cs-green border border-cs-green/30 hover:bg-cs-green/30 transition-colors"
              >
                ✓ Resolve
              </button>
            )}
            <button
              onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
              className="text-[10px] px-2 py-0.5 rounded-[10px] theme-text-dim border theme-border hover:bg-white/5 transition-colors"
            >
              Timeline
            </button>
          </div>

          {expandedId === inc.id && (
            <div className="border-t theme-border pt-2 mt-2 space-y-1">
              {(inc.timeline || []).map((entry, i) => (
                <div key={i} className="flex gap-2 text-[10px] font-mono">
                  <span className="theme-text-dim">{timeStr(entry.ts)}</span>
                  <span className="theme-text-muted">{entry.action}</span>
                  <span className="theme-text-dim ml-auto">{entry.actor}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
