/**
 * UploadFootage — Drag-and-drop video upload with polygon zone editor.
 * Users can upload video, give it a name and venue, then draw zone polygons
 * that will be shown on the main dashboard.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFootage } from '../context/FootageContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

// Preset zone colors
const ZONE_COLORS = [
  '#EF9F27', '#1D9E75', '#3B82F6', '#A855F7',
  '#EC4899', '#14B8A6', '#F97316', '#EF4444',
];

const PRESET_ZONE_NAMES = [
  'Main Stage', 'Gate North', 'Gate South', 'Gate East', 'Gate West',
  'Food Court', 'Parking Exit', 'Muster Point A', 'VIP Area', 'Medical Bay',
];

// ─── Step 1: Upload Panel ────────────────────────────────────────────────────

function UploadStep({ onNext }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      setError('Please upload a valid video file (MP4, MOV, WebM, etc.)');
      return;
    }
    setError('');
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const onInputChange = (e) => handleFile(e.target.files[0]);

  const handleNext = () => {
    if (!file) { setError('Please upload a video file.'); return; }
    if (!name.trim()) { setError('Please enter a footage name.'); return; }
    if (!venue.trim()) { setError('Please enter a venue name.'); return; }
    onNext({ file, previewUrl, name: name.trim(), venue: venue.trim(), city: city.trim() });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold theme-text-primary mb-1">Upload Video Footage</h2>
        <p className="theme-text-muted text-sm">Upload your surveillance or event video to begin zone analysis.</p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-[24px] transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-md
          ${dragging
            ? 'border-cs-amber bg-cs-amber/10 scale-[1.01]'
            : file
              ? 'border-cs-green/60 bg-cs-green/5'
              : 'border-cs-amber/60 bg-white/5 hover:border-cs-amber hover:bg-cs-amber/10'
          }`}
        style={{ minHeight: '220px', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.1)' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onInputChange}
        />

        {file && previewUrl ? (
          <div className="p-4">
            <video
              src={previewUrl}
              className="w-full rounded-xl max-h-48 object-contain bg-black"
              controls
              muted
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <span className="text-cs-green text-lg">✅</span>
                <div>
                  <div className="theme-text-primary text-sm font-semibold truncate max-w-xs">{file.name}</div>
                  <div className="theme-text-muted text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreviewUrl(null); }}
                className="text-xs text-cs-red border border-cs-red/40 px-3 py-1 rounded-lg hover:bg-cs-red/10 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center select-none">
            <div className={`text-5xl mb-4 transition-transform duration-300 ${dragging ? 'scale-125' : ''}`}>
              🎬
            </div>
            <div className="theme-text-primary font-semibold text-base mb-1">
              {dragging ? 'Drop video here' : 'Drag & drop your video'}
            </div>
            <div className="theme-text-muted text-sm mb-4">
              or click to browse — MP4, MOV, WebM, AVI supported
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="btn-primary px-6 py-2 rounded-xl text-sm"
            >
              Browse File
            </button>
          </div>
        )}
      </div>

      {/* Metadata Fields */}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block theme-text-muted text-xs font-semibold uppercase tracking-wider mb-1.5">
            Footage / Event Name *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sunburn Festival 2026"
            className="w-full theme-input px-4 py-2.5 rounded-xl text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block theme-text-muted text-xs font-semibold uppercase tracking-wider mb-1.5">
              Venue Name *
            </label>
            <input
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder="e.g. Main Venue"
              className="w-full theme-input px-4 py-2.5 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block theme-text-muted text-xs font-semibold uppercase tracking-wider mb-1.5">
              City / Location
            </label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Goa, India"
              className="w-full theme-input px-4 py-2.5 rounded-xl text-sm"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-cs-red/10 border border-cs-red/30 rounded-xl px-4 py-3 text-cs-red text-sm">
          ⚠️ {error}
        </div>
      )}

      <button
        onClick={handleNext}
        className="w-full btn-primary py-3 rounded-xl text-base font-semibold flex items-center justify-center gap-2"
      >
        <span>Next: Mark Zones</span>
        <span>→</span>
      </button>
    </div>
  );
}

// ─── Step 2: Polygon Editor ──────────────────────────────────────────────────

