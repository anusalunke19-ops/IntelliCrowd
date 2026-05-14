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

  const uploadFootage = (file, name, venue, city) => {
    if (footage?.objectUrl) URL.revokeObjectURL(footage.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    setFootage({ file, objectUrl, name, venue, city });
    setUserZones([]);
  };

  const clearFootage = () => {
    if (footage?.objectUrl) URL.revokeObjectURL(footage.objectUrl);
    setFootage(null);
    setUserZones([]);
  };

  const addZone = (zone) => setUserZones(prev => [...prev, zone]);
  const removeZone = (id) => setUserZones(prev => prev.filter(z => z.id !== id));
  const updateZones = (zones) => setUserZones(zones);

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
