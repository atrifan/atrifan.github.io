'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { AuthenticationCard, OAuth2Config, defaultOAuth2Config } from '../components/AuthenticationCard';
import { CustomHeadersCard, CustomHeader } from '../components/CustomHeadersCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { OAuthAuthenticationModal, OAuthSuccessData } from '../components/OAuthAuthenticationModal';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled } from '../config/mcp-composer.config';
import type { A2AAgentAuthType, OAuth2AuthConfig } from '../types/supabase';

interface AgentCard {
  name?: string;
  version?: string;
  protocolVersion?: string;
  url?: string;
  description?: string;
  tags?: string[];
  iconUrl?: string;
  [key: string]: unknown;
}

type Step = 'agent-name' | 'connect' | 'configure' | 'saving';

interface AgentImportPageProps {
  isPro: boolean;
  isPlus: boolean;
}

// Normalize name helper
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

export function AgentImportPage({ isPro, isPlus }: AgentImportPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('agent-name');
  const [agentName, setAgentName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Utilities');
  const [categories, setCategories] = useState<Array<{ name: string; icon: string; isSystem: boolean }>>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📦');

  // URL & Auth state
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<A2AAgentAuthType>('none');
  const [apiKey, setApiKey] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [basicCredentials, setBasicCredentials] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [oauth2Config, setOAuth2Config] = useState<OAuth2Config>(defaultOAuth2Config);
  const [showClientSecret, setShowClientSecret] = useState(false);

  // Custom headers state
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);

  // Agent card state
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // Environment state
  const [environmentName, setEnvironmentName] = useState('default');

  // Schema state
  const [inputSchema, setInputSchema] = useState<string>('');
  const [outputSchema, setOutputSchema] = useState<string>('');
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);

  // Modal state for manual paste
  const [showManualPasteModal, setShowManualPasteModal] = useState(false);
  const [manualAgentCardText, setManualAgentCardText] = useState('');

  // OAuth modal state for import
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthModalData, setOauthModalData] = useState<{
    serverName: string;
    serverId: string;
    oauthConfig: OAuth2AuthConfig;
  } | null>(null);
  // Store the temp server ID used during import for token linking
  const tempServerIdRef = useRef<string | null>(null);
  // Store the DCR client_id obtained during OAuth
  const dcrClientIdRef = useRef<string | null>(null);

  // UI state
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if feature is enabled
  useEffect(() => {
    if (!isMcpComposerEnabled()) {
      router.push('/dashboard');
    }
  }, [router]);

  // Agent import is now available for all tiers (free users can import external agents)

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
      case 'oauth2':
        // Store OAuth2 configuration with snake_case keys for database consistency
        return {
          authorization_endpoint: oauth2Config.authorizationEndpoint,
          token_endpoint: oauth2Config.tokenEndpoint,
          scopes: oauth2Config.scopes,
          use_dcr: oauth2Config.useDcr,
          client_id: oauth2Config.clientId,
          client_secret: oauth2Config.clientSecret,
          registration_endpoint: oauth2Config.registrationEndpoint,
        };
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

  // Step 1: Agent Name Submit
  const handleAgentNameSubmit = () => {
    if (!agentName.trim()) {
      setError('Please enter an agent name');
      return;
    }
    if (agentName.trim().length < 2) {
      setError('Agent name must be at least 2 characters');
      return;
    }
    setError(null);
    setCurrentStep('connect');
  };

  // Generate temp server ID for OAuth token storage during import
  const getTempServerId = useCallback(() => {
    if (!tempServerIdRef.current) {
      tempServerIdRef.current = `temp_${Buffer.from(url.trim()).toString('base64').slice(0, 32)}`;
    }
    return tempServerIdRef.current;
  }, [url]);

  // Build OAuth2 config for API calls
  const buildOAuth2ConfigForApi = useCallback((): OAuth2AuthConfig => {
    return {
      authorization_endpoint: oauth2Config.authorizationEndpoint,
      token_endpoint: oauth2Config.tokenEndpoint,
      scopes: oauth2Config.scopes,
      use_dcr: oauth2Config.useDcr,
      client_id: dcrClientIdRef.current || oauth2Config.clientId,
      client_secret: oauth2Config.clientSecret,
      registration_endpoint: oauth2Config.registrationEndpoint,
    };
  }, [oauth2Config]);

  // Build custom headers for API calls
  const buildCustomHeadersForApi = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    customHeaders.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headers[h.key.trim()] = h.value.trim();
      }
    });
    return headers;
  }, [customHeaders]);

  // Step 2: Connect and fetch agent card
  const handleConnect = async () => {
    if (!url.trim()) {
      setError('Please enter the agent URL');
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      let response;
      let data;

      // Use POST for any auth type (including none with custom headers)
      const needsPost = authType !== 'none' || customHeaders.some(h => h.key.trim() && h.value.trim());

      if (needsPost) {
        const requestBody: Record<string, unknown> = {
          url: url.trim(),
          authType,
          headers: buildCustomHeadersForApi(),
        };

        // Add auth-specific fields
        if (authType === 'api_key' && apiKey) {
          requestBody.apiKey = apiKey;
        } else if (authType === 'bearer' && bearerToken) {
          requestBody.bearerToken = bearerToken;
        } else if (authType === 'basic' && basicCredentials) {
          // basicCredentials should already be base64 encoded or we encode it
          requestBody.basicCredentials = basicCredentials.includes(':')
            ? Buffer.from(basicCredentials).toString('base64')
            : basicCredentials;
        } else if (authType === 'oauth2') {
          const oauthConfigForApi = buildOAuth2ConfigForApi();
          requestBody.oauth2Config = oauthConfigForApi;
          requestBody.agentId = getTempServerId();
        }

        response = await fetch('/api/agents/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        data = await response.json();

        // If OAuth is needed, show the OAuth modal
        if (data.needsOAuth && authType === 'oauth2') {
          const oauthConfigForApi = buildOAuth2ConfigForApi();
          setOauthModalData({
            serverName: displayName || agentName || 'A2A Agent',
            serverId: getTempServerId(),
            oauthConfig: oauthConfigForApi,
          });
          setOauthModalOpen(true);
          setIsFetching(false);
          return;
        }
      } else {
        // Simple GET for no auth
        response = await fetch(`/api/agents/fetch?url=${encodeURIComponent(url.trim())}`);
        data = await response.json();
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch agent card');
      }

      if (!data.hasAgentCard) {
        // Show modal for manual paste
        setShowManualPasteModal(true);
        setIsFetching(false);
        return;
      }

      // Process agent card
      processAgentCard(data.agentCard, data.iconUrl);
      setCurrentStep('configure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to agent');
    } finally {
      setIsFetching(false);
    }
  };

  // Flag to trigger retry after OAuth success
  const [retryConnectAfterOAuth, setRetryConnectAfterOAuth] = useState(false);

  // Handle OAuth success during import
  const handleOAuthSuccess = useCallback((data?: OAuthSuccessData) => {
    setOauthModalOpen(false);
    setOauthModalData(null);

    // Store DCR client_id if provided
    if (data?.clientId) {
      dcrClientIdRef.current = data.clientId;
      console.log('[Import OAuth] Stored DCR client_id:', data.clientId);
    }

    // Trigger retry via state change
    setRetryConnectAfterOAuth(true);
  }, []);

  // Effect to retry connect after OAuth success
  useEffect(() => {
    if (retryConnectAfterOAuth) {
      setRetryConnectAfterOAuth(false);
      // Call handleConnect - it's defined above so this is safe
      const doRetry = async () => {
        await handleConnect();
      };
      doRetry();
    }
  }, [retryConnectAfterOAuth]);

  // Handle OAuth cancel during import
  const handleOAuthCancel = useCallback(() => {
    setOauthModalOpen(false);
    setOauthModalData(null);
    setError('OAuth authentication cancelled');
  }, []);

  // Process agent card data
  const processAgentCard = (card: AgentCard, fallbackIconUrl?: string | null) => {
    setAgentCard(card);

    if (card.name && !displayName) {
      setDisplayName(card.name);
    }
    if (card.description) {
      setDescription(card.description);
    }
    if (card.tags && Array.isArray(card.tags)) {
      setTags(card.tags);
    }
    if (card.iconUrl) {
      setIconUrl(card.iconUrl);
    } else if (fallbackIconUrl) {
      setIconUrl(fallbackIconUrl);
    }

    // Populate default schemas (can be edited by user)
    const defaultInputSchema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query or message to send to the agent'
        }
      },
      required: ['query']
    };
    const defaultOutputSchema = {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          description: 'The agent response'
        }
      }
    };

    // Set default schemas if not already set
    if (!inputSchema) {
      setInputSchema(JSON.stringify(defaultInputSchema, null, 2));
    }
    if (!outputSchema) {
      setOutputSchema(JSON.stringify(defaultOutputSchema, null, 2));
    }
  };

  // Handle manual paste submit
  const handleManualPasteSubmit = () => {
    if (!manualAgentCardText.trim()) {
      setError('Please paste the agent card JSON or YAML');
      return;
    }

    try {
      let card: AgentCard;
      const text = manualAgentCardText.trim();

      // Try JSON first
      try {
        card = JSON.parse(text);
      } catch {
        // Try YAML
        const yaml = require('js-yaml');
        card = yaml.load(text) as AgentCard;
      }

      processAgentCard(card);
      setShowManualPasteModal(false);
      setManualAgentCardText('');
      setCurrentStep('configure');
    } catch (err) {
      setError('Invalid agent card format. Please paste valid JSON or YAML.');
    }
  };

  // Add tag
  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  // Step 3: Save agent
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setCurrentStep('saving');

    try {
      // Parse schemas if provided
      let parsedInputSchema: Record<string, unknown> | undefined;
      let parsedOutputSchema: Record<string, unknown> | undefined;

      if (inputSchema.trim()) {
        try {
          parsedInputSchema = JSON.parse(inputSchema);
        } catch {
          throw new Error('Invalid input schema JSON');
        }
      }

      if (outputSchema.trim()) {
        try {
          parsedOutputSchema = JSON.parse(outputSchema);
        } catch {
          throw new Error('Invalid output schema JSON');
        }
      }

      // Use URL from agent card if available, otherwise fall back to import URL
      const effectiveAgentUrl = agentCard?.url || url.trim();
      // Store the original import URL (the URL user entered)
      const originalImportUrl = url.trim();

      const response = await fetch('/api/agents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: agentName.trim(),
          displayName: displayName.trim() || agentName.trim(),
          agentUrl: effectiveAgentUrl,
          importUrl: originalImportUrl !== effectiveAgentUrl ? originalImportUrl : undefined,
          environmentName: environmentName.trim() || 'default',
          agentCard: agentCard || {},
          version: agentCard?.version,
          protocolVersion: agentCard?.protocolVersion,
          description: description.trim(),
          iconUrl,
          tags,
          category: selectedCategory,
          authType,
          authConfig: buildAuthConfig(),
          defaultHeaders: buildHeaders(),
          inputSchema: parsedInputSchema,
          outputSchema: parsedOutputSchema,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import agent');
      }

      // If OAuth was used during import, link the token to the real agent ID
      if (authType === 'oauth2' && tempServerIdRef.current && data.agentId) {
        try {
          console.log('[Import] Linking OAuth token from temp ID to real agent ID:', data.agentId);
          await fetch('/api/oauth/link-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tempServerId: tempServerIdRef.current,
              realAgentId: data.agentId,
              serverType: 'a2a',
            }),
          });

          // Also update the agent's auth_config with DCR client_id if available
          if (dcrClientIdRef.current) {
            await fetch(`/api/agents/${data.agentId}/update-oauth-client`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: dcrClientIdRef.current }),
            });
          }
        } catch (err) {
          console.error('[Import] Failed to link OAuth token:', err);
          // Non-fatal - user can re-auth in chat
        }
      }

      setSuccessMessage(`Successfully imported agent "${displayName || agentName}"!`);

      // Auto-redirect to MCP Composer after success
      setTimeout(() => {
        router.push('/dashboard/mcp-composer?refresh=1');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
      setCurrentStep('configure');
    } finally {
      setIsSaving(false);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
    padding: 'clamp(1rem, 3vw, 2rem) 0',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: 'clamp(1rem, 3vw, 1.5rem)',
    marginBottom: '1.5rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: 'clamp(0.9rem, 2vw, 1rem)',
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 600,
    fontSize: 'clamp(0.85rem, 2vw, 1rem)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  };

  // Step indicator
  const steps = [
    { key: 'agent-name', label: '1', fullLabel: '1. Name' },
    { key: 'connect', label: '2', fullLabel: '2. Connect' },
    { key: 'configure', label: '3', fullLabel: '3. Configure' },
    { key: 'saving', label: '4', fullLabel: '4. Save' },
  ];

  const renderStepIndicator = () => {
    const currentIndex = steps.findIndex(s => s.key === currentStep);
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {steps.map((step, index) => (
          <div
            key={step.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.5rem 1rem',
              borderRadius: '50px',
              background: index <= currentIndex ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255, 255, 255, 0.1)',
              color: index <= currentIndex ? '#fff' : 'rgba(255, 255, 255, 0.5)',
              fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
              fontWeight: 600,
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
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            🤖 Import A2A Agent
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            marginTop: '0.5rem',
            fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
            lineHeight: 1.5,
          }}>
            Connect to an Agent-to-Agent (A2A) protocol agent and import it as a tool.
          </p>
        </div>

        {/* Top Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.agentImportTop || ADS_CONFIG.slots.mcpComposerTop} style={{ marginBottom: '1.5rem' }} />

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

        {/* Step 1: Agent Name */}
        {currentStep === 'agent-name' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              Step 1: Name Your Agent
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>
              Choose a unique name for this agent. This will be used to identify the agent tool.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Agent Name *
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g., my-assistant"
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', marginTop: '0.5rem' }}>
                Normalized: <code style={{ color: '#f59e0b' }}>{normalizeName(agentName) || '...'}</code>
              </p>
            </div>

            {/* Category Selector */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Category
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
                    <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
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
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px' }}>
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
                      style={{ flex: 1, minWidth: '120px', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
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
                            setCategories(prev => [...prev, { name: data.category.name, icon: data.category.icon, isSystem: false }]);
                            setSelectedCategory(data.category.name);
                            setShowNewCategoryInput(false);
                            setNewCategoryName('');
                            setNewCategoryIcon('📦');
                          }
                        } catch (err) {
                          console.error('Error creating category:', err);
                        }
                      }}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowNewCategoryInput(false); setNewCategoryName(''); }}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={handleAgentNameSubmit} style={primaryButtonStyle}>
              Continue →
            </button>
          </div>
        )}


        {/* Step 2: Connect */}
        {currentStep === 'connect' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              Step 2: Connect to Agent
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>
              Enter the agent URL. We&apos;ll try to discover the agent card automatically.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Agent URL *
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://agent.example.com"
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                We&apos;ll check /.well-known/agent.json, /.well-known/agent.yaml, /.well-known/agent-card.json
              </p>
            </div>

            {/* Authentication */}
            <AuthenticationCard
              authType={authType}
              onAuthTypeChange={(type) => setAuthType(type as A2AAgentAuthType)}
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
              oauth2Config={oauth2Config}
              onOAuth2ConfigChange={setOAuth2Config}
              showClientSecret={showClientSecret}
              onShowClientSecretToggle={() => setShowClientSecret(!showClientSecret)}
              domainForCheck={url}
              inputStyle={inputStyle}
              serverType="a2a"
              serverId={getTempServerId()}
              onOAuthToken={(_token, clientId) => {
                // Store DCR client_id if provided
                if (clientId) {
                  dcrClientIdRef.current = clientId;
                  console.log('[Import] OAuth token stored with client_id:', clientId);
                }
              }}
            />

            {/* Custom Headers */}
            <CustomHeadersCard
              headers={customHeaders}
              onHeadersChange={setCustomHeaders}
              inputStyle={inputStyle}
            />

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setCurrentStep('agent-name')} style={secondaryButtonStyle}>
                ← Back
              </button>
              <button onClick={handleConnect} disabled={isFetching} style={primaryButtonStyle}>
                {isFetching ? 'Connecting...' : 'Connect & Discover →'}
              </button>
            </div>
          </div>
        )}


        {/* Step 3: Configure */}
        {currentStep === 'configure' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1rem, 3vw, 1.25rem)', marginBottom: '1rem' }}>
              Step 3: Configure Agent
            </h2>

            {/* Agent Card Preview */}
            {agentCard && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                  {iconUrl && (
                    <img
                      src={iconUrl}
                      alt="Agent icon"
                      style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div>
                    <h3 style={{ color: '#f59e0b', margin: 0, fontSize: '1.1rem' }}>
                      {agentCard.name || displayName || agentName}
                    </h3>
                    {agentCard.version && (
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                        v{agentCard.version} {agentCard.protocolVersion && `(Protocol: ${agentCard.protocolVersion})`}
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: 0 }}>
                  ✅ Agent card discovered successfully
                </p>
              </div>
            )}

            {/* Display Name */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Agent display name"
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* Environment Name */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Environment Name
              </label>
              <input
                type="text"
                value={environmentName}
                onChange={(e) => setEnvironmentName(e.target.value)}
                placeholder="default"
                style={inputStyle}
              />
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Tags
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {tags.map(tag => (
                  <span key={tag} style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#f59e0b',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '50px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add a tag"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={handleAddTag} style={{ ...secondaryButtonStyle, padding: '0.5rem 1rem' }}>
                  Add
                </button>
              </div>
            </div>

            {/* Widget Support (greyed out) */}
            <div style={{ marginBottom: '1rem', opacity: 0.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', cursor: 'not-allowed' }}>
                <input type="checkbox" disabled checked={false} />
                Widget Support (not available for A2A agents)
              </label>
            </div>

            {/* Schema Editor Toggle */}
            <div style={{ marginBottom: '1rem' }}>
              <button
                onClick={() => setShowSchemaEditor(!showSchemaEditor)}
                style={{ ...secondaryButtonStyle, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                {showSchemaEditor ? '▼' : '▶'} Advanced: Edit Schemas
              </button>
            </div>


            {showSchemaEditor && (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Input Schema (JSON) - Edit as needed
                  </label>
                  <textarea
                    value={inputSchema}
                    onChange={(e) => setInputSchema(e.target.value)}
                    rows={8}
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Define the input parameters for this agent tool
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Output Schema (JSON) - Edit as needed
                  </label>
                  <textarea
                    value={outputSchema}
                    onChange={(e) => setOutputSchema(e.target.value)}
                    rows={6}
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Define the expected output structure from this agent
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setCurrentStep('connect')} style={secondaryButtonStyle}>
                ← Back
              </button>
              <button onClick={handleSave} disabled={isSaving} style={primaryButtonStyle}>
                {isSaving ? 'Saving...' : 'Import Agent →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Saving */}
        {currentStep === 'saving' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
            {successMessage ? (
              <>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
                <h2 style={{ color: '#10b981', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                  {successMessage}
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>
                  Your A2A agent is ready to use.
                </p>
                <button
                  onClick={() => router.push('/dashboard/mcp-composer?refresh=1')}
                  style={primaryButtonStyle}
                >
                  ← Back to MCP Composer
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏳</div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                  Importing Agent...
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Please wait while we set up your A2A agent.
                </p>
              </>
            )}
          </div>
        )}

        {/* Bottom Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.agentImportBottom || ADS_CONFIG.slots.mcpComposerBottom} style={{ marginTop: '1.5rem' }} />
      </div>

      {/* Manual Paste Modal */}
      {showManualPasteModal && (
        <div style={{
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
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a3e, #0f0f23)',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '1.5rem',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '85vh',
            overflow: 'auto',
          }}>
            <h2 style={{ color: '#f59e0b', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📋</span> No Agent Card Found
            </h2>

            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem'
            }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', margin: 0, fontSize: '0.9rem' }}>
                We tried these discovery paths but couldn&apos;t find an agent card:
              </p>
              <ul style={{ color: 'rgba(255,255,255,0.6)', margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
                <li><code>/.well-known/agent.json</code></li>
                <li><code>/.well-known/agent.yaml</code></li>
                <li><code>/.well-known/agent-card.json</code></li>
                <li><code>/.well-known/agent-card.yaml</code></li>
              </ul>
            </div>

            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              Paste the agent card JSON below. The <code style={{ color: '#f59e0b' }}>url</code> field is required for A2A communication:
            </p>

            <textarea
              value={manualAgentCardText}
              onChange={(e) => setManualAgentCardText(e.target.value)}
              placeholder={`{
  "name": "My Agent",
  "version": "1.0.0",
  "url": "https://agent.example.com/a2a",
  "description": "Description of what this agent does",
  "protocolVersion": "0.2.0",
  "tags": ["utility", "ai"]
}`}
              rows={12}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical', marginBottom: '0.75rem', lineHeight: 1.5 }}
            />

            {/* Validation hint */}
            {manualAgentCardText.trim() && (() => {
              try {
                const parsed = JSON.parse(manualAgentCardText.trim());
                const hasUrl = !!parsed.url;
                const hasName = !!parsed.name;
                return (
                  <div style={{
                    background: hasUrl ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${hasUrl ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: '6px',
                    padding: '0.5rem 0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ color: hasName ? '#10b981' : '#ef4444' }}>
                      {hasName ? '✓' : '✗'} name: {hasName ? parsed.name : 'missing'}
                    </div>
                    <div style={{ color: hasUrl ? '#10b981' : '#ef4444' }}>
                      {hasUrl ? '✓' : '⚠️'} url: {hasUrl ? parsed.url : 'missing (will use import URL)'}
                    </div>
                    {parsed.version && <div style={{ color: '#10b981' }}>✓ version: {parsed.version}</div>}
                  </div>
                );
              } catch {
                return (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '0.5rem 0.75rem',
                    marginBottom: '1rem',
                    color: '#ef4444',
                    fontSize: '0.8rem'
                  }}>
                    ✗ Invalid JSON format
                  </div>
                );
              }
            })()}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setShowManualPasteModal(false);
                  setManualAgentCardText('');
                  // Continue without agent card - use import URL as agent URL
                  setCurrentStep('configure');
                }}
                style={secondaryButtonStyle}
              >
                Skip (Use URL as endpoint)
              </button>
              <button onClick={handleManualPasteSubmit} style={primaryButtonStyle}>
                Validate & Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Authentication Modal for Import */}
      {oauthModalData && (
        <OAuthAuthenticationModal
          isOpen={oauthModalOpen}
          serverName={oauthModalData.serverName}
          serverType="a2a"
          serverId={oauthModalData.serverId}
          oauthConfig={oauthModalData.oauthConfig}
          onSuccess={handleOAuthSuccess}
          onCancel={handleOAuthCancel}
        />
      )}

      <Footer />
    </div>
  );
}
