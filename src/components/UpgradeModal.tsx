'use client';

import React from 'react';
import Link from 'next/link';

interface UpgradeModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  featureName?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
}

/**
 * Upgrade Modal Component
 * Shows when free users try to access Pro features
 */
export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  title = 'Pro Feature',
  message,
  featureName = 'this feature',
  onClose,
  showCloseButton = true,
}) => {
  if (!isOpen) return null;

  const defaultMessage = `${featureName} is available exclusively for Pro and Plus subscribers. Upgrade your plan to unlock this and many other powerful features.`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={showCloseButton ? onClose : undefined}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          borderRadius: '24px',
          padding: 'clamp(1.5rem, 4vw, 2.5rem)',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 80px rgba(102, 126, 234, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lock Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
          border: '2px solid rgba(102, 126, 234, 0.3)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
          fontWeight: 700,
          color: '#fff',
          margin: '0 0 1rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          ⭐ {title}
        </h2>

        {/* Message */}
        <p style={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '1rem',
          lineHeight: 1.6,
          margin: '0 0 2rem',
        }}>
          {message || defaultMessage}
        </p>

        {/* Features List */}
        <div style={{
          background: 'rgba(102, 126, 234, 0.1)',
          border: '1px solid rgba(102, 126, 234, 0.2)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'left',
        }}>
          <p style={{ color: '#667eea', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Pro includes:
          </p>
          <ul style={{ margin: 0, padding: '0 0 0 1.25rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
            <li style={{ marginBottom: '0.35rem' }}>AI Chat with multiple models</li>
            <li style={{ marginBottom: '0.35rem' }}>Workflow Automation</li>
            <li style={{ marginBottom: '0.35rem' }}>MCP Server & API Access</li>
            <li style={{ marginBottom: '0.35rem' }}>Custom tool imports (Swagger, GraphQL, A2A)</li>
            <li>Priority support</li>
          </ul>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          <Link href="/pricing" style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              🚀 Upgrade to Pro
            </button>
          </Link>
          {showCloseButton && onClose ? (
            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Maybe Later
            </button>
          ) : (
            <Link href="/" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                ← Back to Home
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

