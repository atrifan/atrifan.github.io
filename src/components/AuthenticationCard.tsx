'use client';

import { CSSProperties, useState, useEffect, useRef } from 'react';
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

