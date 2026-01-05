'use client';

import { SignedIn, SignedOut, UserButton, SignInButton, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { isBillingEnabled } from '../config/billing.config';
import { AboutModal } from './AboutModal';
import { PlanetaryNav } from './PlanetaryNav';

// Nav Icons
const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const AboutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const PricingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// Logo image for header
const HeaderLogo = () => (
  <img
    src="/tulzo-logo.png"
    alt="Tulzo"
    width={32}
    height={32}
    style={{ borderRadius: '6px' }}
  />
);

export const Header: React.FC = () => {
  const router = useRouter();
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showPlanetaryNav, setShowPlanetaryNav] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchFocusScrollYRef = useRef<number | null>(null);

  // Handle logo click - toggle planetary nav
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowPlanetaryNav(!showPlanetaryNav);
  };

  // Debounced search - triggers 400ms after user stops typing
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (searchQuery.trim()) {
      debounceTimerRef.current = setTimeout(() => {
        setShowSearchResults(true);
      }, 400);
    } else {
      setShowSearchResults(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  // iOS fix: when search is focused and the user scrolls, blur the input
  // to dismiss the keyboard (so the sticky header can "follow" again).
  // Uses a scroll delta threshold so re-focusing still works normally.
  useEffect(() => {
    const handleScroll = () => {
      const input = searchInputRef.current;
      if (!input) return;
      if (document.activeElement !== input) return;

      const startY = searchFocusScrollYRef.current;
      const currentY = window.scrollY || window.pageYOffset || 0;

      if (startY == null) {
        searchFocusScrollYRef.current = currentY;
        return;
      }

      if (Math.abs(currentY - startY) > 30) {
        input.blur();
        searchFocusScrollYRef.current = null;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSearchResults(false); // Hide while typing
  };

  return (
    <>
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    }}>
      <div style={{
        maxWidth: '56rem',
        margin: '0 auto',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
      }}>
        {/* Logo - Click to toggle PlanetaryNav */}
        <button
          onClick={handleLogoClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
          }}
          title={showPlanetaryNav ? 'Close tools menu' : 'Open tools menu'}
          aria-label={showPlanetaryNav ? 'Close tools menu' : 'Open tools menu'}
        >
          <HeaderLogo />
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }} className="logo-text">Tulzo</span>
        </button>

        {/* Search Bar - Always visible, responsive */}
        <div style={{ flex: 1, maxWidth: '25rem', position: 'relative' }} className="header-search">
          <div style={{ position: 'relative' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search throughout the app..."
              style={{
                width: '100%',
                padding: searchQuery ? '0.5rem 2.25rem 0.5rem 2.25rem' : '0.5rem 0.75rem 0.5rem 2.25rem',
                borderRadius: '50px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                outline: 'none',
                transition: 'border-color 0.2s, background 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                if (typeof window !== 'undefined') {
                  const currentY = window.scrollY || window.pageYOffset || 0;
                  searchFocusScrollYRef.current = currentY;
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                searchFocusScrollYRef.current = null;
                setTimeout(() => setShowSearchResults(false), 300);
              }}
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setShowSearchResults(false); }}
                style={{
                  position: 'absolute',
                  right: '0.4rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.25)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                aria-label="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {showSearchResults && searchQuery.trim() && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.5rem',
              background: 'rgba(15, 23, 42, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '1rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
              zIndex: 100,
            }}>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', margin: 0, textAlign: 'center' }}>
                🔍 Search not implemented yet
              </p>
            </div>
          )}
        </div>

        {/* Desktop Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }} className="desktop-nav">
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'rgba(255,255,255,0.8)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            <HomeIcon />
            <span>Home</span>
          </Link>
          <button
            onClick={() => setAboutOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <AboutIcon />
            <span>About</span>
          </button>
          {isBillingEnabled() && (
            <Link
              href="/pricing"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: 'rgba(255,255,255,0.8)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              <PricingIcon />
              <span>Pricing</span>
            </Link>
          )}
          <SignedIn>
            <Link
              href="/dashboard"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: 'rgba(255,255,255,0.8)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              <DashboardIcon />
              <span>Dashboard</span>
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/">
              <button style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1.25rem',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}>
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="mobile-menu-btn"
          style={{
            display: 'none',
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.25rem',
          }}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu" style={{
          background: 'rgba(15, 23, 42, 0.98)',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#fff',
              textDecoration: 'none',
              padding: '0.75rem 0',
              fontSize: '1.1rem',
            }}
          >
            <HomeIcon />
            <span>Home</span>
          </Link>
          <button
            onClick={() => { setAboutOpen(true); setMobileMenuOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              padding: '0.75rem 0',
              fontSize: '1.1rem',
              cursor: 'pointer',
            }}
          >
            <AboutIcon />
            <span>About</span>
          </button>
          {isBillingEnabled() && (
            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: '#fff',
                textDecoration: 'none',
                padding: '0.75rem 0',
                fontSize: '1.1rem',
              }}
            >
              <PricingIcon />
              <span>Pricing</span>
            </Link>
          )}
          <SignedIn>
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: '#fff',
                textDecoration: 'none',
                padding: '0.75rem 0',
                fontSize: '1.1rem',
              }}
            >
              <DashboardIcon />
              <span>Dashboard</span>
            </Link>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 0',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              marginTop: '0.25rem',
            }}>
              <UserButton afterSignOutUrl="/" />
              {user?.firstName && (
                <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 500 }}>
                  {user.firstName}{user.lastName ? ` ${user.lastName}` : ''}
                </span>
              )}
            </div>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/">
              <button style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.85rem 1.5rem',
                color: '#fff',
                fontWeight: 600,
                fontSize: '1.1rem',
                cursor: 'pointer',
                width: '100%',
                marginTop: '0.5rem',
              }}>
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      )}

      {/* About Modal */}
      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />

      <style jsx global>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
          .logo-text { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu { display: none !important; }
        }
      `}</style>
    </header>

    {/* Planetary Navigation - Outside header to avoid stacking context issues */}
    <PlanetaryNav
      isOpen={showPlanetaryNav}
      onClose={() => setShowPlanetaryNav(false)}
    />
  </>
  );
};