function PolygonEditor({ videoUrl, onSave }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [zones, setZones] = useState([]);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [zoneName, setZoneName] = useState('');
  const [colorIdx, setColorIdx] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 450 });
  const [hoveredPt, setHoveredPt] = useState(null);
  const [instruction, setInstruction] = useState('Click on the video to place polygon points. Double-click to close the zone.');

  // ─ Draw everything on canvas ─────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame
    if (videoReady) {
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); } catch (_) {}
    } else {
      ctx.fillStyle = '#0D0D18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw committed zones
    zones.forEach(zone => {
      if (zone.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(zone.points[0].x, zone.points[0].y);
      zone.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = zone.color + '33';
      ctx.fill();
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      const cx = zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length;
      const cy = zone.points.reduce((s, p) => s + p.y, 0) / zone.points.length;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(zone.label, cx, cy);
      ctx.shadowBlur = 0;

      // Vertex dots
      zone.points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = zone.color;
        ctx.fill();
      });
    });

    // Draw in-progress polygon
    if (currentPoints.length > 0) {
      const color = ZONE_COLORS[colorIdx % ZONE_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      if (hoveredPt) ctx.lineTo(hoveredPt.x, hoveredPt.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      currentPoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#fff' : color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      });
    }
  }, [zones, currentPoints, colorIdx, videoReady, hoveredPt]);

  // Draw loop
  useEffect(() => {
    let rafId;
    const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

  // Resize canvas to match container
  useEffect(() => {
    const updateSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = rect.width;
      const h = Math.round(w * 9 / 16);
      canvas.width = w;
      canvas.height = h;
      setCanvasSize({ w, h });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleClick = (e) => {
    if (e.detail === 2) return; // handled by dblclick
    const pos = getPos(e);
    // Close polygon if clicking near first point
    if (currentPoints.length >= 3) {
      const first = currentPoints[0];
      const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
      if (dist < 14) { closePolygon(); return; }
    }
    setCurrentPoints(prev => [...prev, pos]);
    setInstruction('Keep clicking to add points. Double-click or click the first point to close the zone.');
  };

  const handleDblClick = (e) => {
    if (currentPoints.length >= 3) closePolygon();
  };

  const closePolygon = () => {
    if (currentPoints.length < 3) return;
    const label = zoneName.trim() || `Zone ${zones.length + 1}`;
    const color = ZONE_COLORS[colorIdx % ZONE_COLORS.length];
    const id = `user_zone_${Date.now()}`;
    setZones(prev => [...prev, { id, label, points: currentPoints, color }]);
    setCurrentPoints([]);
    setColorIdx(i => (i + 1) % ZONE_COLORS.length);
    setZoneName('');
    setInstruction('Zone saved! Click to start drawing the next zone, or click "Finish" when done.');
  };

  const cancelCurrent = () => {
    setCurrentPoints([]);
    setInstruction('Click on the video to place polygon points. Double-click to close the zone.');
  };

  const removeZone = (id) => setZones(prev => prev.filter(z => z.id !== id));

  const handleSave = () => {
    // Normalize points to 0-1 range based on canvas size
    const canvas = canvasRef.current;
    const normalized = zones.map(z => ({
      ...z,
      points: z.points.map(p => ({ x: p.x / canvas.width, y: p.y / canvas.height })),
    }));
    onSave(normalized);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold theme-text-primary mb-1">Mark Monitoring Zones</h2>
        <p className="theme-text-muted text-sm">Draw polygons on the video to define zones. These will appear on the dashboard map.</p>
      </div>

      {/* Zone name + color picker row */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex-1 min-w-48">
          <select
            value={zoneName}
            onChange={e => setZoneName(e.target.value)}
            className="w-full theme-input px-3 py-2 rounded-lg text-sm"
          >
            <option value="">Custom name…</option>
            {PRESET_ZONE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {zoneName === '' || !PRESET_ZONE_NAMES.includes(zoneName) ? (
          <input
            value={zoneName}
            onChange={e => setZoneName(e.target.value)}
            placeholder="Zone name (optional)"
            className="flex-1 min-w-36 theme-input px-3 py-2 rounded-lg text-sm"
          />
        ) : null}
        <div className="flex gap-1.5">
          {ZONE_COLORS.map((c, i) => (
            <button
              key={c}
              onClick={() => setColorIdx(i)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${colorIdx === i ? 'border-white scale-125' : 'border-transparent hover:scale-110'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-2xl overflow-hidden border-2 theme-border bg-black"
           style={{ cursor: 'crosshair' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="hidden"
          muted
          loop
          autoPlay
          onCanPlay={() => setVideoReady(true)}
        />
        <canvas
          ref={canvasRef}
          className="w-full block"
          onClick={handleClick}
          onDoubleClick={handleDblClick}
          onMouseMove={(e) => setHoveredPt(getPos(e))}
          onMouseLeave={() => setHoveredPt(null)}
        />

        {/* Instruction overlay */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap text-xs font-medium px-4 py-2"
          style={{
            background: 'rgba(10,10,15,0.9)',
            color: '#FFFFFF',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {instruction}
        </div>

        {/* In-progress controls */}
        {currentPoints.length > 0 && (
          <div className="absolute top-3 right-3 flex gap-2">
            {currentPoints.length >= 3 && (
              <button
                onClick={closePolygon}
                className="bg-cs-green text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-lg hover:bg-green-500 transition-colors"
              >
                ✓ Close Zone
              </button>
            )}
            <button
              onClick={cancelCurrent}
              className="bg-cs-red/80 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-lg hover:bg-cs-red transition-colors"
            >
              ✕ Cancel
            </button>
          </div>
        )}
      </div>

      {/* Zone list */}
      {zones.length > 0 && (
        <div className="theme-surface theme-border border rounded-xl p-4">
          <div className="theme-text-muted text-xs font-mono uppercase tracking-wider mb-3">
            Defined Zones ({zones.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {zones.map(z => (
              <div key={z.id}
                   className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                   style={{ borderColor: z.color + '60', background: z.color + '15' }}>
                <div className="w-3 h-3 rounded-full" style={{ background: z.color }}/>
                <span className="theme-text-primary text-sm font-medium">{z.label}</span>
                <button
                  onClick={() => removeZone(z.id)}
                  className="text-xs opacity-50 hover:opacity-100 ml-1"
                  style={{ color: z.color }}
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={zones.length === 0}
          className="flex-1 btn-primary py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span>🎯</span>
          <span>{zones.length === 0 ? 'Draw at least one zone' : `Save ${zones.length} Zone${zones.length > 1 ? 's' : ''} & Go to Dashboard`}</span>
        </button>
        <button
          onClick={() => onSave([])}
          className="px-6 py-3 rounded-xl theme-border border theme-text-muted hover:theme-text-primary text-sm transition-colors"
        >
          Skip Zones
        </button>
      </div>
    </div>
  );
}

// ─── Main Upload Footage Page ─────────────────────────────────────────────────

export default function UploadFootage() {
  const [step, setStep] = useState(1); // 1 = upload, 2 = polygon editor
  const [uploadData, setUploadData] = useState(null);
  const { uploadFootage, updateZones } = useFootage();
  const navigate = useNavigate();

  const handleNext = (data) => {
    setUploadData(data);
    setStep(2);
  };

  const handleSave = async (normalizedZones) => {
    if (uploadData) {
      await uploadFootage(uploadData.file, uploadData.name, uploadData.venue, uploadData.city);
      await updateZones(normalizedZones);
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen theme-bg">
      {/* Page header */}
      <div className="theme-surface theme-border border-b px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => step === 2 ? setStep(1) : navigate('/dashboard')}
          className="theme-text-muted hover:theme-text-primary transition-colors text-sm flex items-center gap-1"
        >
          ← Back
        </button>
        <div>
          <h1 className="theme-text-primary font-bold text-lg">Upload Footage</h1>
          <p className="theme-text-muted text-xs">
            Step {step} of 2 — {step === 1 ? 'Upload & Name' : 'Mark Zones'}
          </p>
        </div>

        {/* Step indicators */}
        <div className="ml-auto flex items-center gap-2">
          {[1, 2].map(s => (
            <div key={s} className={`flex items-center gap-2`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${step >= s ? 'bg-cs-amber text-cs-bg' : 'theme-surface theme-border border theme-text-muted'}`}>
                {s}
              </div>
              {s < 2 && <div className={`w-8 h-0.5 ${step > s ? 'bg-cs-amber' : 'bg-gray-700'}`}/>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 md:p-10">
        {step === 1 && <UploadStep onNext={handleNext} />}
        {step === 2 && uploadData && (
          <PolygonEditor videoUrl={uploadData.previewUrl} onSave={handleSave} />
        )}
      </div>
    </div>
  );
}
