'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { AuthenticationCard } from '../components/AuthenticationCard';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled } from '../config/mcp-composer.config';
import type { MCPServerAuthType } from '../types/supabase';

interface ToolPreview {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  hasWidget: boolean;
  // Custom overrides
  customName?: string;
  customDescription?: string;
  isEnabled: boolean;
}

interface ServerInfo {
  name: string;
  version?: string;
  description?: string;
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
}

interface FetchResult {
  serverInfo: ServerInfo;
  tools: ToolPreview[];
  toolCount: number;
  hasResources: boolean;
  resourceCount: number;
}

type Step = 'server-name' | 'connect' | 'preview-tools' | 'configure' | 'saving';

// Normalize name helper
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

export function MCPServerImportPage() {
  const router = useRouter();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('server-name');
  const [serverName, setServerName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Utilities');
  const [categories, setCategories] = useState<Array<{ name: string; icon: string; isSystem: boolean }>>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📦');

  // URL & Auth state
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<MCPServerAuthType>('none');
  const [apiKey, setApiKey] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [basicCredentials, setBasicCredentials] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);

  // Custom headers state
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [showCustomHeaders, setShowCustomHeaders] = useState(false);

  // Fetch result state
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [tools, setTools] = useState<ToolPreview[]>([]);

  // Environment state
  const [environmentName, setEnvironmentName] = useState('default');

  // UI state
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Viewing tool details
  const [viewingTool, setViewingTool] = useState<ToolPreview | null>(null);

  // Check if feature is enabled
  useEffect(() => {
    if (!isMcpComposerEnabled()) {
      router.push('/dashboard');
    }
  }, [router]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
        setCategories([
          { name: 'Utilities', icon: '🔧', isSystem: true },
          { name: 'Health & Fitness', icon: '💪', isSystem: true },
          { name: 'Finance', icon: '💰', isSystem: true },
          { name: 'Date & Time', icon: '📅', isSystem: true },
          { name: 'Fun & Games', icon: '🎲', isSystem: true },
        ]);
      }
    };
    fetchCategories();
  }, []);

  // Fetch user's API key for pre-filling auth fields
  useEffect(() => {
    const fetchUserApiKey = async () => {
      try {
        const response = await fetch('/api/keys/list');
        if (response.ok) {
          const data = await response.json();
          if (data.hasKey && data.apiKey) {
            setUserApiKey(data.apiKey);
          }
        }
      } catch (err) {
        console.error('Error fetching user API key:', err);
      }
    };
    fetchUserApiKey();
  }, []);

  // Build auth config
  const buildAuthConfig = (): Record<string, unknown> => {
    switch (authType) {
      case 'api_key':
        return { apiKey: apiKey.trim() };
      case 'bearer':
        return { token: bearerToken.trim() };
      case 'basic':
        const creds = basicCredentials.trim();
        if (creds.includes(':')) {
          return { credentials: btoa(creds) };
        }
        return { credentials: creds };
      default:
        return {};
    }
  };

  // Build headers
  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    customHeaders.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headers[h.key.trim()] = h.value.trim();
      }
    });
    return headers;
  };

  // Step 1: Server Name Submit
  const handleServerNameSubmit = () => {
    if (!serverName.trim()) {
      setError('Please enter a server name');
      return;
    }
    if (serverName.trim().length < 2) {
      setError('Server name must be at least 2 characters');
      return;
    }
    setError(null);
    setCurrentStep('connect');
  };

  // Step 2: Connect to MCP Server
  const handleConnect = async () => {
    if (!url.trim()) {
      setError('Please enter the MCP server URL');
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      const response = await fetch('/api/mcp-servers/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          authType,
          authConfig: buildAuthConfig(),
          headers: buildHeaders(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect to MCP server');
      }

      setFetchResult(data);
      // Initialize tools with enabled state
      setTools(data.tools.map((t: ToolPreview) => ({ ...t, isEnabled: true })));
      // Set display name from server info if not already set
      if (!displayName && data.serverInfo?.name) {
        setDisplayName(data.serverInfo.name);
      }
      setCurrentStep('preview-tools');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to MCP server');
    } finally {
      setIsFetching(false);
    }
  };

  // Toggle tool enabled state
  const toggleTool = (index: number) => {
    setTools(prev => prev.map((t, i) =>
      i === index ? { ...t, isEnabled: !t.isEnabled } : t
    ));
  };

  // Update tool custom name/description
  const updateTool = (index: number, field: 'customName' | 'customDescription', value: string) => {
    setTools(prev => prev.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    ));
  };

  // Step 3: Proceed to Configure
  const handleProceedToConfigure = () => {
    const enabledTools = tools.filter(t => t.isEnabled);
    if (enabledTools.length === 0) {
      setError('Please enable at least one tool to import');
      return;
    }
    setError(null);
    setCurrentStep('configure');
  };

  // Step 4: Save/Import
  const handleSave = async () => {
    if (!environmentName.trim()) {
      setError('Please enter an environment name');
      return;
    }

    setError(null);
    setIsSaving(true);
    setCurrentStep('saving');

    try {
      const enabledTools = tools.filter(t => t.isEnabled);

      const response = await fetch('/api/mcp-servers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: normalizeName(serverName.trim()),
          displayName: displayName.trim() || serverName.trim(),
          sourceUrl: url.trim(),
          environmentName: environmentName.trim(),
          authType,
          authConfig: buildAuthConfig(),
          defaultHeaders: buildHeaders(),
          category: selectedCategory,
          serverInfo: fetchResult?.serverInfo,
          tools: enabledTools,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import MCP server');
      }

      setSuccessMessage(`Successfully imported ${data.importedCount} tools!`);

      // Redirect after success
      setTimeout(() => {
        router.push('/dashboard/mcp-composer');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import MCP server');
      setCurrentStep('configure');
    } finally {
      setIsSaving(false);
    }
  };

  // Back handler
  const handleBack = () => {
    setError(null);
    switch (currentStep) {
      case 'connect':
        setCurrentStep('server-name');
        break;
      case 'preview-tools':
        setCurrentStep('connect');
        break;
      case 'configure':
        setCurrentStep('preview-tools');
        break;
    }
  };

  // ============ Styles ============

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    padding: 'clamp(1rem, 3vw, 2rem)',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '16px',
    padding: '1.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    marginBottom: '1rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '1rem',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    color: '#fff',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
  };

  // ============ Step Indicator ============

  const renderStepIndicator = () => {
    const steps = [
      { key: 'server-name', label: '1. Name', fullLabel: '1. Server Name' },
      { key: 'connect', label: '2. Connect', fullLabel: '2. Connect' },
      { key: 'preview-tools', label: '3. Tools', fullLabel: '3. Preview Tools' },
      { key: 'configure', label: '4. Config', fullLabel: '4. Configure' },
    ];

    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div style={{
        display: 'flex',
        gap: 'clamp(0.25rem, 1vw, 0.5rem)',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {steps.map((step, index) => (
          <div
            key={step.key}
            style={{
              padding: 'clamp(0.35rem, 1vw, 0.5rem) clamp(0.5rem, 2vw, 1rem)',
              borderRadius: '20px',
              background: index <= currentIndex ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
              fontWeight: index === currentIndex ? 700 : 400,
              opacity: index <= currentIndex ? 1 : 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            <span className="step-short" style={{ display: 'none' }}>{step.label}</span>
            <span className="step-full">{step.fullLabel}</span>
          </div>
        ))}
        <style>{`
          @media (max-width: 480px) {
            .step-short { display: inline !important; }
            .step-full { display: none !important; }
          }
        `}</style>
      </div>
    );
  };

  const enabledCount = tools.filter(t => t.isEnabled).length;

  return (
    <div style={containerStyle}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1rem' }}>
        {/* Back Link */}
        <Link href="/dashboard/mcp-composer" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: 'clamp(0.85rem, 2vw, 1rem)',
            padding: '0.5rem 1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50px',
            transition: 'all 0.3s ease',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateX(-5px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
          >
            <span style={{ fontSize: '1.2rem' }}>←</span>
            <span>Back to MCP Composer</span>
          </div>
        </Link>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{
            fontSize: 'clamp(1.25rem, 4vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            marginTop: '0.75rem',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            🔌 Import MCP Server
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            marginTop: '0.5rem',
            fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
            lineHeight: 1.5,
          }}>
            Connect to an external MCP server and import its tools. Your AI assistant will proxy requests to the external server.
          </p>
        </div>

        {/* Top Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.mcpImportTop || ADS_CONFIG.slots.mcpComposerTop} style={{ marginBottom: '1.5rem' }} />

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Error Display */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: 'clamp(0.75rem, 2vw, 1rem)',
            marginBottom: '1rem',
            color: '#ef4444',
            fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Step 1: Server Name */}
        {currentStep === 'server-name' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              📝 Enter Server Name
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', lineHeight: 1.5 }}>
              This name will be used to identify the MCP server and will be part of the tool names.
            </p>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="e.g., my-mcp-server, weather-api, data-tools"
              style={{ ...inputStyle, fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}
              onKeyDown={(e) => e.key === 'Enter' && handleServerNameSubmit()}
            />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', marginTop: '0.5rem' }}>
              Normalized: <code style={{ color: '#60a5fa' }}>{normalizeName(serverName) || '...'}</code>
            </p>

            {/* Category Selector */}
            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                Tool Category
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setShowNewCategoryInput(true);
                    } else {
                      setSelectedCategory(e.target.value);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem 2.5rem 0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.3)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    appearance: 'none',
                  }}
                >
                  {categories.map(cat => (
                    <option key={cat.name} value={cat.name}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                  <option value="__new__">➕ Add New Category...</option>
                </select>
                <span style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.75rem',
                }}>
                  ▼
                </span>
              </div>

              {/* New Category Input */}
              {showNewCategoryInput && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newCategoryIcon}
                      onChange={(e) => setNewCategoryIcon(e.target.value)}
                      placeholder="📦"
                      style={{ width: '50px', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '1rem', textAlign: 'center' }}
                    />
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name"
                      style={{ flex: 1, minWidth: '150px', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
                    />
                    <button
                      onClick={async () => {
                        if (!newCategoryName.trim()) return;
                        try {
                          const response = await fetch('/api/categories', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newCategoryName.trim(), icon: newCategoryIcon || '📦' }),
                          });
                          if (response.ok) {
                            const data = await response.json();
                            setCategories(prev => [...prev, data.category]);
                            setSelectedCategory(data.category.name);
                            setShowNewCategoryInput(false);
                            setNewCategoryName('');
                            setNewCategoryIcon('📦');
                          }
                        } catch {
                          setError('Failed to create category');
                        }
                      }}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowNewCategoryInput(false); setNewCategoryName(''); }}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <button
                onClick={handleServerNameSubmit}
                style={{ ...primaryButtonStyle, width: '100%', padding: '0.875rem' }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Connect */}
        {currentStep === 'connect' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              🔗 Connect to MCP Server
            </h2>

            {/* URL Input */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                MCP Server URL (HTTP) *
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-mcp-server.com/mcp"
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Only HTTP transport is supported. The server must accept JSON-RPC requests.
              </p>
            </div>

            {/* Authentication Card */}
            <AuthenticationCard
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              showApiKey={showApiKey}
              onShowApiKeyToggle={() => setShowApiKey(!showApiKey)}
              userApiKey={userApiKey}
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
              description="If your MCP server requires authentication, provide credentials below."
              inputStyle={inputStyle}
            />

            {/* Custom Headers Toggle */}
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => setShowCustomHeaders(!showCustomHeaders)}
                style={{ ...secondaryButtonStyle, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                {showCustomHeaders ? '▼' : '▶'} Custom Headers ({customHeaders.length})
              </button>
            </div>

            {/* Custom Headers */}
            {showCustomHeaders && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                {customHeaders.map((header, index) => (
                  <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => {
                        const newHeaders = [...customHeaders];
                        newHeaders[index].key = e.target.value;
                        setCustomHeaders(newHeaders);
                      }}
                      placeholder="Header name"
                      style={{ ...inputStyle, flex: 1, minWidth: '120px' }}
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => {
                        const newHeaders = [...customHeaders];
                        newHeaders[index].value = e.target.value;
                        setCustomHeaders(newHeaders);
                      }}
                      placeholder="Header value"
                      style={{ ...inputStyle, flex: 2, minWidth: '150px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomHeaders(customHeaders.filter((_, i) => i !== index))}
                      style={{ ...secondaryButtonStyle, padding: '0.5rem 0.75rem', color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomHeaders([...customHeaders, { key: '', value: '' }])}
                  style={{ ...secondaryButtonStyle, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  + Add Header
                </button>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: 1, minWidth: '100px' }}>
                ← Back
              </button>
              <button
                onClick={handleConnect}
                disabled={isFetching || !url.trim()}
                style={{
                  ...primaryButtonStyle,
                  flex: 2,
                  minWidth: '150px',
                  opacity: isFetching || !url.trim() ? 0.6 : 1,
                  cursor: isFetching || !url.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isFetching ? '⏳ Connecting...' : '🔌 Connect & Fetch Tools'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview Tools */}
        {currentStep === 'preview-tools' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '0.5rem' }}>
              🛠️ Preview Tools
            </h2>
            {fetchResult && (
              <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                Server: <strong style={{ color: '#60a5fa' }}>{fetchResult.serverInfo.name}</strong>
                {fetchResult.serverInfo.version && ` v${fetchResult.serverInfo.version}`}
                {' • '}{fetchResult.toolCount} tools found
                {fetchResult.hasResources && ` • ${fetchResult.resourceCount} resources`}
              </p>
            )}

            {/* Select All / Deselect All */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setTools(prev => prev.map(t => ({ ...t, isEnabled: true })))}
                style={{ ...secondaryButtonStyle, padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                ✓ Select All
              </button>
              <button
                onClick={() => setTools(prev => prev.map(t => ({ ...t, isEnabled: false })))}
                style={{ ...secondaryButtonStyle, padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                ✕ Deselect All
              </button>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', alignSelf: 'center', marginLeft: 'auto' }}>
                {enabledCount} of {tools.length} selected
              </span>
            </div>

            {/* Tools List */}
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
              {tools.map((tool, index) => (
                <div
                  key={tool.name}
                  style={{
                    padding: '0.75rem',
                    background: tool.isEnabled ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${tool.isEnabled ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '8px',
                    marginBottom: '0.5rem',
                    opacity: tool.isEnabled ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <input
                      type="checkbox"
                      checked={tool.isEnabled}
                      onChange={() => toggleTool(index)}
                      style={{ marginTop: '0.25rem', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{tool.name}</span>
                        {tool.hasWidget && (
                          <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                            Widget
                          </span>
                        )}
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginTop: '0.25rem', lineHeight: 1.4 }}>
                        {tool.description || 'No description'}
                      </p>
                    </div>
                    <button
                      onClick={() => setViewingTool(tool)}
                      style={{ ...secondaryButtonStyle, padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: 1, minWidth: '100px' }}>
                ← Back
              </button>
              <button
                onClick={handleProceedToConfigure}
                disabled={enabledCount === 0}
                style={{
                  ...primaryButtonStyle,
                  flex: 2,
                  minWidth: '150px',
                  opacity: enabledCount === 0 ? 0.6 : 1,
                  cursor: enabledCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Configure Import ({enabledCount} tools) →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Configure */}
        {currentStep === 'configure' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              ⚙️ Configure Import
            </h2>

            {/* Display Name */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={serverName}
                style={inputStyle}
              />
            </div>

            {/* Environment Name */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                Environment Name *
              </label>
              <input
                type="text"
                value={environmentName}
                onChange={(e) => setEnvironmentName(e.target.value)}
                placeholder="default"
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Tool names will be: <code style={{ color: '#60a5fa' }}>{normalizeName(environmentName)}-{normalizeName(serverName)}-toolname</code>
              </p>
            </div>

            {/* Summary */}
            <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', marginBottom: '1rem' }}>
              <h3 style={{ color: '#60a5fa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>📋 Import Summary</h3>
              <ul style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                <li>Server: <strong>{displayName || serverName}</strong></li>
                <li>URL: <code style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{url}</code></li>
                <li>Category: {selectedCategory}</li>
                <li>Tools to import: <strong>{enabledCount}</strong></li>
                <li>Authentication: {authType === 'none' ? 'None' : authType.replace('_', ' ').toUpperCase()}</li>
              </ul>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: 1, minWidth: '100px' }}>
                ← Back
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  ...primaryButtonStyle,
                  flex: 2,
                  minWidth: '150px',
                  opacity: isSaving ? 0.6 : 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? '⏳ Importing...' : `✓ Import ${enabledCount} Tools`}
              </button>
            </div>
          </div>
        )}

        {/* Saving State */}
        {currentStep === 'saving' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '0.5rem' }}>Importing Tools...</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)' }}>Please wait while we import your MCP server tools.</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(34, 197, 94, 0.95)',
            padding: '2rem',
            borderRadius: '16px',
            textAlign: 'center',
            zIndex: 1000,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '0.5rem' }}>{successMessage}</h2>
            <p style={{ color: 'rgba(255,255,255,0.9)' }}>Redirecting to MCP Composer...</p>
          </div>
        )}

        {/* Tool Detail Modal */}
        {viewingTool && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem',
            }}
            onClick={() => setViewingTool(null)}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
                borderRadius: '16px',
                padding: '1.5rem',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>{viewingTool.name}</h3>
                <button
                  onClick={() => setViewingTool(null)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', lineHeight: 1.5 }}>
                {viewingTool.description || 'No description'}
              </p>
              {viewingTool.hasWidget && (
                <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '6px' }}>
                  <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>✓ This tool supports widgets</span>
                </div>
              )}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Input Schema</h4>
                <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.75rem', color: '#60a5fa' }}>
                  {JSON.stringify(viewingTool.inputSchema, null, 2)}
                </pre>
              </div>
              {viewingTool.outputSchema && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Output Schema</h4>
                  <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.75rem', color: '#60a5fa' }}>
                    {JSON.stringify(viewingTool.outputSchema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.mcpImportBottom || ADS_CONFIG.slots.mcpComposerBottom} style={{ marginTop: '2rem' }} />
      </div>

      <Footer />
    </div>
  );
}

