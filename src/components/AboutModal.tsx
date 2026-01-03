'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  // Handle ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '1.25rem',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Content */}
        <div style={{ padding: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 1rem',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}>
              ⚡
            </div>
            <h2 style={{
              color: '#fff',
              fontSize: 'clamp(1.5rem, 4vw, 2rem)',
              fontWeight: 800,
              margin: '0 0 0.5rem',
              background: 'linear-gradient(135deg, #667eea, #764ba2, #f472b6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              About Tulzo
            </h2>
            <p style={{
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '0.95rem',
              margin: 0,
            }}>
              Fast, free tools for everyday tasks
            </p>
          </div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <FeatureItem
              icon="🚀"
              title="Instant & Fast"
              description="All tools load instantly with no delays. Get your results in milliseconds."
            />
            <FeatureItem
              icon="🆓"
              title="Free Web Tools"
              description="All web tools are free to use with no signup. Pro & Plus subscriptions unlock AI-powered MCP integration."
            />
            <FeatureItem
              icon="🔒"
              title="Privacy First"
              description="Your data stays on your device. We don't track, store, or sell your information."
            />
            <FeatureItem
              icon="📱"
              title="Works Everywhere"
              description="Fully responsive design that works perfectly on phones, tablets, and desktops."
            />
            <FeatureItem
              icon="🤖"
              title="AI-Ready"
              description="Connect Tulzo to ChatGPT, Claude, and other AI assistants via our MCP server."
            />
            <FeatureItem
              icon="🎨"
              title="Beautiful Widgets"
              description="Every tool comes with interactive visual widgets for a delightful experience."
            />
          </div>

          {/* Divider */}
          <div style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.1)',
            margin: '2rem 0',
          }} />

          {/* Tools Categories */}
          <div>
            <h3 style={{
              color: '#fff',
              fontSize: '1.1rem',
              fontWeight: 700,
              marginBottom: '1rem',
            }}>
              🛠️ Tool Categories
            </h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}>
              {[
                { icon: '💪', name: 'Health & Fitness' },
                { icon: '🎲', name: 'Random & Fun' },
                { icon: '📅', name: 'Date & Time' },
                { icon: '💰', name: 'Finance' },
                { icon: '🔢', name: 'Math' },
                { icon: '⭐', name: 'Astrology' },
                { icon: '🔧', name: 'Utility' },
              ].map((cat) => (
                <span
                  key={cat.name}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                  }}
                >
                  {cat.icon} {cat.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return null;
};

// Feature Item Component
const FeatureItem: React.FC<{ icon: string; title: string; description: string }> = ({ icon, title, description }) => (
  <div style={{
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      background: 'rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1.25rem',
      flexShrink: 0,
    }}>
      {icon}
    </div>
    <div>
      <h4 style={{
        color: '#fff',
        fontSize: '1rem',
        fontWeight: 600,
        margin: '0 0 0.25rem',
      }}>
        {title}
      </h4>
      <p style={{
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '0.9rem',
        margin: 0,
        lineHeight: 1.5,
      }}>
        {description}
      </p>
    </div>
  </div>
);

