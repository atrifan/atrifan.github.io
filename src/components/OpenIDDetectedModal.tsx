'use client';

import React, { CSSProperties } from 'react';
import type { OpenIDConfiguration } from '../lib/openid-discovery';

interface OpenIDDetectedModalProps {
  isOpen: boolean;
  config: OpenIDConfiguration;
  discoveryUrl: string;
  onApprove: () => void;
  onDismiss: () => void;
}

export function OpenIDDetectedModal({
  isOpen,
  config,
  discoveryUrl,
  onApprove,
  onDismiss,
}: OpenIDDetectedModalProps) {
  if (!isOpen) return null;

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle: CSSProperties = {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  };

  const titleStyle: CSSProperties = {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const textStyle: CSSProperties = {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    marginBottom: '1rem',
  };

  const detailsStyle: CSSProperties = {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
    fontSize: '0.85rem',
  };

  const labelStyle: CSSProperties = {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '0.25rem',
  };

  const valueStyle: CSSProperties = {
    color: '#fff',
    wordBreak: 'break-all',
    marginBottom: '0.75rem',
  };

  const buttonContainerStyle: CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  };

  const primaryButtonStyle: CSSProperties = {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '0.9rem',
  };

  const secondaryButtonStyle: CSSProperties = {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '0.9rem',
  };

  return (
    <div style={overlayStyle} onClick={onDismiss}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>
          🔐 OpenID Configuration Detected
        </div>
        <p style={textStyle}>
          We detected an OpenID Connect / OAuth 2.0 configuration on your domain. 
          Would you like to use it for authentication?
        </p>
        <div style={detailsStyle}>
          <div style={labelStyle}>Discovery URL</div>
          <div style={valueStyle}>{discoveryUrl}</div>
          {config.authorization_endpoint && (
            <>
              <div style={labelStyle}>Authorization Endpoint</div>
              <div style={valueStyle}>{config.authorization_endpoint}</div>
            </>
          )}
          {config.token_endpoint && (
            <>
              <div style={labelStyle}>Token Endpoint</div>
              <div style={valueStyle}>{config.token_endpoint}</div>
            </>
          )}
          {config.registration_endpoint && (
            <>
              <div style={labelStyle}>Registration Endpoint (DCR)</div>
              <div style={valueStyle}>{config.registration_endpoint}</div>
            </>
          )}
        </div>
        <div style={buttonContainerStyle}>
          <button style={secondaryButtonStyle} onClick={onDismiss}>
            No, thanks
          </button>
          <button style={primaryButtonStyle} onClick={onApprove}>
            Use OAuth 2.0
          </button>
        </div>
      </div>
    </div>
  );
}

