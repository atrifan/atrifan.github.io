'use client';

import React from 'react';
import Link from 'next/link';

interface LockedSectionProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  emoji?: string;
  features?: string[];
}

/**
 * Locked Section Component
 * Shows a blurred preview with upgrade prompt for Pro features
 * Uses the same overlay style as the AI Budget card
 */
export const LockedSection: React.FC<LockedSectionProps> = ({
  title,
  description,
  icon,
  emoji = '🔒',
}) => {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '20px',
      padding: 'clamp(1.25rem, 4vw, 2rem)',
      marginBottom: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {icon}
        <h2 style={{ color: '#fff', fontSize: 'clamp(1.1rem, 3vw, 1.35rem)', fontWeight: 700, margin: 0 }}>{title}</h2>
      </div>

      {/* Pro-only overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        padding: '1rem'
      }}>
        <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{emoji}</span>
        <span style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>Pro Feature</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '0.75rem', maxWidth: '280px' }}>
          {description}
        </span>
        <Link href="/pricing" style={{ textDecoration: 'none' }}>
          <button style={{
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500
          }}>
            Upgrade to Pro
          </button>
        </Link>
      </div>

      {/* Blurred background content */}
      <div style={{ filter: 'blur(4px)', opacity: 0.3, pointerEvents: 'none' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          {description}
        </p>
        {/* Fake content blocks */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '40px', width: '120px' }} />
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '40px', width: '100px' }} />
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '40px', width: '140px' }} />
        </div>
      </div>
    </div>
  );
};

