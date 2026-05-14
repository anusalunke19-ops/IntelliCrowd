/**
 * IncidentPanel — Incident declaration form and active incidents list.
 * Module A7
 */
import React, { useState } from 'react';
import { useCrowdData } from '../context/CrowdDataContext.jsx';

const INCIDENT_TYPES = ['Overcrowding', 'Medical', 'Evacuation', 'Security'];
const SEVERITIES = ['P1', 'P2', 'P3'];
const ALL_ZONES = ['gate_n','gate_s','gate_e','gate_w','main_stage','food_court','parking_exit','muster_point_a'];
const ZONE_LABELS = {
  gate_n: 'Gate North', gate_s: 'Gate South', gate_e: 'Gate East', gate_w: 'Gate West',
  main_stage: 'Main Stage', food_court: 'Food Court', parking_exit: 'Parking Exit', muster_point_a: 'Muster Pt A',
};

const STATUS_COLORS = {
  Open:       'text-cs-red',
  Responding: 'text-cs-amber',
  Resolved:   'text-cs-green',
};

function timeStr(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function IncidentPanel() {
  const { incidents, declareIncident, updateIncidentStatus, logAction } = useCrowdData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'Overcrowding', severity: 'P1', zones: [], responder: '', notes: '' });
  const [expandedId, setExpandedId] = useState(null);

  const toggleZone = (zid) => {
    setForm(f => ({
      ...f,
      zones: f.zones.includes(zid) ? f.zones.filter(z => z !== zid) : [...f.zones, zid],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.responder.trim()) return;
    const inc = declareIncident({
      type: form.type,
      affectedZones: form.zones,
      affected_zones: form.zones,
      severity: form.severity,
      assignedResponder: form.responder,
      notes: form.notes,
    });
    logAction(`Incident ${inc.id} declared: ${form.type} (${form.severity}) — ${form.responder}`);
    setShowForm(false);
    setForm({ type: 'Overcrowding', severity: 'P1', zones: [], responder: '', notes: '' });
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowForm(v => !v)}
        className="w-full bg-cs-red/20 text-cs-red border border-cs-red/40 rounded-lg py-2 text-sm font-semibold hover:bg-cs-red/30 transition-colors flex items-center justify-center gap-2"
      >
        <span>⚠️</span> {showForm ? 'Cancel' : 'Declare New Incident'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full bg-cs-bg border border-cs-border rounded px-2 py-1.5 text-white text-xs"
              >
                {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Severity</label>
              <select
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="w-full bg-cs-bg border border-cs-border rounded px-2 py-1.5 text-white text-xs"
              >
                {SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">Affected Zones</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ZONES.map(zid => (
                <button
                  type="button"
                  key={zid}
                  onClick={() => toggleZone(zid)}
                  className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                    form.zones.includes(zid)
                      ? 'bg-cs-amber/30 text-cs-amber border-cs-amber/50'
                      : 'bg-white/5 text-gray-400 border-gray-700/50 hover:border-gray-500'
                  }`}
                >
                  {ZONE_LABELS[zid]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Assigned Responder</label>
            <input
              value={form.responder}
              onChange={e => setForm(f => ({ ...f, responder: e.target.value }))}
              placeholder="Team lead name or unit..."
              className="w-full bg-cs-bg border border-cs-border rounded px-2 py-1.5 text-white text-xs placeholder-gray-600"
              required
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional context..."
              rows={2}
              className="w-full bg-cs-bg border border-cs-border rounded px-2 py-1.5 text-white text-xs placeholder-gray-600 resize-none"
            />
          </div>

          <button type="submit" className="w-full btn-primary py-2">
            Declare Incident
          </button>
        </form>
      )}

      {/* Active incidents */}
      <div className="space-y-2 overflow-y-auto max-h-64">
        {incidents.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-4">No active incidents</div>
        )}
        {incidents.map(inc => (
          <div key={inc.id} className="card p-3">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-gray-500">{inc.id}</span>
                <span className={`chip-${inc.severity.toLowerCase()}`}>{inc.severity}</span>
                <span className="text-white text-xs font-semibold">{inc.type}</span>
              </div>
              <span className={`text-xs font-semibold ${STATUS_COLORS[inc.status]}`}>{inc.status}</span>
            </div>

            <div className="text-xs text-gray-400 mb-2">
              <span className="text-gray-500">Responder:</span> {inc.assignedResponder}
              {' · '}
              <span className="text-gray-500">Zones:</span> {(inc.affectedZones || []).map(z => ZONE_LABELS[z] || z).join(', ')}
            </div>

            {inc.notes?.includes('SOS triggered by Attendee') ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded p-2 mb-2 text-xs flex items-start gap-2">
                <span className="text-xl leading-none">📍</span>
                <div>
                  <div className="text-red-400 font-bold mb-0.5">Attendee SOS Request</div>
                  <div className="text-red-300/80">Location: {(inc.affectedZones || []).map(z => ZONE_LABELS[z] || z).join(', ')}</div>
                  <div className="text-red-300/80">{inc.notes.split('Contact: ')[1] ? `Emergency Contact: ${inc.notes.split('Contact: ')[1]}` : ''}</div>
                </div>
              </div>
            ) : inc.notes ? (
              <div className="text-[10px] text-gray-400 mb-2 italic">"{inc.notes}"</div>
            ) : null}

            {/* Status buttons */}
            <div className="flex gap-1.5 mb-2">
              {inc.status === 'Open' && (
                <button
                  onClick={() => updateIncidentStatus(inc.id, 'Responding')}
                  className="text-[10px] px-2 py-0.5 rounded bg-cs-amber/20 text-cs-amber border border-cs-amber/30 hover:bg-cs-amber/30"
                >
                  → Responding
                </button>
              )}
              {inc.status !== 'Resolved' && (
                <button
                  onClick={() => updateIncidentStatus(inc.id, 'Resolved')}
                  className="text-[10px] px-2 py-0.5 rounded bg-cs-green/20 text-cs-green border border-cs-green/30 hover:bg-cs-green/30"
                >
                  ✓ Resolve
                </button>
              )}
              <button
                onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
                className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-gray-700/50 hover:bg-white/10"
              >
                Timeline
              </button>
            </div>

            {/* Timeline */}
            {expandedId === inc.id && (
              <div className="border-t border-cs-border pt-2 space-y-1">
                {(inc.timeline || []).map((entry, i) => (
                  <div key={i} className="flex gap-2 text-[10px] font-mono">
                    <span className="text-gray-600">{timeStr(entry.ts)}</span>
                    <span className="text-gray-300">{entry.action}</span>
                    <span className="text-gray-500 ml-auto">{entry.actor}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
