'use client';

import { CSSProperties } from 'react';

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
  authType: 'none' | 'api_key' | 'bearer' | 'basic';
  onAuthTypeChange: (type: 'none' | 'api_key' | 'bearer' | 'basic') => void;
  
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
  description = 'If your endpoint requires authentication, provide credentials below.',
  inputStyle,
}: AuthenticationCardProps) {
  
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

  return (
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

      {/* API Key */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>
          API Key (x-api-key header) {userApiKey && <span style={{ color: '#10b981', fontSize: '0.7rem' }}>• Your API key available</span>}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Your API key (optional)"
              style={{ ...inputStyle, fontSize: '0.9rem', paddingRight: '3rem' }}
            />
            <button type="button" onClick={onShowApiKeyToggle} style={eyeButtonStyle}>
              {showApiKey ? '🙈' : '👁️'}
            </button>
          </div>
          {userApiKey && (
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
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>
          Authorization Header
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button type="button" onClick={() => bearerToken.trim() && onAuthTypeChange('bearer')} style={toggleButtonStyle(authType === 'bearer' && !!bearerToken.trim())}>
            Bearer Token
          </button>
          <button type="button" onClick={() => basicCredentials.trim() && onAuthTypeChange('basic')} style={toggleButtonStyle(authType === 'basic' && !!basicCredentials.trim())}>
            Basic Auth
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <input
            type={showBearerToken ? 'text' : 'password'}
            value={bearerToken}
            onChange={(e) => handleBearerTokenChange(e.target.value)}
            placeholder="Your bearer token (optional)"
            style={{ ...inputStyle, fontSize: '0.9rem', paddingRight: '3rem' }}
          />
          <button type="button" onClick={onShowBearerTokenToggle} style={eyeButtonStyle}>
            {showBearerToken ? '🙈' : '👁️'}
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showBasicCredentials ? 'text' : 'password'}
            value={basicCredentials}
            onChange={(e) => handleBasicCredentialsChange(e.target.value)}
            placeholder="username:password or base64 encoded (optional)"
            style={{ ...inputStyle, fontSize: '0.9rem', paddingRight: '3rem' }}
          />
          <button type="button" onClick={onShowBasicCredentialsToggle} style={eyeButtonStyle}>
            {showBasicCredentials ? '🙈' : '👁️'}
          </button>
        </div>
      </div>
    </div>
  );
}

