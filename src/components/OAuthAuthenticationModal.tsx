'use client';

import React, { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { OAuth2AuthConfig, OAuthServerType } from '../types/supabase';

export interface OAuthSuccessData {
  clientId?: string; // The client_id used (important for DCR - may differ from config)
}

export interface OAuthAuthenticationModalProps {
  isOpen: boolean;
  serverName: string;
  serverType: OAuthServerType;
  serverId: string;
  oauthConfig: OAuth2AuthConfig;
  onSuccess: (data?: OAuthSuccessData) => void;
  onCancel: () => void;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

interface DCRCredentials {
  clientId: string;
  clientSecret: string;
}

export const OAuthAuthenticationModal: React.FC<OAuthAuthenticationModalProps> = ({
  isOpen,
  serverName,
  serverType,
  serverId,
  oauthConfig,
  onSuccess,
  onCancel,
}) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isProcessingToken, setIsProcessingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const oauthStateRef = useRef<string>('');
  const popupRef = useRef<Window | null>(null);
  const processingCodeRef = useRef<string | null>(null);
  const dcrCredentialsRef = useRef<DCRCredentials | null>(null);

  // Handle ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isAuthenticating && !isProcessingToken) onCancel();
  }, [onCancel, isAuthenticating, isProcessingToken]);

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

  // Handle OAuth popup message
  const handleOAuthMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'oauth-callback') return;

    const { code, error: oauthError, errorDescription, state } = event.data;

    // Verify state matches
    if (state !== oauthStateRef.current) return;

    // Prevent duplicate processing
    if (processingCodeRef.current === code) return;
    processingCodeRef.current = code;

    if (oauthError) {
      setError(errorDescription || oauthError);
      setIsAuthenticating(false);
      processingCodeRef.current = null;
      return;
    }

    if (code) {
      try {
        setIsProcessingToken(true);
        setStatusMessage('Working on your authentication...');

        // Use DCR credentials if available, otherwise use configured credentials
        const clientId = dcrCredentialsRef.current?.clientId || oauthConfig.client_id;
        const clientSecret = dcrCredentialsRef.current?.clientSecret || oauthConfig.client_secret;

        console.log('[OAuth] Exchanging code for token');
        console.log('[OAuth] Using clientId:', clientId);
        console.log('[OAuth] Has clientSecret:', !!clientSecret);
        console.log('[OAuth] DCR credentials available:', !!dcrCredentialsRef.current);
        console.log('[OAuth] Token endpoint:', oauthConfig.token_endpoint);
        console.log('[OAuth] Server:', serverType, serverId);

        // Exchange code for token via our API
        // Include full OAuth config for token sharing across connectors
        const response = await fetch('/api/oauth/exchange-external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            tokenEndpoint: oauthConfig.token_endpoint,
            clientId,
            clientSecret,
            redirectUri: `${window.location.origin}/oauth-callback`,
            serverType,
            serverId,
            // Additional fields for token sharing
            authorizationEndpoint: oauthConfig.authorization_endpoint,
            scopes: oauthConfig.scopes,
          }),
        });

        console.log('[OAuth] Exchange response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('[OAuth] Exchange failed:', errorData);
          throw new Error(errorData.error || 'Token exchange failed');
        }

        const result = await response.json();
        console.log('[OAuth] Exchange successful:', result);

        // Token stored by API, notify success with clientId (important for DCR)
        setStatusMessage('');
        setIsAuthenticating(false);
        setIsProcessingToken(false);
        dcrCredentialsRef.current = null;
        onSuccess({ clientId: result.clientId });
      } catch (err) {
        console.error('[OAuth] Exchange error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStatusMessage('');
        setIsAuthenticating(false);
        setIsProcessingToken(false);
      } finally {
        processingCodeRef.current = null;
      }
    }
  }, [oauthConfig, serverType, serverId, onSuccess]);

  // Listen for OAuth popup messages
  useEffect(() => {
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [handleOAuthMessage]);

  const handleAuthenticate = useCallback(async () => {
    setError(null);
    setStatusMessage('');
    setIsAuthenticating(true);

    const redirectUri = `${window.location.origin}/oauth-callback`;
    let clientId = oauthConfig.client_id;

    // If using DCR and no client_id, perform Dynamic Client Registration first
    if (oauthConfig.use_dcr && !clientId && oauthConfig.registration_endpoint) {
      try {
        setStatusMessage('Registering client...');
        console.log('[OAuth] Performing DCR at:', oauthConfig.registration_endpoint);

        const dcrResponse = await fetch(oauthConfig.registration_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_basic',
            client_name: `ZipRunPlace - ${serverName}`,
          }),
        });

        if (!dcrResponse.ok) {
          const errorData = await dcrResponse.json().catch(() => ({}));
          console.error('[OAuth] DCR failed:', errorData);
          throw new Error(errorData.error_description || errorData.error || 'Dynamic client registration failed');
        }

        const dcrData = await dcrResponse.json();
        console.log('[OAuth] DCR successful, client_id:', dcrData.client_id);

        clientId = dcrData.client_id;
        // Store DCR credentials for token exchange
        dcrCredentialsRef.current = {
          clientId: dcrData.client_id,
          clientSecret: dcrData.client_secret || '',
        };

        setStatusMessage('Opening authorization...');
      } catch (err) {
        console.error('[OAuth] DCR error:', err);
        setError(err instanceof Error ? err.message : 'Dynamic client registration failed');
        setStatusMessage('');
        setIsAuthenticating(false);
        return;
      }
    }

    if (!clientId) {
      setError('No client ID available. Please configure OAuth settings.');
      setStatusMessage('');
      setIsAuthenticating(false);
      return;
    }

    // Generate state for CSRF protection
    const state = crypto.randomUUID();
    oauthStateRef.current = state;

    // Build authorization URL
    const authUrl = new URL(oauthConfig.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', oauthConfig.scopes || 'openid');
    authUrl.searchParams.set('state', state);

    // Open popup
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    popupRef.current = window.open(
      authUrl.toString(),
      'oauth-popup',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    if (!popupRef.current) {
      setError('Popup was blocked. Please allow popups for this site.');
      setStatusMessage('');
      setIsAuthenticating(false);
      return;
    }

    setStatusMessage('Waiting for authorization...');

    // Poll to check if popup was closed without completing
    // Note: We check processingCodeRef to avoid resetting state if we're already processing the code
    const pollTimer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(pollTimer);
        // Only reset if we haven't started processing a code
        // The message event might arrive slightly after popup closes
        setTimeout(() => {
          if (!processingCodeRef.current) {
            setStatusMessage('');
            setIsAuthenticating(false);
          }
        }, 500); // Give message event time to arrive
      }
    }, 500);
  }, [oauthConfig, serverName]);

  if (!isOpen) return null;

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '1rem',
  };

  const modalStyle: CSSProperties = {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '450px',
    width: '90%',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  };

  const serverTypeLabel = {
    rest_api: 'REST API',
    graphql: 'GraphQL API',
    mcp: 'MCP Server',
    a2a: 'A2A Agent',
    rag: 'Knowledge Base',
  }[serverType] || 'Server';

  const isBusy = isAuthenticating || isProcessingToken;

  const modalContent = (
    <div style={overlayStyle} onClick={isBusy ? undefined : onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>
          {isProcessingToken ? '⏳' : '🔐'}
        </div>
        <h2 style={{
          color: '#fff',
          fontSize: '1.25rem',
          fontWeight: 600,
          textAlign: 'center',
          margin: '0 0 0.5rem',
        }}>
          {isProcessingToken ? 'Processing Authentication' : 'Authentication Required'}
        </h2>
        <p style={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.9rem',
          textAlign: 'center',
          margin: '0 0 1.5rem',
          lineHeight: 1.5,
        }}>
          {isProcessingToken ? (
            <>Working on your authentication for <strong style={{ color: '#fff' }}>{serverName}</strong>...</>
          ) : (
            <><strong style={{ color: '#fff' }}>{serverName}</strong> ({serverTypeLabel}) requires OAuth authentication to continue.</>
          )}
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}>
            {error}
          </div>
        )}

        {statusMessage && !error && (
          <div style={{
            background: isProcessingToken ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)',
            border: isProcessingToken ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            color: isProcessingToken ? '#6ee7b7' : '#c4b5fd',
            fontSize: '0.85rem',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}>
            {isProcessingToken && (
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid rgba(110, 231, 183, 0.3)',
                borderTopColor: '#6ee7b7',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            )}
            {statusMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            disabled={isBusy}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAuthenticate}
            disabled={isBusy}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: isBusy
                ? 'rgba(139, 92, 246, 0.5)'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {isBusy ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                {isProcessingToken ? 'Processing...' : 'Authenticating...'}
              </>
            ) : (
              'Authenticate'
            )}
          </button>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );

  // Use portal to render at document root
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

