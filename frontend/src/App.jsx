import React from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Attendee from './pages/Attendee.jsx';
import Analytics from './pages/Analytics.jsx';

function NavBar() {
  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded text-sm font-semibold transition-all ${
      isActive
        ? 'bg-cs-amber text-cs-bg'
        : 'text-gray-400 hover:text-white hover:bg-white/5'
    }`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center gap-1 px-4 py-2 bg-cs-bg/95 backdrop-blur border-b border-cs-border">
      <div className="flex items-center gap-2 mr-6">
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="10" r="4" fill="#EF9F27"/>
          <circle cx="8"  cy="24" r="3" fill="#1D9E75"/>
          <circle cx="24" cy="24" r="3" fill="#1D9E75"/>
          <circle cx="16" cy="24" r="3" fill="#E24B4A"/>
          <line x1="16" y1="14" x2="8"  y2="21" stroke="#EF9F27" strokeWidth="1.5"/>
          <line x1="16" y1="14" x2="24" y2="21" stroke="#EF9F27" strokeWidth="1.5"/>
          <line x1="16" y1="14" x2="16" y2="21" stroke="#EF9F27" strokeWidth="1.5"/>
        </svg>
        <span className="font-bold text-white text-sm tracking-wider">INTELLICROWD</span>
      </div>
      <NavLink to="/dashboard" className={linkClass}>Operator Dashboard</NavLink>
      <NavLink to="/attendee"  className={linkClass}>Attendee View</NavLink>
      <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-cs-bg">
      <NavBar />
      <div className="pt-12">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/attendee"  element={<Attendee />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </div>
    </div>
  );
}
