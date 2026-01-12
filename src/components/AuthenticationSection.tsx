'use client';

import { useState, CSSProperties } from 'react';
import { AuthenticationCard, AuthType, OAuth2Config, defaultOAuth2Config } from './AuthenticationCard';

export interface AuthenticationSectionProps {
  // Resource identification
  resourceId: string;
  resourceType: 'agent' | 'mcp-server' | 'graphql' | 'rest-api';
  
  // Current auth state from database
  authType: string;
  authConfig: Record<string, unknown>;
  
  // For OpenID discovery
  sourceUrl?: string;
  
  // Callback after save
  onUpdate: () => void;
  
  // Theme color (for different resource types)
  accentColor?: string;
}

// Helper to parse auth_config into component state
function parseAuthConfig(authType: string, authConfig: Record<string, unknown>) {
  return {
    apiKey: (authConfig.api_key as string) || '',
    bearerToken: (authConfig.bearer_token as string) || '',
    basicCredentials: (authConfig.credentials as string) || '',
    oauth2Config: authType === 'oauth2' ? {
      enabled: true,
      authorizationEndpoint: (authConfig.authorization_endpoint as string) || '',
      tokenEndpoint: (authConfig.token_endpoint as string) || '',
      scopes: (authConfig.scopes as string) || '',
      useDcr: (authConfig.use_dcr as boolean) || false,
      clientId: (authConfig.client_id as string) || '',
      clientSecret: (authConfig.client_secret as string) || '',
      registrationEndpoint: (authConfig.registration_endpoint as string) || '',
    } : { ...defaultOAuth2Config },
  };
}

// Helper to build auth_config for API
function buildAuthConfig(authType: AuthType, state: ReturnType<typeof parseAuthConfig>): Record<string, unknown> {
  if (authType === 'api_key') return { api_key: state.apiKey };
  if (authType === 'bearer') return { bearer_token: state.bearerToken };
  if (authType === 'basic') return { credentials: state.basicCredentials };
  if (authType === 'oauth2') return {
    authorization_endpoint: state.oauth2Config.authorizationEndpoint,
    token_endpoint: state.oauth2Config.tokenEndpoint,
    scopes: state.oauth2Config.scopes,
    use_dcr: state.oauth2Config.useDcr,
    client_id: state.oauth2Config.clientId,
    client_secret: state.oauth2Config.clientSecret,
    registration_endpoint: state.oauth2Config.registrationEndpoint,
  };
  return {};
}

// Get API endpoint for resource type
function getApiEndpoint(resourceType: string, resourceId: string): { url: string; method: string } {
  switch (resourceType) {
    case 'agent': return { url: `/api/agents/${resourceId}`, method: 'PATCH' };
    case 'mcp-server': return { url: `/api/mcp-servers/${resourceId}`, method: 'PUT' };
    case 'graphql': return { url: `/api/graphql/${resourceId}`, method: 'PATCH' };
    case 'rest-api': return { url: `/api/swagger/${resourceId}`, method: 'PATCH' };
    default: return { url: '', method: 'PATCH' };
  }
}

const authTypeLabels: Record<string, string> = {
  none: 'None',
  api_key: 'API Key',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  oauth2: 'OAuth 2.0',
};

