/**
 * ForecastSparkline — Recharts sparkline with linear regression forecast.
 * Module A6
 */
import React, { useMemo } from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

/** Simple linear regression over [{t, count}] array */
function linearRegression(pts) {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.count || 0 };
  const sumX = pts.reduce((s, p) => s + p.t, 0);
  const sumY = pts.reduce((s, p) => s + p.count, 0);
  const sumXY = pts.reduce((s, p) => s + p.t * p.count, 0);
  const sumX2 = pts.reduce((s, p) => s + p.t * p.t, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX + 1e-9);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export default function ForecastSparkline({ zone }) {
  const data = useMemo(() => {
    const history = zone.history || [];
    const historical = history.map(h => ({ t: h.t, count: h.count, type: 'actual' }));

    const { slope, intercept } = linearRegression(historical.slice(-10));
    const lastT = historical.length ? historical[historical.length - 1].t : 0;
    const forecast = [];
    const FORECAST_WINDOW = 30 * 60; // 30 min in seconds
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = lastT + (FORECAST_WINDOW / steps) * i;
      const count = Math.max(0, Math.min(zone.capacity, Math.round(slope * t + intercept)));
      forecast.push({ t, count, type: 'forecast' });
    }

    const willHitCritical = forecast.some(f => f.count / zone.capacity >= 0.85);

    return { chartData: [...historical, ...forecast], willHitCritical, forecast };
  }, [zone.history, zone.capacity]);

  const { chartData, willHitCritical } = data;
  const occ = Math.round((zone.currentCount / zone.capacity) * 100);
  const color = occ >= 85 ? '#E24B4A' : occ >= 60 ? '#EF9F27' : '#1D9E75';

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="theme-text-primary text-xs font-semibold">{zone.label}</div>
          <div className="theme-text-muted text-[10px] font-mono">30-min forecast</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color }}>{zone.currentCount}/{zone.capacity}</span>
          {willHitCritical && (
            <span className="chip-p1 animate-pulse text-[10px]">⚠ CRITICAL IN 30m</span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={60}>
        <ComposedChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${zone.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="100%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={[0, zone.capacity]} />
          <Tooltip
            contentStyle={{ background: '#12121A', border: '1px solid #1E1E2E', borderRadius: 6, fontSize: 10 }}
            labelFormatter={() => ''}
            formatter={(v, n) => [v, n === 'count' ? 'count' : '']}
          />
          <ReferenceLine y={zone.capacity * 0.85} stroke="#E24B4A" strokeDasharray="3 3" strokeOpacity={0.5}/>
          <Area
            dataKey="count"
            fill={`url(#grad-${zone.id})`}
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {/* Dashed overlay for forecast segment */}
          <Line
            dataKey={(d) => d.type === 'forecast' ? d.count : undefined}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
