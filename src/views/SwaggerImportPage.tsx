'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Footer } from '../components/Footer';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { AuthenticationCard, AuthType, OAuth2Config, defaultOAuth2Config } from '../components/AuthenticationCard';
import { CustomHeadersCard, CustomHeader } from '../components/CustomHeadersCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled } from '../config/mcp-composer.config';
import { parseOpenAPISpec, detectFormat, normalizeName, generateToolName } from '../lib/openapi-parser';
import type { ExtractedTool, ParseResult } from '../lib/openapi-parser';

// ============ Types ============

type Step = 'server-name' | 'paste-spec' | 'preview-tools' | 'environments' | 'saving';
type ImportMethod = 'paste' | 'url';

interface EnvironmentConfig {
  name: string;
  host: string;
}

interface SwaggerImportPageProps {
  isPro: boolean;
  isPlus: boolean;
}

// ============ Component ============

export function SwaggerImportPage({ isPro, isPlus }: SwaggerImportPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('server-name');
  const [serverName, setServerName] = useState('');
  const [specFormat, setSpecFormat] = useState<'json' | 'yaml'>('json');
  const [specInput, setSpecInput] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [widgetEnabledTools, setWidgetEnabledTools] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState('Utilities');
  const [categories, setCategories] = useState<Array<{ name: string; icon: string; isSystem: boolean }>>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📦');

  // URL import state
  const [importMethod, setImportMethod] = useState<ImportMethod>('paste');
  const [swaggerUrl, setSwaggerUrl] = useState('');
  const [urlApiKey, setUrlApiKey] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [basicCredentials, setBasicCredentials] = useState('');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [defaultHostFromUrl, setDefaultHostFromUrl] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [oauth2Config, setOAuth2Config] = useState<OAuth2Config>(defaultOAuth2Config);
  const [showClientSecret, setShowClientSecret] = useState(false);

  // Custom headers state
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);

  // UI state
  const [isValidating, setIsValidating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Existing spec warning
  interface ExistingSpec {
    id: string;
    apiTitle: string;
    createdAt: string;
    endpointCount: number;
  }
  const [existingSpec, setExistingSpec] = useState<ExistingSpec | null>(null);
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);

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
          title="Swagger Import - Pro Feature"
          featureName="OpenAPI/Swagger import for custom MCP tools"
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
              background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              SWAGGER IMPORT
            </h1>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

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
        // Use default categories
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

  // Auto-detect format when spec input changes
  useEffect(() => {
    if (specInput.trim()) {
      setSpecFormat(detectFormat(specInput));
    }
  }, [specInput]);

  // ============ Handlers ============

  const handleServerNameSubmit = async (forceOverwrite = false) => {
    if (!serverName.trim()) {
      setError('Please enter a server name');
      return;
    }

    const normalized = normalizeName(serverName);
    if (normalized.length < 2) {
      setError('Server name must be at least 2 characters');
      return;
    }

    setError(null);

    // Check if server name already exists
    if (!forceOverwrite) {
      setIsCheckingName(true);
      try {
        const response = await fetch(`/api/swagger/check-name?serverName=${encodeURIComponent(normalized)}`);
        const data = await response.json();

        if (data.exists) {
          setExistingSpec(data.spec);
          setShowOverwriteWarning(true);
          setIsCheckingName(false);
          return;
        }
      } catch (err) {
        console.error('Error checking server name:', err);
        // Continue anyway if check fails
      }
      setIsCheckingName(false);
    }

    setShowOverwriteWarning(false);
    setExistingSpec(null);
    setCurrentStep('paste-spec');
  };

  const handleConfirmOverwrite = () => {
    setShowOverwriteWarning(false);
    handleServerNameSubmit(true);
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteWarning(false);
    setExistingSpec(null);
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

  const handleValidateSpec = async () => {
    if (!specInput.trim()) {
      setError('Please paste your OpenAPI/Swagger specification');
      return;
    }
    
    setIsValidating(true);
    setError(null);
    
    try {
      const result = await parseOpenAPISpec(specInput, serverName, specFormat);
      
      if (!result.success) {
        setError(result.error || 'Failed to parse specification');
        setIsValidating(false);
        return;
      }
      
      setParseResult(result);
      
      // Initialize environments from spec
      if (result.environments) {
        setEnvironments(result.environments.map(env => ({
          name: env.name,
          host: env.host,
        })));
      }
      
      // Select all tools by default
      if (result.tools) {
        setSelectedTools(new Set(result.tools.map(t => t.operationId)));
        // Initialize widget-enabled tools from x-has-widget extension
        const widgetTools = result.tools
          .filter(t => t.hasWidget === true)
          .map(t => t.operationId);
        setWidgetEnabledTools(new Set(widgetTools));
      }

      setCurrentStep('preview-tools');
    } catch (err) {
      setError(`Validation failed: ${(err as Error).message}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleFetchFromUrl = async () => {
    if (!swaggerUrl.trim()) {
      setError('Please enter a Swagger/OpenAPI URL');
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      // Build headers for the fetch request
      const headerObj = buildHeaders();

      const response = await fetch('/api/swagger/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: swaggerUrl,
          headers: headerObj,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch specification');
        setIsFetching(false);
        return;
      }

      // Set the fetched spec
      setSpecInput(data.spec);
      setSpecFormat(data.format);
      setDefaultHostFromUrl(data.defaultHost);

      // Now validate it
      const result = await parseOpenAPISpec(data.spec, serverName, data.format);

      if (!result.success) {
        setError(result.error || 'Failed to parse specification');
        setIsFetching(false);
        return;
      }

      setParseResult(result);

      // Initialize environments - use spec hosts or fallback to URL host
      if (result.environments && result.environments.length > 0) {
        setEnvironments(result.environments.map(env => ({
          name: env.name,
          host: env.host,
        })));
      } else if (data.defaultHost) {
        // No hosts in spec, use the swagger URL host
        setEnvironments([{ name: 'default', host: data.defaultHost }]);
      }

      // Select all tools by default
      if (result.tools) {
        setSelectedTools(new Set(result.tools.map(t => t.operationId)));
        // Initialize widget-enabled tools from x-has-widget extension
        const widgetTools = result.tools
          .filter(t => t.hasWidget === true)
          .map(t => t.operationId);
        setWidgetEnabledTools(new Set(widgetTools));
      }

      setCurrentStep('preview-tools');
    } catch (err) {
      setError(`Failed to fetch: ${(err as Error).message}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handleToolToggle = (operationId: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(operationId)) {
        next.delete(operationId);
      } else {
        next.add(operationId);
      }
      return next;
    });
  };

  const handleSelectAllTools = () => {
    if (parseResult?.tools) {
      setSelectedTools(new Set(parseResult.tools.map(t => t.operationId)));
    }
  };

  const handleDeselectAllTools = () => {
    setSelectedTools(new Set());
  };

  const handleProceedToEnvironments = () => {
    if (selectedTools.size === 0) {
      setError('Please select at least one tool to import');
      return;
    }
    setError(null);
    setCurrentStep('environments');
  };

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

    // Validate tool name lengths
    const selectedToolsList = parseResult?.tools?.filter(t => selectedTools.has(t.operationId)) || [];
    for (const tool of selectedToolsList) {
      for (const env of environments) {
        const fullName = generateToolName(env.name, serverName, tool.operationId, tool.httpMethod);
        if (fullName.length > 50) {
          setError(`Tool name "${fullName}" exceeds 50 characters. Please shorten the server name, environment name, or operation ID.`);
          return;
        }
      }
    }

    setError(null);
    setIsSaving(true);
    setCurrentStep('saving');

    try {
      // Add widget info to each tool
      const toolsWithWidgetInfo = selectedToolsList.map(tool => ({
        ...tool,
        hasWidget: widgetEnabledTools.has(tool.operationId),
      }));

      // Build headers for storage
      const headerObj = buildHeaders();

      // Determine auth type for storage based on what's filled
      let storedAuthType: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2' = 'none';
      if (authType === 'oauth2' && oauth2Config.enabled) {
        storedAuthType = 'oauth2';
      } else if (urlApiKey.trim()) {
        storedAuthType = 'api_key';
      } else if (authToken.trim()) {
        storedAuthType = 'bearer';
      } else if (basicCredentials.trim()) {
        storedAuthType = 'basic';
      }

      // Build request body
      const requestBody: Record<string, unknown> = {
        serverName,
        specFormat,
        spec: parseResult?.spec,
        rawSpec: specInput,
        sourceUrl: importMethod === 'url' ? swaggerUrl : undefined,
        importMethod,
        apiInfo: parseResult?.apiInfo,
        tools: toolsWithWidgetInfo,
        environments,
        category: selectedCategory,
        defaultHeaders: headerObj,
        authType: storedAuthType,
      };

      // Add OAuth2 config if applicable
      if (storedAuthType === 'oauth2') {
        requestBody.oauth2Config = {
          authorizationEndpoint: oauth2Config.authorizationEndpoint,
          tokenEndpoint: oauth2Config.tokenEndpoint,
          scopes: oauth2Config.scopes,
          useDcr: oauth2Config.useDcr,
          clientId: oauth2Config.clientId,
          clientSecret: oauth2Config.clientSecret,
          registrationEndpoint: oauth2Config.registrationEndpoint,
        };
      }

      const response = await fetch('/api/swagger/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      setSuccessMessage(`Successfully imported ${data.toolCount} tools!`);

      // Redirect after success with refresh param to force reload
      setTimeout(() => {
        router.push('/dashboard/mcp-composer?refresh=1');
      }, 2000);
    } catch (err) {
      setError(`Failed to save: ${(err as Error).message}`);
      setCurrentStep('environments');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    setError(null);
    switch (currentStep) {
      case 'paste-spec':
        setCurrentStep('server-name');
        break;
      case 'preview-tools':
        setCurrentStep('paste-spec');
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

  // ============ Render Steps ============

  const renderStepIndicator = () => {
    const steps = [
      { key: 'server-name', label: '1. Name', fullLabel: '1. Server Name' },
      { key: 'paste-spec', label: '2. Spec', fullLabel: '2. Import Spec' },
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

  const renderServerNameStep = () => (
    <div style={cardStyle}>
      <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
        📝 Enter Server Name
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', lineHeight: 1.5 }}>
        This name will be used to identify your API and will be part of the tool names.
      </p>
      <input
        type="text"
        value={serverName}
        onChange={(e) => setServerName(e.target.value)}
        placeholder="e.g., my-api, petstore, user-service"
        style={{ ...inputStyle, fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}
        onKeyDown={(e) => e.key === 'Enter' && !isCheckingName && handleServerNameSubmit()}
        disabled={isCheckingName}
      />
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', marginTop: '0.5rem' }}>
        Normalized: <code style={{ color: '#a78bfa' }}>{normalizeName(serverName) || '...'}</code>
      </p>

      {/* Category Selector */}
      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
          Tool Category
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
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
                WebkitAppearance: 'none',
                MozAppearance: 'none',
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
                    } else {
                      const data = await response.json();
                      setError(data.error || 'Failed to create category');
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

      {/* Overwrite Warning */}
      {showOverwriteWarning && existingSpec && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'rgba(251, 191, 36, 0.15)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fbbf24', fontWeight: 600, margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                Server name already exists
              </p>
              <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 0.75rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
                An API named <strong style={{ color: '#fff' }}>{existingSpec.apiTitle || normalizeName(serverName)}</strong> with{' '}
                <strong style={{ color: '#fff' }}>{existingSpec.endpointCount} endpoint{existingSpec.endpointCount !== 1 ? 's' : ''}</strong>{' '}
                already exists. Continuing will overwrite the existing tools.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleConfirmOverwrite}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Overwrite Existing
                </button>
                <button
                  onClick={handleCancelOverwrite}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.8)',
                    fontWeight: 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Use Different Name
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={() => handleServerNameSubmit()}
          disabled={isCheckingName || showOverwriteWarning}
          style={{
            ...primaryButtonStyle,
            width: '100%',
            padding: '0.875rem',
            opacity: isCheckingName || showOverwriteWarning ? 0.6 : 1,
            cursor: isCheckingName || showOverwriteWarning ? 'not-allowed' : 'pointer',
          }}
        >
          {isCheckingName ? 'Checking...' : 'Continue →'}
        </button>
      </div>
    </div>
  );

  const renderPasteSpecStep = () => (
    <div style={cardStyle}>
      <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
        ☁️ Import OpenAPI/Swagger Specification
      </h2>

      {/* Import Method Toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setImportMethod('paste')}
          style={{
            ...secondaryButtonStyle,
            background: importMethod === 'paste' ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
            flex: '1 1 auto',
            minWidth: '120px',
          }}
        >
          📋 Paste Code
        </button>
        <button
          onClick={() => setImportMethod('url')}
          style={{
            ...secondaryButtonStyle,
            background: importMethod === 'url' ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.1)',
            flex: '1 1 auto',
            minWidth: '120px',
          }}
        >
          🔗 Fetch from URL
        </button>
      </div>

      {importMethod === 'paste' ? (
        <>
          {/* Format Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSpecFormat('json')}
              style={{
                ...secondaryButtonStyle,
                background: specFormat === 'json' ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
              }}
            >
              JSON
            </button>
            <button
              onClick={() => setSpecFormat('yaml')}
              style={{
                ...secondaryButtonStyle,
                background: specFormat === 'yaml' ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
              }}
            >
              YAML
            </button>
          </div>

          <textarea
            value={specInput}
            onChange={(e) => setSpecInput(e.target.value)}
            placeholder={specFormat === 'json' ? '{\n  "openapi": "3.0.0",\n  ...\n}' : 'openapi: 3.0.0\ninfo:\n  title: My API\n  ...'}
            style={{
              ...inputStyle,
              minHeight: 'clamp(200px, 40vh, 300px)',
              fontFamily: 'monospace',
              fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
              resize: 'vertical',
            }}
          />

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: '1 1 auto', minWidth: '100px' }}>
              ← Back
            </button>
            <button
              onClick={handleValidateSpec}
              style={{ ...primaryButtonStyle, flex: '2 1 auto', minWidth: '150px' }}
              disabled={isValidating}
            >
              {isValidating ? 'Validating...' : 'Validate & Preview →'}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* URL Input */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              Swagger/OpenAPI URL *
            </label>
            <input
              type="url"
              value={swaggerUrl}
              onChange={(e) => setSwaggerUrl(e.target.value)}
              placeholder="https://api.example.com/swagger.json"
              style={inputStyle}
            />
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
            oauth2Config={oauth2Config}
            onOAuth2ConfigChange={setOAuth2Config}
            showClientSecret={showClientSecret}
            onShowClientSecretToggle={() => setShowClientSecret(!showClientSecret)}
            domainForCheck={swaggerUrl}
            description="If your Swagger endpoint requires authentication, provide credentials below."
            inputStyle={inputStyle}
          />

          {/* Custom Headers */}
          <CustomHeadersCard
            headers={customHeaders}
            onHeadersChange={setCustomHeaders}
            inputStyle={inputStyle}
          />

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={handleBack} style={{ ...secondaryButtonStyle, flex: '1 1 auto', minWidth: '100px' }}>
              ← Back
            </button>
            <button
              onClick={handleFetchFromUrl}
              style={{
                ...primaryButtonStyle,
                flex: '2 1 auto',
                minWidth: '150px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
              }}
              disabled={isFetching}
            >
              {isFetching ? 'Fetching...' : 'Fetch & Validate →'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderPreviewToolsStep = () => {
    const tools = parseResult?.tools || [];
    const apiInfo = parseResult?.apiInfo;

    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>
          🔧 Preview Extracted Tools
        </h2>

        {/* API Info */}
        {apiInfo && (
          <div style={{
            background: 'rgba(102, 126, 234, 0.1)',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid rgba(102, 126, 234, 0.3)',
          }}>
            <h3 style={{ color: '#a78bfa', fontSize: '1rem', margin: 0 }}>{apiInfo.title}</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
              {apiInfo.description || 'No description'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
              Version: {apiInfo.version} | OpenAPI: {apiInfo.openapiVersion}
            </p>
          </div>
        )}

        {/* Selection Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={handleSelectAllTools} style={secondaryButtonStyle}>
            Select All ({tools.length})
          </button>
          <button onClick={handleDeselectAllTools} style={secondaryButtonStyle}>
            Deselect All
          </button>
          <span style={{ color: 'rgba(255,255,255,0.6)', alignSelf: 'center', marginLeft: 'auto' }}>
            {selectedTools.size} selected
          </span>
        </div>

        {/* Tools List */}
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {tools.map(tool => (
            <ToolPreviewCard
              key={tool.operationId}
              tool={tool}
              serverName={serverName}
              isSelected={selectedTools.has(tool.operationId)}
              hasWidget={widgetEnabledTools.has(tool.operationId)}
              onToggle={() => handleToolToggle(tool.operationId)}
              onWidgetToggle={() => {
                setWidgetEnabledTools(prev => {
                  const next = new Set(prev);
                  if (next.has(tool.operationId)) {
                    next.delete(tool.operationId);
                  } else {
                    next.add(tool.operationId);
                  }
                  return next;
                });
              }}
            />
          ))}
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button onClick={handleBack} style={secondaryButtonStyle}>
            ← Back
          </button>
          <button onClick={handleProceedToEnvironments} style={primaryButtonStyle}>
            Configure Environments →
          </button>
        </div>
      </div>
    );
  };

  const renderEnvironmentsStep = () => (
    <div style={cardStyle}>
      <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
        🌍 Configure Environments
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', lineHeight: 1.5 }}>
        Each environment creates a set of tools with that environment prefix.
        Tool names will be: <code style={{ color: '#a78bfa', wordBreak: 'break-all' }}>env-{normalizeName(serverName)}-operationId</code>
      </p>

      {/* Info about default host from URL */}
      {defaultHostFromUrl && environments.length === 1 && environments[0].host === defaultHostFromUrl && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '0.75rem',
          marginBottom: '1rem',
          fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
        }}>
          <span style={{ color: '#10b981' }}>💡 Default host extracted from your Swagger URL. You can edit it below.</span>
        </div>
      )}

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
          {isSaving ? 'Saving...' : `Import ${selectedTools.size * environments.length} Tools`}
        </button>
      </div>
    </div>
  );

  const renderSavingStep = () => (
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
            Importing Tools...
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>
            Please wait while we create your REST API tools.
          </p>
        </>
      )}
    </div>
  );

  // ============ Main Render ============

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
            ☁️ Import Swagger API
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            marginTop: '0.5rem',
            fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
            lineHeight: 1.5,
          }}>
            Import OpenAPI/Swagger specifications to create REST API tools.
            Paste your spec or fetch directly from a URL.
          </p>
        </div>

        {/* Top Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.swaggerImportTop} style={{ marginBottom: '1.5rem' }} />

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

        {/* Step Content */}
        {currentStep === 'server-name' && renderServerNameStep()}
        {currentStep === 'paste-spec' && renderPasteSpecStep()}
        {currentStep === 'preview-tools' && renderPreviewToolsStep()}
        {currentStep === 'environments' && renderEnvironmentsStep()}
        {currentStep === 'saving' && renderSavingStep()}

        {/* Bottom Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.swaggerImportBottom} style={{ marginTop: '2rem', marginBottom: '2rem' }} />

        <Footer />
      </div>
    </div>
  );
}

// ============ Sub-Components ============

interface ToolPreviewCardProps {
  tool: ExtractedTool;
  serverName: string;
  isSelected: boolean;
  hasWidget: boolean;
  onToggle: () => void;
  onWidgetToggle: () => void;
}

function ToolPreviewCard({ tool, serverName, isSelected, hasWidget, onToggle, onWidgetToggle }: ToolPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const methodColors: Record<string, string> = {
    GET: '#10b981',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    PATCH: '#8b5cf6',
    DELETE: '#ef4444',
  };

  return (
    <div
      style={{
        background: isSelected ? 'rgba(102, 126, 234, 0.15)' : 'rgba(0,0,0,0.2)',
        border: isSelected ? '1px solid rgba(102, 126, 234, 0.4)' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '0.75rem',
        marginBottom: '0.5rem',
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Checkbox */}
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '4px',
          border: '2px solid',
          borderColor: isSelected ? '#667eea' : 'rgba(255,255,255,0.3)',
          background: isSelected ? '#667eea' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isSelected && <span style={{ color: '#fff', fontSize: '0.75rem' }}>✓</span>}
        </div>

        {/* Method Badge */}
        <span style={{
          padding: '0.25rem 0.5rem',
          borderRadius: '4px',
          background: methodColors[tool.httpMethod] || '#666',
          color: '#fff',
          fontSize: '0.7rem',
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {tool.httpMethod}
        </span>

        {/* Path */}
        <code style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tool.path}
        </code>

        {/* Expand Button */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: '0.25rem',
          }}
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {/* Operation ID and Description */}
      <div style={{ marginTop: '0.5rem', marginLeft: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#a78bfa', fontSize: '0.8rem', fontWeight: 600 }}>
            {tool.operationId}
          </span>
          {/* Tags from OpenAPI */}
          {tool.tags && tool.tags.length > 0 && tool.tags.map(tag => (
            <span key={tag} style={{
              fontSize: '0.65rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#10b981',
            }}>
              {tag}
            </span>
          ))}
          {/* x-has-widget indicator */}
          {tool.hasWidget && (
            <span style={{
              fontSize: '0.65rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '4px',
              background: 'rgba(167, 139, 250, 0.2)',
              color: '#a78bfa',
            }}>
              🎨 widget
            </span>
          )}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
          {tool.description.slice(0, 100)}{tool.description.length > 100 ? '...' : ''}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{ marginTop: '1rem', marginLeft: '2rem', fontSize: '0.8rem' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Tool Name:</strong>{' '}
            <code style={{ color: '#10b981' }}>{generateToolName('env', serverName, tool.operationId, tool.httpMethod)}</code>
          </div>

          {/* Widget Toggle */}
          <div style={{
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); onWidgetToggle(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: `1px solid ${hasWidget ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255,255,255,0.2)'}`,
                background: hasWidget ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                color: hasWidget ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                border: `2px solid ${hasWidget ? '#a78bfa' : 'rgba(255,255,255,0.4)'}`,
                background: hasWidget ? '#a78bfa' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {hasWidget && <span style={{ color: '#fff', fontSize: '0.6rem' }}>✓</span>}
              </span>
              Enable Widget
            </button>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
              (renders response in UI)
            </span>
          </div>

          {tool.pathParams.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Path Params:</strong>{' '}
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{tool.pathParams.join(', ')}</span>
            </div>
          )}

          {tool.queryParams.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Query Params:</strong>{' '}
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                {tool.queryParams.map(p => `${p.name}${p.required ? '*' : ''}`).join(', ')}
              </span>
            </div>
          )}

          <details style={{ marginTop: '0.5rem' }}>
            <summary style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Input Schema</summary>
            <pre style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '0.5rem',
              borderRadius: '4px',
              overflow: 'auto',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '0.75rem',
            }}>
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </details>

          <details style={{ marginTop: '0.5rem' }}>
            <summary style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Output Schema</summary>
            <pre style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '0.5rem',
              borderRadius: '4px',
              overflow: 'auto',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '0.75rem',
            }}>
              {JSON.stringify(tool.outputSchema, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
