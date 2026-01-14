'use client';

import { CSSProperties, useState, useEffect, useRef, useCallback } from 'react';
import { discoverOpenIDConfig, getDefaultScopes, type OpenIDConfiguration } from '../lib/openid-discovery';

// Auth type union
export type AuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';

// OAuth2 configuration interface
export interface OAuth2Config {
  enabled: boolean;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string;
  useDcr: boolean;
  clientId: string;
  clientSecret: string;
  registrationEndpoint: string;
}

// OAuth token response
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export const defaultOAuth2Config: OAuth2Config = {
  enabled: false,
  authorizationEndpoint: '',
  tokenEndpoint: '',
  scopes: '',
  useDcr: false,
  clientId: '',
  clientSecret: '',
  registrationEndpoint: '',
};

export interface AuthenticationCardProps {
  // API Key
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  showApiKey: boolean;
  onShowApiKeyToggle: () => void;
  userApiKey: string | null;
  onUseMyApiKey?: () => void;

  // Bearer Token
  bearerToken: string;
  onBearerTokenChange: (value: string) => void;
  showBearerToken: boolean;
  onShowBearerTokenToggle: () => void;

  // Basic Auth
  basicCredentials: string;
  onBasicCredentialsChange: (value: string) => void;
  showBasicCredentials: boolean;
  onShowBasicCredentialsToggle: () => void;

  // Auth type (for highlighting active type)
  authType: AuthType;
  onAuthTypeChange: (type: AuthType) => void;

  // OAuth2 (optional - for backwards compatibility)
  oauth2Config?: OAuth2Config;
  onOAuth2ConfigChange?: (config: OAuth2Config) => void;
  showClientSecret?: boolean;
  onShowClientSecretToggle?: () => void;

  // OpenID Discovery (optional)
  // When provided, attempts to discover OpenID configuration from this URL
  domainForCheck?: string;

  // OAuth popup callback (optional)
  // Called when OAuth authentication completes successfully
  onOAuthToken?: (token: OAuthTokenResponse, clientId?: string) => void;

  // Server info for storing OAuth tokens (optional)
  // When provided, tokens are stored in the database for later use
  serverType?: 'rest_api' | 'graphql' | 'mcp' | 'a2a' | 'rag';
  serverId?: string;

  // Customization
  description?: string;
  inputStyle: CSSProperties;
}

