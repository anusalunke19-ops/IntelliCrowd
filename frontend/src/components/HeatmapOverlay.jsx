import React, { useEffect, useState, useRef } from 'react';

const API_BASE_URL = 'http://localhost:8000';

export default function HeatmapOverlay({ visible, isSimulated = false }) {
  const [heatmapUrl, setHeatmapUrl] = useState(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!visible) return;

    const fetchHeatmap = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/heatmap/latest`);
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setHeatmapUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setError(false);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Failed to fetch heatmap:", err);
        setError(true);
      }
    };

    fetchHeatmap();
    intervalRef.current = setInterval(fetchHeatmap, 2000);

    return () => {
      clearInterval(intervalRef.current);
      if (heatmapUrl) URL.revokeObjectURL(heatmapUrl);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none mix-blend-screen transition-opacity duration-500 opacity-80">
      {heatmapUrl && !error ? (
        <img 
          src={heatmapUrl} 
          alt="Density Heatmap" 
          className="w-full h-full object-cover rounded-lg"
        />
      ) : isSimulated ? (
        <div className="w-full h-full flex items-center justify-center">
           {/* Fallback handled in the parent SVG or video canvas mostly, 
               but we can show an overlay message if desired */}
           <span className="text-white bg-black/50 px-2 py-1 rounded text-xs">Simulated Heatmap Mode</span>
        </div>
      ) : null}
    </div>
  );
}
