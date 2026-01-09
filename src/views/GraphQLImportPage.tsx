'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { AuthenticationCard } from '../components/AuthenticationCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled } from '../config/mcp-composer.config';

interface OperationPreview {
  name: string;
  description: string;
  arguments: Array<{ name: string; type: string; required: boolean }>;
  returnType: string;
}

interface FetchResult {
  schema: Record<string, unknown>;
  stats: { queries: number; mutations: number; subscriptions: number; types: number };
  operations: { queries: OperationPreview[]; mutations: OperationPreview[] };
}

interface EnvironmentConfig {
  name: string;
  host: string;
}

type Step = 'server-name' | 'fetch-schema' | 'preview-tools' | 'environments' | 'saving';

interface GraphQLImportPageProps {
  isPro: boolean;
  isPlus: boolean;
}

// Normalize name helper
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

export function GraphQLImportPage({ isPro, isPlus }: GraphQLImportPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('server-name');
  const [serverName, setServerName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Utilities');
  const [categories, setCategories] = useState<Array<{ name: string; icon: string; isSystem: boolean }>>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📦');

  // URL & Auth state
  const [url, setUrl] = useState('');
  const [urlApiKey, setUrlApiKey] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [basicCredentials, setBasicCredentials] = useState('');
  const [authType, setAuthType] = useState<'none' | 'api_key' | 'bearer' | 'basic'>('none');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);

  // Custom headers state
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [showCustomHeaders, setShowCustomHeaders] = useState(false);

  // Schema state
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [apiTitle, setApiTitle] = useState('');
  const [apiDescription, setApiDescription] = useState('');

  // Environments state
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);

  // UI state
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if feature is enabled (only for Pro users)
  useEffect(() => {
    if (canAccessPro && !isMcpComposerEnabled()) {
      router.push('/dashboard');
    }
  }, [router, canAccessPro]);

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          title="GraphQL Import - Pro Feature"
          featureName="GraphQL schema import for custom MCP tools"
          showCloseButton={false}
        />
        <div style={{ maxWidth: '56rem', margin: '0 auto', filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #e535ab 0%, #ff6b6b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              GRAPHQL IMPORT
            </h1>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Fetch user's API key for pre-filling auth fields
  useEffect(() => {
    const fetchUserApiKey = async () => {
      try {
        const response = await fetch('/api/keys/list');
        if (response.ok) {
          const data = await response.json();
          if (data.hasKey && data.apiKey) {
            setUserApiKey(data.apiKey);
            // Pre-fill the API key field
            setUrlApiKey(data.apiKey);
          }
        }
      } catch (err) {
        console.error('Error fetching user API key:', err);
      }
    };
    fetchUserApiKey();
  }, []);

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
          { name: 'Astronomy', icon: '🌟', isSystem: true },
        ]);
      }
    };
    fetchCategories();
  }, []);

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
    setCurrentStep('fetch-schema');
  };

  // Build headers object from auth state
  const buildHeaders = (): Record<string, string> => {
    const headerObj: Record<string, string> = {};

    // API Key
    if (urlApiKey.trim()) {
      headerObj['x-api-key'] = urlApiKey.trim();
    }

    // Bearer Token
    if (authToken.trim()) {
      headerObj['Authorization'] = `Bearer ${authToken.trim()}`;
    }

    // Basic Auth
    if (basicCredentials.trim()) {
      const creds = basicCredentials.trim();
      if (creds.includes(':')) {
        headerObj['Authorization'] = `Basic ${btoa(creds)}`;
      } else {
        headerObj['Authorization'] = `Basic ${creds}`;
      }
    }

    // Custom headers
    customHeaders.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headerObj[h.key.trim()] = h.value.trim();
      }
    });

    return headerObj;
  };

  // Step 2: Fetch Schema
  const handleFetchSchema = async () => {
    if (!url.trim()) {
      setError('Please enter a GraphQL endpoint URL');
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      const headerObj = buildHeaders();

      const response = await fetch('/api/graphql/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), headers: headerObj }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch GraphQL schema');
      }

      setFetchResult(data);

      // Initialize environment from URL
      try {
        const urlObj = new URL(url);
        setEnvironments([{ name: 'default', host: `${urlObj.protocol}//${urlObj.host}` }]);
      } catch {
        setEnvironments([{ name: 'default', host: url }]);
      }

      setCurrentStep('preview-tools');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schema');
    } finally {
      setIsFetching(false);
    }
  };

  // Step 3: Proceed to Environments
  const handleProceedToEnvironments = () => {
    setError(null);
    setCurrentStep('environments');
  };

  // Environment handlers
  const handleAddEnvironment = () => {
    setEnvironments(prev => [...prev, { name: '', host: '' }]);
  };

  const handleRemoveEnvironment = (index: number) => {
    setEnvironments(prev => prev.filter((_, i) => i !== index));
  };

  const handleEnvironmentChange = (index: number, field: 'name' | 'host', value: string) => {
    setEnvironments(prev => prev.map((env, i) =>
      i === index ? { ...env, [field]: value } : env
    ));
  };

  // Step 4: Save/Import
  const handleSave = async () => {
    // Validate environments
    for (const env of environments) {
      if (!env.name.trim()) {
        setError('All environments must have a name');
        return;
      }
      if (!env.host.trim()) {
        setError('All environments must have a host URL');
        return;
      }
    }

    setError(null);
    setIsSaving(true);
    setCurrentStep('saving');

    try {
      // Build headers object using the shared function
      const headerObj = buildHeaders();

      // Determine auth type for storage
      let storedAuthType: 'none' | 'api_key' | 'bearer' | 'basic' = 'none';
      if (urlApiKey.trim()) {
        storedAuthType = 'api_key';
      } else if (authToken.trim()) {
        storedAuthType = authType;
      }

      const response = await fetch('/api/graphql/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: normalizeName(serverName.trim()),
          sourceUrl: url.trim(),
          schema: fetchResult?.schema,
          apiTitle: apiTitle.trim() || serverName.trim(),
          apiDescription: apiDescription.trim(),
          defaultHeaders: headerObj,
          authType: storedAuthType,
          category: selectedCategory,
          environments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import GraphQL schema');
      }

      setSuccessMessage(`Successfully imported ${data.toolCount} tools!`);

      // Redirect after success
      setTimeout(() => {
        router.push('/dashboard/mcp-composer');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import schema');
      setCurrentStep('environments');
    } finally {
      setIsSaving(false);
    }
  };

  // Back handler
  const handleBack = () => {
    setError(null);
    switch (currentStep) {
      case 'fetch-schema':
        setCurrentStep('server-name');
        break;
      case 'preview-tools':
        setCurrentStep('fetch-schema');
        break;
      case 'environments':
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
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
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
      { key: 'fetch-schema', label: '2. Schema', fullLabel: '2. Fetch Schema' },
      { key: 'preview-tools', label: '3. Tools', fullLabel: '3. Preview Tools' },
      { key: 'environments', label: '4. Envs', fullLabel: '4. Environments' },
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
              background: index <= currentIndex ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
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
            <span>Back to MCP Creator</span>
          </div>
        </Link>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{
            fontSize: 'clamp(1.25rem, 4vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            marginTop: '0.75rem',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            ◈ Import GraphQL Schema
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            marginTop: '0.5rem',
            fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
            lineHeight: 1.5,
          }}>
            Connect to a GraphQL endpoint and automatically create tools from queries and mutations.
            Your AI assistant will be able to call these operations directly.
          </p>
        </div>

        {/* Top Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.graphqlImportTop} style={{ marginBottom: '1.5rem' }} />

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
              This name will be used to identify your GraphQL API and will be part of the tool names.
            </p>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="e.g., my-graphql-api, github, shopify"
              style={{ ...inputStyle, fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}
              onKeyDown={(e) => e.key === 'Enter' && handleServerNameSubmit()}
            />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', marginTop: '0.5rem' }}>
              Normalized: <code style={{ color: '#a78bfa' }}>{normalizeName(serverName) || '...'}</code>
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
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '8px' }}>
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
                        } catch (err) {
                          setError('Failed to create category');
                        }
                      }}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
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

              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                All imported tools will be assigned to this category
              </p>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <button
                onClick={handleServerNameSubmit}
                style={{
                  ...primaryButtonStyle,
                  width: '100%',
                  padding: '0.875rem',
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fetch Schema */}
        {currentStep === 'fetch-schema' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              🔗 Connect to GraphQL Endpoint
            </h2>

            {/* URL Input */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                GraphQL Endpoint URL *
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/graphql"
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                The endpoint must support GraphQL introspection queries.
              </p>
            </div>

            {/* Auth Section */}
            <AuthenticationCard
              apiKey={urlApiKey}
              onApiKeyChange={setUrlApiKey}
              showApiKey={showApiKey}
              onShowApiKeyToggle={() => setShowApiKey(!showApiKey)}
              userApiKey={userApiKey}
              bearerToken={authToken}
              onBearerTokenChange={setAuthToken}
              showBearerToken={showAuthToken}
              onShowBearerTokenToggle={() => setShowAuthToken(!showAuthToken)}
              basicCredentials={basicCredentials}
              onBasicCredentialsChange={setBasicCredentials}
              showBasicCredentials={showBasicCredentials}
              onShowBasicCredentialsToggle={() => setShowBasicCredentials(!showBasicCredentials)}
              authType={authType}
              onAuthTypeChange={setAuthType}
              description="If your GraphQL endpoint requires authentication, provide credentials below."
              inputStyle={inputStyle}
            />

            {/* Custom Headers */}
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => setShowCustomHeaders(!showCustomHeaders)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                {showCustomHeaders ? '▼' : '▶'} Custom Headers {customHeaders.length > 0 && `(${customHeaders.length})`}
              </button>

              {showCustomHeaders && (
                <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  {customHeaders.map((header, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={header.key}
                        onChange={(e) => {
                          const newHeaders = [...customHeaders];
                          newHeaders[index].key = e.target.value;
                          setCustomHeaders(newHeaders);
                        }}
                        placeholder="Header name"
                        style={{ ...inputStyle, fontSize: '0.85rem', flex: 1 }}
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
                        style={{ ...inputStyle, fontSize: '0.85rem', flex: 2 }}
                      />
                      <button
                        type="button"
                        onClick={() => setCustomHeaders(customHeaders.filter((_, i) => i !== index))}
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: 'none',
                          color: '#ef4444',
                          borderRadius: '6px',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomHeaders([...customHeaders, { key: '', value: '' }])}
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px dashed rgba(255,255,255,0.3)',
                      color: 'rgba(255,255,255,0.7)',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      width: '100%',
                    }}
                  >
                    + Add Header
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: '1 1 auto', minWidth: '100px' }}>
                ← Back
              </button>
              <button
                onClick={handleFetchSchema}
                style={{
                  ...primaryButtonStyle,
                  flex: '2 1 auto',
                  minWidth: '150px',
                }}
                disabled={isFetching}
              >
                {isFetching ? 'Fetching...' : 'Fetch & Introspect →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview Tools */}
        {currentStep === 'preview-tools' && fetchResult && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {/* Schema Stats */}
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', borderRadius: '16px', padding: 'clamp(1rem, 3vw, 1.5rem)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <h3 style={{ color: '#10b981', margin: '0 0 1rem', fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)' }}>✅ Schema Fetched Successfully</h3>
              <div style={{ display: 'flex', gap: 'clamp(1rem, 3vw, 2rem)', flexWrap: 'wrap' }}>
                <div><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>Queries:</span> <strong style={{ color: '#fff' }}>{fetchResult.stats.queries}</strong></div>
                <div><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>Mutations:</span> <strong style={{ color: '#fff' }}>{fetchResult.stats.mutations}</strong></div>
                <div><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>Types:</span> <strong style={{ color: '#fff' }}>{fetchResult.stats.types}</strong></div>
              </div>
            </div>

            {/* Configuration */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', margin: '0 0 1.5rem', fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)' }}>⚙️ API Details</h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>API Title</label>
                  <input type="text" value={apiTitle} onChange={(e) => setApiTitle(e.target.value)} placeholder={serverName || 'My GraphQL API'} style={{ ...inputStyle, fontSize: 'clamp(0.85rem, 2vw, 0.95rem)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>Description</label>
                  <textarea value={apiDescription} onChange={(e) => setApiDescription(e.target.value)} placeholder="API description..." rows={2} style={{ ...inputStyle, resize: 'vertical', fontSize: 'clamp(0.85rem, 2vw, 0.95rem)' }} />
                </div>
              </div>
            </div>

            {/* Operations Preview */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)' }}>📋 Operations to Import</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {fetchResult.operations.queries.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ color: '#667eea', margin: '0 0 0.5rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>
                      <span style={{ background: 'rgba(102, 126, 234, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', marginRight: '0.5rem' }}>QUERY</span>
                      Queries ({fetchResult.operations.queries.length})
                    </h4>
                    {fetchResult.operations.queries.slice(0, 10).map(op => (
                      <div key={op.name} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ background: 'rgba(102, 126, 234, 0.3)', color: '#667eea', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600 }}>Q</span>
                        <span style={{ color: '#fff', fontWeight: 500, fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>{op.name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(0.7rem, 1.5vw, 0.8rem)' }}>→ {op.returnType}</span>
                      </div>
                    ))}
                    {fetchResult.operations.queries.length > 10 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(0.75rem, 2vw, 0.85rem)' }}>...and {fetchResult.operations.queries.length - 10} more</div>}
                  </div>
                )}
                {fetchResult.operations.mutations.length > 0 && (
                  <div>
                    <h4 style={{ color: '#f59e0b', margin: '0 0 0.5rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>
                      <span style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', marginRight: '0.5rem' }}>MUTATION</span>
                      Mutations ({fetchResult.operations.mutations.length})
                    </h4>
                    {fetchResult.operations.mutations.slice(0, 10).map(op => (
                      <div key={op.name} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600 }}>M</span>
                        <span style={{ color: '#fff', fontWeight: 500, fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>{op.name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(0.7rem, 1.5vw, 0.8rem)' }}>→ {op.returnType}</span>
                      </div>
                    ))}
                    {fetchResult.operations.mutations.length > 10 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(0.75rem, 2vw, 0.85rem)' }}>...and {fetchResult.operations.mutations.length - 10} more</div>}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button onClick={handleBack} style={secondaryButtonStyle}>
                ← Back
              </button>
              <button onClick={handleProceedToEnvironments} style={primaryButtonStyle}>
                Configure Environments →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Environments */}
        {currentStep === 'environments' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              🌍 Configure Environments
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', lineHeight: 1.5 }}>
              Each environment creates a set of tools with that environment prefix.
              Tool names will be: <code style={{ color: '#a78bfa', wordBreak: 'break-all' }}>env-{normalizeName(serverName)}-operationName</code>
            </p>

            {environments.map((env, index) => (
              <div key={index} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>Environment {index + 1}</span>
                  <button
                    onClick={() => handleRemoveEnvironment(index)}
                    style={{
                      ...secondaryButtonStyle,
                      padding: '0.25rem 0.5rem',
                      color: '#ef4444',
                      fontSize: '0.8rem',
                      opacity: environments.length <= 1 ? 0.5 : 1,
                    }}
                    disabled={environments.length <= 1}
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={env.name}
                  onChange={(e) => handleEnvironmentChange(index, 'name', e.target.value)}
                  placeholder="Environment name (e.g., prod, staging)"
                  style={{ ...inputStyle, fontSize: 'clamp(0.85rem, 2vw, 1rem)' }}
                />
                <input
                  type="url"
                  value={env.host}
                  onChange={(e) => handleEnvironmentChange(index, 'host', e.target.value)}
                  placeholder="Host URL (e.g., https://api.example.com)"
                  style={{ ...inputStyle, fontSize: 'clamp(0.85rem, 2vw, 1rem)' }}
                />
              </div>
            ))}

            <button
              onClick={handleAddEnvironment}
              style={{
                ...secondaryButtonStyle,
                marginTop: '0.5rem',
                width: '100%',
                padding: '0.75rem',
              }}
            >
              + Add Environment
            </button>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: '1 1 auto', minWidth: '100px' }}>
                ← Back
              </button>
              <button
                onClick={handleSave}
                style={{ ...primaryButtonStyle, flex: '2 1 auto', minWidth: '150px' }}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : `Import ${(fetchResult?.stats.queries || 0) + (fetchResult?.stats.mutations || 0)} Tools`}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Saving */}
        {currentStep === 'saving' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            {successMessage ? (
              <>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
                <h2 style={{ color: '#10b981', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                  {successMessage}
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Redirecting to MCP Creator...
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏳</div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                  Importing GraphQL Schema...
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Please wait while we create your GraphQL tools.
                </p>
              </>
            )}
          </div>
        )}

        {/* Bottom Ad */}
        <AdBanner slot={ADS_CONFIG.slots.graphqlImportBottom} style={{ marginTop: '2rem', marginBottom: '2rem' }} />

        <Footer />
      </div>
    </div>
  );
}