export function AuthenticationCard({
  apiKey,
  onApiKeyChange,
  showApiKey,
  onShowApiKeyToggle,
  userApiKey,
  onUseMyApiKey,
  bearerToken,
  onBearerTokenChange,
  showBearerToken,
  onShowBearerTokenToggle,
  basicCredentials,
  onBasicCredentialsChange,
  showBasicCredentials,
  onShowBasicCredentialsToggle,
  authType,
  onAuthTypeChange,
  oauth2Config,
  onOAuth2ConfigChange,
  showClientSecret = false,
  onShowClientSecretToggle,
  domainForCheck,
  onOAuthToken,
  serverType,
  serverId,
  description = 'If your endpoint requires authentication, provide credentials below.',
  inputStyle,
}: AuthenticationCardProps) {

  const isOAuth2Enabled = oauth2Config?.enabled ?? false;

  // OpenID Discovery state
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discoveredConfig, setDiscoveredConfig] = useState<OpenIDConfiguration | null>(null);
  const [discoveryUrl, setDiscoveryUrl] = useState<string>('');
  const lastCheckedDomain = useRef<string>('');
  const discoveryDismissed = useRef<boolean>(false);

  // OAuth popup state
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [receivedToken, setReceivedToken] = useState<OAuthTokenResponse | null>(null);
  const oauthStateRef = useRef<string>('');
  const popupRef = useRef<Window | null>(null);
  // DCR-obtained credentials (stored in ref to persist across renders during OAuth flow)
  const dcrCredentialsRef = useRef<{ clientId: string; clientSecret: string } | null>(null);
  // Guard to prevent duplicate message processing
  const processingCodeRef = useRef<string | null>(null);

  // OpenID Discovery effect
  useEffect(() => {
    if (!domainForCheck || !onOAuth2ConfigChange) return;
    if (isOAuth2Enabled) return; // Don't check if already using OAuth2
    if (lastCheckedDomain.current === domainForCheck) return; // Already checked this domain
    if (discoveryDismissed.current) return; // User dismissed the modal

    lastCheckedDomain.current = domainForCheck;

    const checkOpenID = async () => {
      const result = await discoverOpenIDConfig(domainForCheck);
      if (result.found && result.config) {
        setDiscoveredConfig(result.config);
        setDiscoveryUrl(result.discoveryUrl || '');
        setShowDiscoveryModal(true);
      }
    };

    checkOpenID();
  }, [domainForCheck, onOAuth2ConfigChange, isOAuth2Enabled]);

  // Check if OAuth2 config is complete for authentication
  const isOAuth2ConfigComplete = useCallback(() => {
    if (!oauth2Config?.enabled) return false;
    if (!oauth2Config.authorizationEndpoint.trim()) return false;
    if (!oauth2Config.tokenEndpoint.trim()) return false;
    if (!oauth2Config.scopes.trim()) return false;

    if (oauth2Config.useDcr) {
      return !!oauth2Config.registrationEndpoint.trim();
    } else {
      return !!oauth2Config.clientId.trim() && !!oauth2Config.clientSecret.trim();
    }
  }, [oauth2Config]);

  // Handle OAuth popup message
  const handleOAuthMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'oauth-callback') return;

    const { code, error, errorDescription, state } = event.data;

    // Verify state matches
    if (state && state !== oauthStateRef.current) {
      console.warn('OAuth state mismatch');
      return;
    }

    if (error) {
      setOauthError(errorDescription || error);
      setIsAuthenticating(false);
      return;
    }

    // Guard against duplicate processing of the same code
    if (code && processingCodeRef.current === code) {
      return;
    }

    if (code && oauth2Config) {
      // Mark this code as being processed
      processingCodeRef.current = code;
      try {
        // Use DCR credentials if available, otherwise use configured credentials
        const clientId = dcrCredentialsRef.current?.clientId || oauth2Config.clientId;
        const clientSecret = dcrCredentialsRef.current?.clientSecret || oauth2Config.clientSecret;

        // Exchange code for token
        const redirectUri = `${window.location.origin}/oauth-callback`;

        // Use external exchange endpoint if serverType/serverId provided (stores token)
        // Otherwise use simple exchange endpoint (just returns token for display)
        const useExternalExchange = serverType && serverId;
        const exchangeEndpoint = useExternalExchange ? '/api/oauth/exchange-external' : '/api/oauth/exchange';

        const requestBody: Record<string, unknown> = {
          code,
          tokenEndpoint: oauth2Config.tokenEndpoint,
          clientId,
          clientSecret,
          redirectUri,
        };

        // Add server info for external exchange (token storage)
        if (useExternalExchange) {
          requestBody.serverType = serverType;
          requestBody.serverId = serverId;
          requestBody.authorizationEndpoint = oauth2Config.authorizationEndpoint;
          requestBody.scopes = oauth2Config.scopes;
        }

        const response = await fetch(exchangeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const tokenData = await response.json();

        if (!response.ok) {
          setOauthError(tokenData.error_description || tokenData.error || 'Token exchange failed');
          setIsAuthenticating(false);
          // Clear refs on failure
          dcrCredentialsRef.current = null;
          processingCodeRef.current = null;
          return;
        }

        // Success! Show token modal
        // For external exchange, tokenData contains success/clientId, not the actual token
        // But we still show a success modal
        if (useExternalExchange) {
          setReceivedToken({
            access_token: '(stored securely)',
            token_type: tokenData.tokenType || 'Bearer',
            expires_in: tokenData.expiresIn,
            scope: tokenData.scope,
          });
        } else {
          setReceivedToken(tokenData);
        }
        setShowTokenModal(true);
        setIsAuthenticating(false);
        setOauthError(null);

        // Call the callback if provided, include the clientId used (for DCR)
        const usedClientId = useExternalExchange ? tokenData.clientId : clientId;
        onOAuthToken?.(useExternalExchange ? { ...tokenData, access_token: '(stored)' } : tokenData, usedClientId);

        // Clear refs after successful use
        dcrCredentialsRef.current = null;
        processingCodeRef.current = null;
      } catch (err) {
        setOauthError(err instanceof Error ? err.message : 'Token exchange failed');
        setIsAuthenticating(false);
        // Clear refs on error
        dcrCredentialsRef.current = null;
        processingCodeRef.current = null;
      }
    }
  }, [oauth2Config, onOAuthToken, serverType, serverId]);

  // Listen for OAuth popup messages
  useEffect(() => {
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [handleOAuthMessage]);

  // Start OAuth authentication flow
  const startOAuthFlow = useCallback(async () => {
    if (!oauth2Config || !isOAuth2ConfigComplete()) return;

    setIsAuthenticating(true);
    setOauthError(null);

    const redirectUri = `${window.location.origin}/oauth-callback`;
    let clientId = oauth2Config.clientId;

    // If using DCR, register a client first
    if (oauth2Config.useDcr && oauth2Config.registrationEndpoint) {
      try {
        const dcrResponse = await fetch(oauth2Config.registrationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_basic',
            client_name: 'OAuth Test Client',
          }),
        });

        if (!dcrResponse.ok) {
          const errorData = await dcrResponse.json().catch(() => ({}));
          setOauthError(errorData.error_description || errorData.error || 'Dynamic client registration failed');
          setIsAuthenticating(false);
          return;
        }

        const dcrData = await dcrResponse.json();
        clientId = dcrData.client_id;
        // Store DCR credentials for token exchange
        dcrCredentialsRef.current = {
          clientId: dcrData.client_id,
          clientSecret: dcrData.client_secret || '',
        };
      } catch (err) {
        setOauthError(err instanceof Error ? err.message : 'Dynamic client registration failed');
        setIsAuthenticating(false);
        return;
      }
    }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    oauthStateRef.current = state;

    // Build authorization URL
    const authUrl = new URL(oauth2Config.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', oauth2Config.scopes);
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

    // Check if popup was blocked
    if (!popupRef.current) {
      setOauthError('Popup was blocked. Please allow popups for this site.');
      setIsAuthenticating(false);
      dcrCredentialsRef.current = null;
      return;
    }

    // Poll to check if popup was closed without completing
    const pollTimer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(pollTimer);
        setIsAuthenticating(false);
      }
    }, 500);
  }, [oauth2Config, isOAuth2ConfigComplete]);

  const handleApproveDiscovery = () => {
    if (!discoveredConfig || !onOAuth2ConfigChange) return;

    const newConfig: OAuth2Config = {
      enabled: true,
      authorizationEndpoint: discoveredConfig.authorization_endpoint || '',
      tokenEndpoint: discoveredConfig.token_endpoint || '',
      scopes: getDefaultScopes(discoveredConfig),
      useDcr: !!discoveredConfig.registration_endpoint,
      clientId: '',
      clientSecret: '',
      registrationEndpoint: discoveredConfig.registration_endpoint || '',
    };

    onOAuth2ConfigChange(newConfig);
    onAuthTypeChange('oauth2');
    onApiKeyChange('');
    onBearerTokenChange('');
    onBasicCredentialsChange('');
    setShowDiscoveryModal(false);
  };

  const handleDismissDiscovery = () => {
    discoveryDismissed.current = true;
    setShowDiscoveryModal(false);
  };

  const handleOAuth2Toggle = () => {
    if (!onOAuth2ConfigChange) return;
    const newEnabled = !isOAuth2Enabled;
    onOAuth2ConfigChange({ ...(oauth2Config || defaultOAuth2Config), enabled: newEnabled });
    if (newEnabled) {
      onAuthTypeChange('oauth2');
      // Clear other auth fields
      onApiKeyChange('');
      onBearerTokenChange('');
      onBasicCredentialsChange('');
    } else {
      onAuthTypeChange('none');
    }
  };

  const updateOAuth2Field = (field: keyof OAuth2Config, value: string | boolean) => {
    if (!onOAuth2ConfigChange || !oauth2Config) return;
    onOAuth2ConfigChange({ ...oauth2Config, [field]: value });
  };

  const handleApiKeyChange = (value: string) => {
    onApiKeyChange(value);
    if (value.trim()) onAuthTypeChange('api_key');
    else if (!bearerToken.trim() && !basicCredentials.trim()) onAuthTypeChange('none');
  };

  const handleBearerTokenChange = (value: string) => {
    onBearerTokenChange(value);
    if (value.trim()) onAuthTypeChange('bearer');
    else if (!apiKey.trim() && !basicCredentials.trim()) onAuthTypeChange('none');
  };

  const handleBasicCredentialsChange = (value: string) => {
    onBasicCredentialsChange(value);
    if (value.trim()) onAuthTypeChange('basic');
    else if (!apiKey.trim() && !bearerToken.trim()) onAuthTypeChange('none');
  };

  const toggleButtonStyle = (isActive: boolean): CSSProperties => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    background: isActive ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  });

  const eyeButtonStyle: CSSProperties = {
    position: 'absolute',
    right: '0.5rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    padding: '0.25rem',
    fontSize: '0.9rem',
  };

  const disabledInputStyle: CSSProperties = {
    ...inputStyle,
    fontSize: '0.9rem',
    paddingRight: '3rem',
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  // Modal styles
  const modalOverlayStyle: CSSProperties = {
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

  return (
    <>
      {/* OpenID Discovery Modal */}
      {showDiscoveryModal && discoveredConfig && (
        <div style={modalOverlayStyle} onClick={handleDismissDiscovery}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔐 OpenID Configuration Detected
            </div>
            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              We detected an OpenID Connect / OAuth 2.0 configuration on your domain.
              Would you like to use it for authentication?
            </p>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Discovery URL</div>
              <div style={{ color: '#fff', wordBreak: 'break-all', marginBottom: '0.75rem' }}>{discoveryUrl}</div>
              {discoveredConfig.authorization_endpoint && (
                <>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Authorization Endpoint</div>
                  <div style={{ color: '#fff', wordBreak: 'break-all', marginBottom: '0.75rem' }}>{discoveredConfig.authorization_endpoint}</div>
                </>
              )}
              {discoveredConfig.token_endpoint && (
                <>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Token Endpoint</div>
                  <div style={{ color: '#fff', wordBreak: 'break-all', marginBottom: '0.75rem' }}>{discoveredConfig.token_endpoint}</div>
                </>
              )}
              {discoveredConfig.registration_endpoint && (
                <>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Registration Endpoint (DCR)</div>
                  <div style={{ color: '#fff', wordBreak: 'break-all' }}>{discoveredConfig.registration_endpoint}</div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
                onClick={handleDismissDiscovery}
              >
                No, thanks
              </button>
              <button
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
                onClick={handleApproveDiscovery}
              >
                Use OAuth 2.0
              </button>
            </div>
          </div>
        </div>
      )}
    <div style={{
      background: 'rgba(251, 191, 36, 0.1)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
    }}>
      <p style={{ color: '#fbbf24', fontSize: '0.85rem', margin: '0 0 0.75rem', fontWeight: 600 }}>
        🔐 Optional Authentication
      </p>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        {description}
      </p>

      {/* OAuth2 Toggle - only show if OAuth2 props are provided */}
      {onOAuth2ConfigChange && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: isOAuth2Enabled ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', border: isOAuth2Enabled ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isOAuth2Enabled}
              onChange={handleOAuth2Toggle}
              style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', cursor: 'pointer' }}
            />
            <span style={{ color: isOAuth2Enabled ? '#a78bfa' : 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>
              🔑 Use OAuth 2.0
            </span>
          </label>

          {/* OAuth2 Configuration Fields */}
          {isOAuth2Enabled && oauth2Config && (
            <div style={{ marginTop: '1rem' }}>
              {/* Authorization Endpoint */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  Authorization Endpoint <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="url"
                  value={oauth2Config.authorizationEndpoint}
                  onChange={(e) => updateOAuth2Field('authorizationEndpoint', e.target.value)}
                  placeholder="https://auth.example.com/authorize"
                  style={{ ...inputStyle, fontSize: '0.85rem' }}
                />
              </div>

              {/* Token Endpoint */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  Token Endpoint <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="url"
                  value={oauth2Config.tokenEndpoint}
                  onChange={(e) => updateOAuth2Field('tokenEndpoint', e.target.value)}
                  placeholder="https://auth.example.com/token"
                  style={{ ...inputStyle, fontSize: '0.85rem' }}
                />
              </div>

              {/* Scopes */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  Scopes <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={oauth2Config.scopes}
                  onChange={(e) => updateOAuth2Field('scopes', e.target.value)}
                  placeholder="openid profile email (space-separated)"
                  style={{ ...inputStyle, fontSize: '0.85rem' }}
                />
              </div>

              {/* DCR Toggle */}
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: oauth2Config.useDcr ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '6px', border: oauth2Config.useDcr ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: oauth2Config.useDcr ? '0.75rem' : 0 }}>
                  <input
                    type="checkbox"
                    checked={oauth2Config.useDcr}
                    onChange={(e) => updateOAuth2Field('useDcr', e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <span style={{ color: oauth2Config.useDcr ? '#10b981' : 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 500 }}>
                    Use Dynamic Client Registration (DCR)
                  </span>
                </label>

                {oauth2Config.useDcr ? (
                  /* DCR Registration Endpoint */
                  <div>
                    <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                      Registration Endpoint <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="url"
                      value={oauth2Config.registrationEndpoint}
                      onChange={(e) => updateOAuth2Field('registrationEndpoint', e.target.value)}
                      placeholder="https://auth.example.com/register"
                      style={{ ...inputStyle, fontSize: '0.85rem' }}
                    />
                  </div>
                ) : (
                  /* Manual Client Credentials - Required when not using DCR */
                  <>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                        Client ID <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={oauth2Config.clientId}
                        onChange={(e) => updateOAuth2Field('clientId', e.target.value)}
                        placeholder="your-client-id (required)"
                        style={{ ...inputStyle, fontSize: '0.85rem' }}
                      />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                        Client Secret <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type={showClientSecret ? 'text' : 'password'}
                        value={oauth2Config.clientSecret}
                        onChange={(e) => updateOAuth2Field('clientSecret', e.target.value)}
                        placeholder="your-client-secret (required)"
                        style={{ ...inputStyle, fontSize: '0.85rem', paddingRight: '3rem' }}
                      />
                      {onShowClientSecretToggle && (
                        <button type="button" onClick={onShowClientSecretToggle} style={eyeButtonStyle}>
                          {showClientSecret ? '🙈' : '👁️'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Authenticate Now Button */}
              <div style={{ marginTop: '1rem' }}>
                {oauthError && (
                  <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.8rem' }}>
                    ⚠️ {oauthError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={startOAuthFlow}
                  disabled={!isOAuth2ConfigComplete() || isAuthenticating}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: isOAuth2ConfigComplete() && !isAuthenticating
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: isOAuth2ConfigComplete() && !isAuthenticating ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    opacity: isOAuth2ConfigComplete() ? 1 : 0.5,
                  }}
                >
                  {isAuthenticating ? (
                    <>
                      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                      {oauth2Config.useDcr ? 'Registering & Authenticating...' : 'Authenticating...'}
                    </>
                  ) : (
                    <>
                      🔓 Authenticate Now {oauth2Config.useDcr && '(via DCR)'}
                    </>
                  )}
                </button>
                {!isOAuth2ConfigComplete() && (
                  <p style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textAlign: 'center' }}>
                    Complete all required fields above to authenticate
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* API Key */}
      <div style={{ marginBottom: '0.75rem', opacity: isOAuth2Enabled ? 0.5 : 1 }}>
        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>
          API Key (x-api-key header) {userApiKey && !isOAuth2Enabled && <span style={{ color: '#10b981', fontSize: '0.7rem' }}>• Your API key available</span>}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Your API key (optional)"
              disabled={isOAuth2Enabled}
              style={isOAuth2Enabled ? disabledInputStyle : { ...inputStyle, fontSize: '0.9rem', paddingRight: '3rem' }}
            />
            <button type="button" onClick={onShowApiKeyToggle} style={eyeButtonStyle} disabled={isOAuth2Enabled}>
              {showApiKey ? '🙈' : '👁️'}
            </button>
          </div>
          {userApiKey && !isOAuth2Enabled && (
            <button
              type="button"
              onClick={() => {
                onApiKeyChange(userApiKey);
                onAuthTypeChange('api_key');
                onUseMyApiKey?.();
              }}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: apiKey === userApiKey ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.2)',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {apiKey === userApiKey ? '✓ Using My Key' : 'Use My API Key'}
            </button>
          )}
        </div>
      </div>

      {/* Bearer Token / Basic Auth */}
      <div style={{ marginBottom: '0.5rem', opacity: isOAuth2Enabled ? 0.5 : 1 }}>
        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>
          Authorization Header
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button type="button" onClick={() => !isOAuth2Enabled && bearerToken.trim() && onAuthTypeChange('bearer')} style={{ ...toggleButtonStyle(authType === 'bearer' && !!bearerToken.trim()), opacity: isOAuth2Enabled ? 0.5 : 1, cursor: isOAuth2Enabled ? 'not-allowed' : 'pointer' }} disabled={isOAuth2Enabled}>
            Bearer Token
          </button>
          <button type="button" onClick={() => !isOAuth2Enabled && basicCredentials.trim() && onAuthTypeChange('basic')} style={{ ...toggleButtonStyle(authType === 'basic' && !!basicCredentials.trim()), opacity: isOAuth2Enabled ? 0.5 : 1, cursor: isOAuth2Enabled ? 'not-allowed' : 'pointer' }} disabled={isOAuth2Enabled}>
            Basic Auth
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <input
            type={showBearerToken ? 'text' : 'password'}
            value={bearerToken}
            onChange={(e) => handleBearerTokenChange(e.target.value)}
            placeholder="Your bearer token (optional)"
            disabled={isOAuth2Enabled}
            style={isOAuth2Enabled ? disabledInputStyle : { ...inputStyle, fontSize: '0.9rem', paddingRight: '3rem' }}
          />
          <button type="button" onClick={onShowBearerTokenToggle} style={eyeButtonStyle} disabled={isOAuth2Enabled}>
            {showBearerToken ? '🙈' : '👁️'}
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showBasicCredentials ? 'text' : 'password'}
            value={basicCredentials}
            onChange={(e) => handleBasicCredentialsChange(e.target.value)}
            placeholder="username:password or base64 encoded (optional)"
            disabled={isOAuth2Enabled}
            style={isOAuth2Enabled ? disabledInputStyle : { ...inputStyle, fontSize: '0.9rem', paddingRight: '3rem' }}
          />
          <button type="button" onClick={onShowBasicCredentialsToggle} style={eyeButtonStyle} disabled={isOAuth2Enabled}>
            {showBasicCredentials ? '🙈' : '👁️'}
          </button>
        </div>
      </div>
    </div>

    {/* Token Result Modal (for testing) */}
    {showTokenModal && receivedToken && (
      <div style={modalOverlayStyle} onClick={() => setShowTokenModal(false)}>
        <div style={{ ...modalStyle, maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ✅ OAuth Token Received
          </div>
          <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
            Authentication successful! Here is your access token:
          </p>
          <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', fontSize: '0.8rem', maxHeight: '300px', overflow: 'auto' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Access Token</div>
              <div style={{ color: '#10b981', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem' }}>{receivedToken.access_token}</div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Token Type</div>
              <div style={{ color: '#fff' }}>{receivedToken.token_type}</div>
            </div>
            {receivedToken.expires_in && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Expires In</div>
                <div style={{ color: '#fff' }}>{receivedToken.expires_in} seconds</div>
              </div>
            )}
            {receivedToken.refresh_token && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Refresh Token</div>
                <div style={{ color: '#f59e0b', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem' }}>{receivedToken.refresh_token}</div>
              </div>
            )}
            {receivedToken.scope && (
              <div>
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Scope</div>
                <div style={{ color: '#fff' }}>{receivedToken.scope}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
              onClick={() => {
                navigator.clipboard.writeText(receivedToken.access_token);
              }}
            >
              📋 Copy Token
            </button>
            <button
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
              onClick={() => setShowTokenModal(false)}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/**
 * Validates OAuth2 configuration before submission
 * Returns an error message if validation fails, null if valid
 */
export function validateOAuth2Config(oauth2Config: OAuth2Config | undefined): string | null {
  if (!oauth2Config?.enabled) return null;

  if (!oauth2Config.authorizationEndpoint.trim()) {
    return 'Authorization Endpoint is required for OAuth 2.0';
  }
  if (!oauth2Config.tokenEndpoint.trim()) {
    return 'Token Endpoint is required for OAuth 2.0';
  }
  if (!oauth2Config.scopes.trim()) {
    return 'Scopes are required for OAuth 2.0';
  }

  if (oauth2Config.useDcr) {
    if (!oauth2Config.registrationEndpoint.trim()) {
      return 'Registration Endpoint is required when using DCR';
    }
  } else {
    if (!oauth2Config.clientId.trim() || !oauth2Config.clientSecret.trim()) {
      return 'Client ID and Client Secret are required when not using DCR';
    }
  }

  return null;
}

