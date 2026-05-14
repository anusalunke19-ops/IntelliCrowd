import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Attendee from './pages/Attendee.jsx';
import Analytics from './pages/Analytics.jsx';
import UploadFootage from './pages/UploadFootage.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { FootageProvider } from './context/FootageContext.jsx';

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative w-10 h-5 rounded-full transition-all duration-300 flex items-center px-0.5 focus:outline-none"
      style={{ background: dark ? '#2A2A3A' : '#E5E7EB', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] transition-all duration-300"
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

// ─── Upload Button ────────────────────────────────────────────────────────────

function UploadButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/upload')}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cs-amber text-cs-bg hover:bg-amber-400 transition-all shrink-0"
      style={{ borderRadius: '20px', boxShadow: '0 1px 4px rgba(239,159,39,0.2), inset 0 1px 0 rgba(255,255,255,0.18)' }}
    >
      <span>⬆</span>
      <span className="hidden sm:inline">Upload Footage</span>
    </button>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { to: '/dashboard', label: 'Operator Dashboard' },
  { to: '/attendee',  label: 'Attendee View' },
  { to: '/analytics', label: 'Analytics' },
];

function NavBar() {
  const { dark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const menuRef = useRef(null);
  const linkRefs = useRef([]);
  const location = useLocation();

  // Update sliding indicator position
  useEffect(() => {
    const activeIndex = NAV_LINKS.findIndex(link => location.pathname.startsWith(link.to));
    const activeElement = linkRefs.current[activeIndex];
    
    if (activeElement) {
      setIndicatorStyle({
        left: activeElement.offsetLeft,
        width: activeElement.offsetWidth,
        opacity: 1
      });
    } else {
      setIndicatorStyle(prev => ({ ...prev, opacity: 0 }));
    }
  }, [location.pathname]);

  // close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // close on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <nav
      className="intellicrowd-nav fixed top-3 left-3 right-3 z-50 flex items-center px-4 py-2 backdrop-blur-md border rounded-[24px]"
      style={{
        background: 'rgba(46, 26, 71, 0.9)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {/* Logo — stays left */}
      <div className="flex items-center gap-2 shrink-0">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="10" r="4" fill="#EF9F27"/>
          <circle cx="8"  cy="24" r="3" fill="#1D9E75"/>
          <circle cx="24" cy="24" r="3" fill="#1D9E75"/>
          <circle cx="16" cy="24" r="3" fill="#E24B4A"/>
          <line x1="16" y1="14" x2="8"  y2="21" stroke="#EF9F27" strokeWidth="1.5"/>
          <line x1="16" y1="14" x2="24" y2="21" stroke="#EF9F27" strokeWidth="1.5"/>
          <line x1="16" y1="14" x2="16" y2="21" stroke="#EF9F27" strokeWidth="1.5"/>
        </svg>
        <span className="brand-text font-bold text-sm tracking-wider" style={{ color: '#FFFFFF' }}>
          INTELLICROWD
        </span>
      </div>

      {/* Desktop pill group — absolutely centered with sliding indicator */}
      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center p-[3px] rounded-full border border-white/10"
        style={{ background: 'rgba(255, 255, 255, 0.12)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}
      >
        <div className="relative flex items-center">
          {/* Sliding Indicator */}
          <div 
            className="absolute top-0 bottom-0 rounded-full bg-cs-amber transition-all duration-300"
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              opacity: indicatorStyle.opacity,
              boxShadow: '0 2px 10px rgba(239, 159, 39, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
              transform: 'scale(1.02)' // slight pop
            }}
          />

          {NAV_LINKS.map(({ to, label }, index) => (
            <NavLink
              key={to}
              to={to}
              ref={el => linkRefs.current[index] = el}
              className={({ isActive }) =>
                `relative z-10 px-4 py-1.5 rounded-full text-xs font-bold transition-colors duration-200 whitespace-nowrap ${
                  isActive
                    ? 'text-[#0F1117]'
                    : 'text-white/75 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-2">
        <UploadButton />
        <ThemeToggle />

        {/* Mobile hamburger */}
        <button
          className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-[14px] transition-all"
          style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu"
        >
          <span className={`block w-4 h-0.5 rounded-full transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}
            style={{ background: dark ? '#fff' : '#0F1117' }} />
          <span className={`block w-4 h-0.5 rounded-full transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`}
            style={{ background: dark ? '#fff' : '#0F1117' }} />
          <span className={`block w-4 h-0.5 rounded-full transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}
            style={{ background: dark ? '#fff' : '#0F1117' }} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-full mt-2 left-0 right-0 flex flex-col gap-1 p-2 md:hidden rounded-[20px] border"
          style={{
            background: dark ? 'rgba(19,19,28,0.98)' : 'rgba(255,255,255,0.98)',
            borderColor: dark ? 'rgba(42,42,60,0.9)' : '#E2E5EE',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)',
            animation: 'slideDown 0.18s ease-out',
          }}
        >
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-4 py-2.5 rounded-[14px] text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-cs-amber text-cs-bg'
                    : 'theme-text-muted hover:theme-text-primary'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}

// ─── Animated Page Wrapper ────────────────────────────────────────────────────

function AnimatedPage({ children }) {
  return (
    <div
      style={{
        animation: 'pageFadeSlide 0.3s cubic-bezier(0.4,0,0.2,1) both',
      }}
    >
      {children}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function AppInner() {
  const location = useLocation();
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <NavBar />
      <div className="pt-20 px-3 pb-3">
        <Routes location={location} key={location.pathname}>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<AnimatedPage><Dashboard /></AnimatedPage>} />
          <Route path="/attendee"  element={<AnimatedPage><Attendee /></AnimatedPage>} />
          <Route path="/analytics" element={<AnimatedPage><Analytics /></AnimatedPage>} />
          <Route path="/upload"    element={<AnimatedPage><UploadFootage /></AnimatedPage>} />
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
