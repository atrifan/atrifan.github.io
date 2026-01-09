'use client';

import React from 'react';
import Link from 'next/link';

interface LockedSectionProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  features?: string[];
}

/**
 * Locked Section Component
 * Shows a blurred preview with upgrade prompt for Pro features
 */
export const LockedSection: React.FC<LockedSectionProps> = ({
  title,
  description,
  icon,
  features = [],
}) => {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Blurred background content */}
      <div style={{
        filter: 'blur(4px)',
        opacity: 0.3,
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          {icon && <div style={{ opacity: 0.5 }}>{icon}</div>}
          <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>{title}</h3>
        </div>
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

      {/* Lock overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}>
        {/* Lock icon */}
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '0.75rem',
          border: '1px solid rgba(102, 126, 234, 0.3)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h4 style={{
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          margin: '0 0 0.25rem',
          textAlign: 'center',
        }}>
          {title}
        </h4>
        <p style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.8rem',
          margin: '0 0 1rem',
          textAlign: 'center',
          maxWidth: '250px',
        }}>
          Upgrade to Pro to unlock
        </p>

        <Link href="/pricing" style={{ textDecoration: 'none' }}>
          <button style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            ⭐ Upgrade
          </button>
        </Link>
      </div>
    </div>
  );
};