export function AuthenticationSection({
  resourceId,
  resourceType,
  authType: initialAuthType,
  authConfig: initialAuthConfig,
  sourceUrl,
  onUpdate,
  accentColor = '#f59e0b',
}: AuthenticationSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Auth state
  const [authType, setAuthType] = useState<AuthType>((initialAuthType as AuthType) || 'none');
  const initialState = parseAuthConfig(initialAuthType, initialAuthConfig);
  const [apiKey, setApiKey] = useState(initialState.apiKey);
  const [bearerToken, setBearerToken] = useState(initialState.bearerToken);
  const [basicCredentials, setBasicCredentials] = useState(initialState.basicCredentials);
  const [oauth2Config, setOAuth2Config] = useState<OAuth2Config>(initialState.oauth2Config);
  
  // Visibility toggles
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);

  const maskValue = (value: string): string => {
    if (!value) return '—';
    if (value.length <= 4) return '••••••••';
    return '••••••••' + value.slice(-4);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { url, method } = getApiEndpoint(resourceType, resourceId);
      const newAuthConfig = buildAuthConfig(authType, { apiKey, bearerToken, basicCredentials, oauth2Config });
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authType, authConfig: newAuthConfig }),
      });

      if (response.ok) {
        setEditing(false);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    // Reset to initial values
    setAuthType((initialAuthType as AuthType) || 'none');
    const state = parseAuthConfig(initialAuthType, initialAuthConfig);
    setApiKey(state.apiKey);
    setBearerToken(state.bearerToken);
    setBasicCredentials(state.basicCredentials);
    setOAuth2Config(state.oauth2Config);
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '0.85rem',
  };

  // View mode - show current auth summary
  if (!editing) {
    return (
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>🔐 Authentication</h3>
          <button onClick={() => setEditing(true)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: `${accentColor}33`, color: accentColor, fontSize: '0.8rem', cursor: 'pointer' }}>
            ✏️ Edit Auth
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Type:</span>
          <span style={{ background: initialAuthType === 'none' ? 'rgba(255,255,255,0.1)' : `${accentColor}33`, color: initialAuthType === 'none' ? 'rgba(255,255,255,0.5)' : accentColor, padding: '0.25rem 0.75rem', borderRadius: '50px', fontSize: '0.8rem', fontWeight: 600 }}>
            {authTypeLabels[initialAuthType] || initialAuthType || 'None'}
          </span>
        </div>

        {initialAuthType === 'api_key' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>API Key:</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{showApiKey ? String(initialAuthConfig.api_key || '') : maskValue(String(initialAuthConfig.api_key || ''))}</span>
            {Boolean(initialAuthConfig.api_key) && (
              <button onClick={() => setShowApiKey(!showApiKey)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>{showApiKey ? '👁️' : '👁️‍🗨️'}</button>
            )}
          </div>
        )}

        {initialAuthType === 'bearer' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Token:</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{showBearerToken ? String(initialAuthConfig.bearer_token || '') : maskValue(String(initialAuthConfig.bearer_token || ''))}</span>
            {Boolean(initialAuthConfig.bearer_token) && (
              <button onClick={() => setShowBearerToken(!showBearerToken)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>{showBearerToken ? '👁️' : '👁️‍🗨️'}</button>
            )}
          </div>
        )}

        {initialAuthType === 'basic' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Credentials:</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{showBasicCredentials ? String(initialAuthConfig.credentials || '') : maskValue(String(initialAuthConfig.credentials || ''))}</span>
            {Boolean(initialAuthConfig.credentials) && (
              <button onClick={() => setShowBasicCredentials(!showBasicCredentials)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>{showBasicCredentials ? '👁️' : '👁️‍🗨️'}</button>
            )}
          </div>
        )}

        {initialAuthType === 'oauth2' && (
          <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
            <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>Auth Endpoint:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(initialAuthConfig.authorization_endpoint || '') || '—'}</span></div>
            <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>Token Endpoint:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(initialAuthConfig.token_endpoint || '') || '—'}</span></div>
            <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>Scopes:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(initialAuthConfig.scopes || '') || '—'}</span></div>
            <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>DCR:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{initialAuthConfig.use_dcr ? 'Enabled' : 'Disabled'}</span></div>
          </div>
        )}
      </div>
    );
  }

  // Edit mode - use AuthenticationCard
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: `1px solid ${accentColor}44` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>🔐 Authentication</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: `${accentColor}44`, color: accentColor, fontSize: '0.8rem', cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleCancel} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>

      <AuthenticationCard
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        showApiKey={showApiKey}
        onShowApiKeyToggle={() => setShowApiKey(!showApiKey)}
        userApiKey={null}
        bearerToken={bearerToken}
        onBearerTokenChange={setBearerToken}
        showBearerToken={showBearerToken}
        onShowBearerTokenToggle={() => setShowBearerToken(!showBearerToken)}
        basicCredentials={basicCredentials}
        onBasicCredentialsChange={setBasicCredentials}
        showBasicCredentials={showBasicCredentials}
        onShowBasicCredentialsToggle={() => setShowBasicCredentials(!showBasicCredentials)}
        authType={authType}
        onAuthTypeChange={setAuthType}
        oauth2Config={oauth2Config}
        onOAuth2ConfigChange={setOAuth2Config}
        showClientSecret={showClientSecret}
        onShowClientSecretToggle={() => setShowClientSecret(!showClientSecret)}
        domainForCheck={sourceUrl}
        description="Configure authentication for this resource."
        inputStyle={inputStyle}
      />
    </div>
  );
}

