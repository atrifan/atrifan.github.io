'use client';

import { SignedIn, SignedOut, UserButton, SignInButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { isBillingEnabled } from '../config/billing.config';
import { AboutModal } from './AboutModal';

// Inline logo SVG for header
const HeaderLogo = () => (
  <svg width="32" height="32" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="headerLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#667eea" />
        <stop offset="50%" stopColor="#764ba2" />
        <stop offset="100%" stopColor="#f472b6" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="112" height="112" rx="20" fill="url(#headerLogoGrad)" />
    <path d="M68 25 L45 58 L58 58 L52 95 L75 55 L62 55 L68 25Z" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
  </svg>
);

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSearchResults(false); // Hide while typing
  };

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', flexShrink: 0 }}>
          <HeaderLogo />
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }} className="logo-text">Tulzo</span>
        </Link>

        {/* Search Bar - Always visible, responsive */}
        <div style={{ flex: 1, maxWidth: '400px', position: 'relative' }} className="header-search">
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search tools..."
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
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
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
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexShrink: 0 }} className="desktop-nav">
          <button
            onClick={() => setAboutOpen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            About
          </button>
          {isBillingEnabled() && (
            <Link href="/pricing" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: 500 }}>
              Pricing
            </Link>
          )}
          <SignedIn>
            <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: 500 }}>
              Dashboard
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
                fontSize: '0.95rem',
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
          gap: '0.75rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <button
            onClick={() => { setAboutOpen(true); setMobileMenuOpen(false); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              textDecoration: 'none',
              padding: '0.75rem 0',
              textAlign: 'left',
              fontSize: '1.1rem',
              cursor: 'pointer',
            }}
          >
            About
          </button>
          {isBillingEnabled() && (
            <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', padding: '0.75rem 0', fontSize: '1.1rem' }}>
              Pricing
            </Link>
          )}
          <SignedIn>
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', padding: '0.75rem 0', fontSize: '1.1rem' }}>
              Dashboard
            </Link>
            <div style={{ padding: '0.75rem 0' }}>
              <UserButton afterSignOutUrl="/" />
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
  );
};

