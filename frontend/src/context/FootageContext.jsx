/**
 * FootageContext — Stores uploaded video and user-drawn zone polygons.
 */
import React, { createContext, useContext, useState } from 'react';

const FootageContext = createContext(null);

export function FootageProvider({ children }) {
  const [footage, setFootage] = useState(null);
  // footage = { file, objectUrl, name, venue, city }

  const [userZones, setUserZones] = useState([]);
  // userZones = [{ id, label, points: [{x,y}], color }]

  const uploadFootage = async (file, name, venue, city) => {
    if (footage?.objectUrl) URL.revokeObjectURL(footage.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    setFootage({ file, objectUrl, name, venue, city });
    setUserZones([]);

    // Send to backend
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetch('http://localhost:8000/api/video/upload', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error("Failed to upload video to backend:", err);
    }
  };

  const clearFootage = () => {
    if (footage?.objectUrl) URL.revokeObjectURL(footage.objectUrl);
    setFootage(null);
    setUserZones([]);
  };

  const addZone = (zone) => setUserZones(prev => [...prev, zone]);
  const removeZone = (id) => setUserZones(prev => prev.filter(z => z.id !== id));
  
  const updateZones = async (zones) => {
    setUserZones(zones);
    // Send to backend
    try {
      const backendZones = zones.map(z => ({
        zone_id: z.id,
        label: z.label,
        polygon: z.points.map(p => [p.x, p.y]), // [[x,y], ...] in 0-1 range
        capacity: 10000,           // sentinel — risk is driven by density, not capacity
        warning_threshold: 0.60,
        critical_threshold: 0.85,
      }));

      await fetch('http://localhost:8000/api/config/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendZones),
      });
    } catch (err) {
      console.error("Failed to update zones on backend:", err);
    }
  };

  return (
    <FootageContext.Provider value={{ footage, userZones, uploadFootage, clearFootage, addZone, removeZone, updateZones }}>
      {children}
    </FootageContext.Provider>
  );
}

export function useFootage() {
  const ctx = useContext(FootageContext);
  if (!ctx) throw new Error('useFootage must be used within FootageProvider');
  return ctx;
}
