import React from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Attendee from './pages/Attendee.jsx';
import Analytics from './pages/Analytics.jsx';
import UploadFootage from './pages/UploadFootage.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { FootageProvider } from './context/FootageContext.jsx';

// ─── Theme Toggle Button ─────────────────────────────────────────────────────

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative w-10 h-5 rounded-full transition-all duration-300 flex items-center px-0.5 focus:outline-none focus:ring-2 focus:ring-cs-amber/50"
      style={{
        background: dark ? '#2A2A3A' : '#E5E7EB',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] transition-all duration-300 shadow-md"
        style={{
          transform: dark ? 'translateX(0)' : 'translateX(20px)',
          background: dark ? '#EF9F27' : '#FFFFFF',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      >
        {dark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}

// ─── Upload Footage Button ────────────────────────────────────────────────────

function UploadButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/upload')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-cs-amber text-cs-bg hover:bg-amber-400 transition-all"
      style={{ boxShadow: '0 2px 6px rgba(239,159,39,0.25)' }}
    >
      <span>⬆</span>
      <span>Upload Footage</span>
    </button>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

function NavBar() {
  const { dark } = useTheme();

  const linkClass = ({ isActive }) =>
    `nav-link px-4 py-2 rounded text-sm font-semibold transition-all ${
      isActive
        ? 'nav-link-active bg-cs-amber text-cs-bg'
        : 'nav-link-inactive text-gray-400 hover:text-white hover:bg-white/5'
    }`;

  return (
    <nav
      className="intellicrowd-nav fixed top-0 left-0 right-0 z-50 flex items-center gap-1 px-4 py-2 backdrop-blur border-b"
      style={{
        background: dark ? 'rgba(10,10,15,0.96)' : 'rgba(255,255,255,0.96)',
        borderBottomColor: dark ? '#1E1E2E' : '#E2E5EE',
      }}
    >
      {/* Logo */}
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
        <span
          className="brand-text font-bold text-sm tracking-wider"
          style={{ color: dark ? '#FFFFFF' : '#0F1117' }}
        >
          INTELLICROWD
        </span>
      </div>

      <NavLink to="/dashboard" className={linkClass}>Operator Dashboard</NavLink>
      <NavLink to="/attendee"  className={linkClass}>Attendee View</NavLink>
      <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <UploadButton />
        <ThemeToggle />
      </div>
    </nav>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function AppInner() {
  const { dark } = useTheme();
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <NavBar />
      <div className="pt-12">
        <Routes>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/attendee"  element={<Attendee />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/upload"    element={<UploadFootage />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FootageProvider>
        <AppInner />
      </FootageProvider>
    </ThemeProvider>
  );
}
