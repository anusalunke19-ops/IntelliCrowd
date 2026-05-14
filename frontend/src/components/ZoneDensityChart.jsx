import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function ZoneDensityChart({ zone, compact = false }) {
  if (!zone || !zone.densityHistory || zone.densityHistory.length === 0) {
    return <div className="text-center text-xs text-gray-500 py-4">No data</div>;
  }

  const data = zone.densityHistory.map((d, i) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
    index: i
  }));

  const color = zone.color || '#1D9E75';

  return (
    <div className={`w-full ${compact ? 'h-32' : 'h-64'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${zone.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="time" 
            tick={{ fontSize: 10, fill: '#6B7280' }} 
            tickLine={false} 
            axisLine={false}
            minTickGap={20}
          />
          <YAxis 
            domain={[0, 100]} 
            tick={{ fontSize: 10, fill: '#6B7280' }} 
            tickLine={false} 
            axisLine={false}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1A1A2A', border: '1px solid #2A2A3A', borderRadius: '8px', fontSize: '12px' }}
            itemStyle={{ color: '#fff' }}
          />
          <ReferenceLine y={60} stroke="#EF9F27" strokeDasharray="3 3" opacity={0.5} />
          <ReferenceLine y={85} stroke="#E24B4A" strokeDasharray="3 3" opacity={0.5} />
          <Area 
            type="monotone" 
            dataKey="occupancyPercent" 
            stroke={color} 
            fillOpacity={1} 
            fill={`url(#grad-${zone.id})`} 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
