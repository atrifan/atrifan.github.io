'use client';

import { SignedIn, SignedOut, UserButton, SignInButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useState } from 'react';
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
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <HeaderLogo />
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Tulzo</span>
        </Link>

        {/* Desktop Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }} className="desktop-nav">
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
          gap: '1rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <button
            onClick={() => { setAboutOpen(true); setMobileMenuOpen(false); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              textDecoration: 'none',
              padding: '0.5rem 0',
              textAlign: 'left',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            About
          </button>
          {isBillingEnabled() && (
            <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', padding: '0.5rem 0' }}>
              Pricing
            </Link>
          )}
          <SignedIn>
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', padding: '0.5rem 0' }}>
              Dashboard
            </Link>
            <div style={{ padding: '0.5rem 0' }}>
              <UserButton afterSignOutUrl="/" />
            </div>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/">
              <button style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                color: '#fff',
                fontWeight: 600,
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
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
        @media (min-width: 641px) {
          .mobile-menu { display: none !important; }
        }
      `}</style>
    </header>
  );
};

