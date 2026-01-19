'use client';

import { useState, useEffect, useRef } from 'react';
import { View } from '@adobe/react-spectrum';
import { useUser, useClerk, useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';
import { isBillingEnabled } from '../config/billing.config';
import { isMcpComposerEnabled, getToolCountSeverity, getToolCountColor } from '../config/mcp-composer.config';
import { LockedSection } from '../components/LockedSection';
import { FaviconImage } from '../components/FaviconImage';
// Server data from API
interface ServerFromApi {
  id: string;
  name: string;
  serverName: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  tools: {
    id: string;
    toolId: string;
    name: string;
    description: string;
    category: string;
    isEnabled: boolean;
  }[];
}
import { ToolCountWarning } from './MCPComposerPage';
import { TOTAL_TOOL_COUNT } from '../config/tools-definitions';
import { usePreferences } from '../contexts/PreferencesContext';
import { TIME_FORMAT_LABELS, MEASUREMENT_SYSTEM_LABELS, CURRENCY_LABELS, TimeFormat, MeasurementSystem, Currency } from '../types/preferences';
import { AI_MODELS, TOKEN_QUOTAS, formatTokenCount, formatCurrency, DEFAULT_MONTHLY_BUDGET, calculateSafeTokensForBudget } from '../config/ai-tokens.config';
import { BudgetHistoryViewer } from '../components/BudgetHistoryViewer';

// Budget types
interface ModelBudgetInfo {
  modelId: string;
  modelName: string;
  icon: string;
  provider: string;
  safeTokensForBudget: number;
  usedTokens: number;
  usedCost: number;
  usagePercent: number;
  remainingTokens: number;
  requestCount?: number;
}

interface BudgetData {
  budget: {
    planBudgetUsd?: number;
    extraBudgetUsd?: number;
    monthlyBudgetUsd: number;
    hardLimit: boolean;
  };
  usage: {
    totalCost: number;
    totalTokens: number;
    budgetUsedPercent: number;
    remainingBudget: number;
    byModel?: Record<string, { inputTokens: number; outputTokens: number; cost: number; count: number }>;
  };
  models: ModelBudgetInfo[];
}

// Persona type for AI chat personas
interface Persona {
  id: string;
  name: string;
  description?: string;
  icon: string;
  system_prompt: string;
  prompt_token_count: number;
  is_default: boolean;
}

// RAG Knowledge Base type
interface RAG {
  id: string;
  name: string;
  rag_name?: string; // Normalized name for API endpoint
  description?: string;
  server_description?: string; // Description shown to API consumers
  icon: string;
  document_count: number;
  total_tokens: number;
  token_limit: number;
  created_at: string;
  source_type?: 'csv' | 'url';
  source_url?: string;
}

// Host URL - uses NEXT_PUBLIC_HOST env var with fallback to production URL
const HOST_URL = process.env.NEXT_PUBLIC_HOST || 'https://tulzo.vercel.app';

// Type for selected server view - null means default, string means custom server id
type SelectedServerView = 'default' | string;

// Dashboard Icon
const DashboardIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#dashGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="dashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#667eea" />
        <stop offset="100%" stopColor="#764ba2" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// Key Icon
const KeyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

interface DashboardCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, icon, children }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: 'clamp(1.25rem, 4vw, 2rem)',
    marginBottom: '1.5rem',
    position: 'relative',
    overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {icon}
      <h2 style={{ color: '#fff', fontSize: 'clamp(1.1rem, 3vw, 1.35rem)', fontWeight: 700, margin: 0 }}>{title}</h2>
    </div>
    {children}
  </div>
);

// Get time-based greeting
type GreetingType = 'morning' | 'afternoon' | 'evening' | 'night';
const getGreeting = (): { text: string; type: GreetingType } => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return { text: 'Good morning', type: 'morning' };
  } else if (hour >= 12 && hour < 17) {
    return { text: 'Good afternoon', type: 'afternoon' };
  } else if (hour >= 17 && hour < 21) {
    return { text: 'Good evening', type: 'evening' };
  } else {
    return { text: 'Good night', type: 'night' };
  }
};

// Greeting emojis - using simple, high-contrast emojis (no landscape backgrounds)
const greetingEmojis: Record<GreetingType, string> = {
  morning: '☀️',
  afternoon: '🌞',
  evening: '🌙',
  night: '⭐',
};

// Config field component for MCP settings
interface ConfigFieldProps {
  label: string;
  value: string;
  onCopy: (value: string, fieldName: string) => void;
  copiedField: string | null;
  isSecret?: boolean;
  small?: boolean;
}

const ConfigField: React.FC<ConfigFieldProps> = ({ label, value, onCopy, copiedField, isSecret, small }) => {
  const [showValue, setShowValue] = useState(false);
  const displayValue = isSecret && !showValue ? '••••••••••••••••' : value;
  const isCopied = copiedField === label;

  return (
    <div style={{ marginBottom: small ? '0.5rem' : '0.75rem' }}>
      <div style={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: small ? '0.7rem' : '0.75rem',
        marginBottom: '0.25rem'
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '6px',
        padding: small ? '0.4rem 0.6rem' : '0.5rem 0.75rem',
      }}>
        <code style={{
          flex: 1,
          color: '#a5b4fc',
          fontSize: small ? '0.7rem' : '0.8rem',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
        }}>
          {displayValue}
        </code>
        {isSecret && (
          <button
            onClick={() => setShowValue(!showValue)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: '0.25rem',
              fontSize: '0.8rem',
            }}
          >
            {showValue ? '🙈' : '👁️'}
          </button>
        )}
        <button
          onClick={() => onCopy(value, label)}
          style={{
            background: isCopied ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '4px',
            color: isCopied ? '#10b981' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          {isCopied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

// MCP connection type - uses agent:method as composite key
interface MCPConnection {
  agent: string;
  method: 'oauth' | 'header' | 'path' | 'internal';
  lastUsed: string;
  ips?: string[]; // Up to 5 IPs per agent:method
  serverName?: string; // Server name for this connection
  // Legacy fields for backwards compatibility
  ip?: string;
  authMethod?: 'oauth' | 'header' | 'path';
}

// Tab type for MCP usage
type MCPTab = 'oauth' | 'header' | 'path';

export const DashboardPage: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { has } = useAuth();
  const { preferences, updatePreferences } = usePreferences();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeySuffix, setApiKeySuffix] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting());
  const [mcpTab, setMcpTab] = useState<MCPTab>('oauth');
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [providerChanged, setProviderChanged] = useState(false);
  const [needsRegenerate, setNeedsRegenerate] = useState(false);
  const [storedPlan, setStoredPlan] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerFromApi[]>([]);
  const [selectedServerView, setSelectedServerView] = useState<SelectedServerView>('default');
  const [totalAvailableTools, setTotalAvailableTools] = useState<number>(TOTAL_TOOL_COUNT);
  const mcpConfigCardRef = useRef<HTMLDivElement>(null);

  // Budget state
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudget, setNewBudget] = useState<string>('5.00');
  const [savingBudget, setSavingBudget] = useState(false);

  // Personas state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showCreatePersona, setShowCreatePersona] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [personaForm, setPersonaForm] = useState({ name: '', description: '', icon: '🤖', systemPrompt: '' });
  const [savingPersona, setSavingPersona] = useState(false);

  // RAG Knowledge Bases state
  const [rags, setRags] = useState<RAG[]>([]);
  const [ragInfoModal, setRagInfoModal] = useState<RAG | null>(null); // Modal for showing RAG server description

  // Imports state - for the Import APIs card
  const [imports, setImports] = useState<{
    restApis: { id: string; name: string; title: string; endpointCount: number; sourceUrl?: string; authType?: string }[];
    graphql: { id: string; name: string; title: string; operationCount: number; sourceUrl?: string; authType?: string }[];
    mcpServers: { id: string; name: string; displayName: string; toolCount: number; sourceUrl: string; authType?: string }[];
    a2aAgents: { id: string; name: string; displayName: string; iconUrl?: string; agentUrl: string; authType?: string }[];
    rags: { id: string; name: string; ragName: string; sourceUrl?: string; sourceType: string; authType?: string; toolCount: number; icon?: string }[];
  }>({
    restApis: [],
    graphql: [],
    mcpServers: [],
    a2aAgents: [],
    rags: [],
  });
  const [importsLoading, setImportsLoading] = useState(true);
  const [importsFilter, setImportsFilter] = useState<'all' | 'rest' | 'graphql' | 'mcp' | 'a2a' | 'rag'>('all');

  // OAuth Connections state
  interface OAuthTokenData {
    id: string;
    isShared: boolean;
    linkedServerId?: string;
    linkedServerType?: string;
    hasRefreshToken: boolean;
    accessTokenExpiresAt: string | null;
    isExpired: boolean;
    createdAt: string;
    updatedAt: string;
  }
  interface OAuthConnectionData {
    providerHash: string;
    oauthConfig: {
      authorization_endpoint: string;
      token_endpoint: string;
      scopes: string;
      use_dcr: boolean;
      client_id: string;
      client_secret: string;
      registration_endpoint: string;
    };
    tokens: OAuthTokenData[];
    linkedImports: { type: string; id: string; name: string }[];
  }
  const [oauthConnections, setOauthConnections] = useState<OAuthConnectionData[]>([]);
  const [oauthConnectionsLoading, setOauthConnectionsLoading] = useState(true);
  const [expandedOAuthConnection, setExpandedOAuthConnection] = useState<string | null>(null);
  const [reauthenticatingConnection, setReauthenticatingConnection] = useState<string | null>(null);

  // Confirmation modals for OAuth token revocation
  const [confirmRevokeToken, setConfirmRevokeToken] = useState<{ tokenId: string; providerHash: string } | null>(null);
  const [confirmRevokeAllTokens, setConfirmRevokeAllTokens] = useState<{ providerHash: string; providerName: string } | null>(null);

  // Get default server and custom servers from the servers list
  const defaultServer = servers.find(s => s.serverName === 'default');
  const customServers = servers.filter(s => s.serverName !== 'default');

  // Scroll to MCP config card and highlight it
  const viewServerConfig = (serverId: SelectedServerView) => {
    setSelectedServerView(serverId);
    setTimeout(() => {
      mcpConfigCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mcpConfigCardRef.current?.focus();
    }, 100);
  };

  // Get the currently selected server details
  const getSelectedServer = (): ServerFromApi | null => {
    if (selectedServerView === 'default') return defaultServer || null;
    return servers.find(s => s.id === selectedServerView) || null;
  };

  // Get the server path suffix for MCP URLs
  // Default server: no suffix, Custom server: /<server_name>
  const getServerPathSuffix = (): string => {
    const selectedServer = getSelectedServer();
    if (!selectedServer || selectedServer.serverName === 'default') return '';
    // Use serverName (URL-safe) for the path
    return `/${encodeURIComponent(selectedServer.serverName)}`;
  };

  // Check if user has Plus plan using Clerk Billing's has() helper
  const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;

  // Check if user has Pro plan (or higher - Plus includes Pro features)
  const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  // Get the plan name and description for display
  const getPlanInfo = () => {
    if (isPlus) return { name: 'Plus', icon: '💎', description: 'Access to all features' };
    if (isPro) return { name: 'Pro', icon: '⭐', description: 'Access to most AI features' };
    return { name: 'Free', icon: '🆓', description: 'Basic tools only' };
  };
  const planInfo = getPlanInfo();

  // Update greeting every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch API key from Supabase
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const response = await fetch('/api/keys/list');
        if (response.ok) {
          const data = await response.json();
          if (data.hasKey) {
            if (data.apiKey) {
              setApiKey(data.apiKey);
            }
            if (data.apiKeySuffix) {
              setApiKeySuffix(data.apiKeySuffix);
            }
            if (data.plan) {
              setStoredPlan(data.plan);
            }
            // Explicitly set needsRegenerate based on API response
            setNeedsRegenerate(data.needsRegenerate === true);
          } else {
            // No key - reset states
            setNeedsRegenerate(false);
            setStoredPlan(null);
          }
          // Explicitly set providerChanged based on API response
          setProviderChanged(data.providerChanged === true);
        }
      } catch (error) {
        console.error('Failed to fetch API key:', error);
      }
    };

    if (user) {
      fetchApiKey();
    }

    // Fetch connections from Supabase
    const fetchConnections = async () => {
      try {
        const response = await fetch('/api/connections');
        if (response.ok) {
          const data = await response.json();
          if (data.connections) {
            setConnections(data.connections);
          }
        }
      } catch (error) {
        console.error('Failed to fetch connections:', error);
      }
    };

    if (user) {
      fetchConnections();
    }
  }, [user]);

  // Load servers from Supabase via API
  useEffect(() => {
    const fetchServers = async () => {
      if (!isMcpComposerEnabled() || !user) return;

      try {
        const response = await fetch('/api/servers');
        if (response.ok) {
          const data = await response.json();
          setServers(data.servers || []);
        }
      } catch (error) {
        console.error('Failed to load servers:', error);
      }
    };

    fetchServers();
  }, [user]);

  // Fetch total available tools count
  useEffect(() => {
    const fetchToolsCount = async () => {
      if (!user) return;
      try {
        const response = await fetch('/api/tools', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setTotalAvailableTools(data.totalCount || TOTAL_TOOL_COUNT);
        }
      } catch (error) {
        console.error('Failed to fetch tools count:', error);
      }
    };

    fetchToolsCount();
  }, [user]);

  // Fetch budget data
  useEffect(() => {
    const fetchBudget = async () => {
      if (!isPro || !user) return;
      try {
        const response = await fetch('/api/ai/budget');
        if (response.ok) {
          const data = await response.json();
          setBudgetData(data);
          setNewBudget(data.budget.monthlyBudgetUsd.toFixed(2));
        }
      } catch (error) {
        console.error('Failed to fetch budget:', error);
      }
    };
    fetchBudget();
  }, [isPro, user]);

  // Save extra budget (adds to plan budget)
  const saveBudget = async () => {
    const extraValue = parseFloat(newBudget);
    if (isNaN(extraValue) || extraValue < 0 || extraValue > 100) {
      return;
    }
    setSavingBudget(true);
    try {
      const response = await fetch('/api/ai/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraBudgetUsd: extraValue }),
      });
      if (response.ok) {
        // Refetch budget data to get updated totals
        const budgetResponse = await fetch('/api/ai/budget');
        if (budgetResponse.ok) {
          const budgetData = await budgetResponse.json();
          setBudgetData(budgetData);
        }
        setEditingBudget(false);
        setNewBudget('1.00');
      }
    } catch (error) {
      console.error('Failed to save budget:', error);
    } finally {
      setSavingBudget(false);
    }
  };

  // Fetch personas (available for all tiers)
  useEffect(() => {
    const fetchPersonas = async () => {
      if (!user) return;
      try {
        const response = await fetch('/api/ai/personalities');
        if (response.ok) {
          const data = await response.json();
          setPersonas(data.personalities || []);
        }
      } catch (error) {
        console.error('Failed to fetch personas:', error);
      }
    };
    fetchPersonas();
  }, [user]);

  // Fetch RAG knowledge bases (available for all tiers)
  useEffect(() => {
    const fetchRags = async () => {
      if (!user) return;
      try {
        const response = await fetch('/api/ai/rags');
        if (response.ok) {
          const data = await response.json();
          setRags(data.rags || []);
        }
      } catch (error) {
        console.error('Failed to fetch RAGs:', error);
      }
    };
    fetchRags();
  }, [user]);

  // Fetch imports (REST APIs, GraphQL, MCP servers, A2A agents, RAGs) - available for all tiers
  useEffect(() => {
    const fetchImports = async () => {
      if (!user) {
        setImportsLoading(false);
        return;
      }
      setImportsLoading(true);
      try {
        // For free tier, only fetch A2A agents; for Pro/Plus, fetch all including RAGs
        const fetchPromises: Promise<Response>[] = [fetch('/api/agents/list')];
        if (isPro) {
          fetchPromises.unshift(
            fetch('/api/swagger/list'),
            fetch('/api/graphql/list'),
            fetch('/api/mcp-servers/list'),
            fetch('/api/ai/rags')
          );
        }
        const responses = await Promise.all(fetchPromises);

        // Parse responses based on tier
        if (isPro) {
          const [restRes, graphqlRes, mcpRes, ragsRes, agentsRes] = responses;

          if (restRes.ok) {
            const data = await restRes.json();
            setImports(prev => ({
              ...prev,
              restApis: (data.specs || []).map((s: { id: string; server_name: string; api_title: string; endpoints?: unknown[]; source_url?: string; auth_type?: string }) => ({
                id: s.id,
                name: s.server_name,
                title: s.api_title,
                endpointCount: s.endpoints?.length || 0,
                sourceUrl: s.source_url,
                authType: s.auth_type,
              })),
            }));
          }

          if (graphqlRes.ok) {
            const data = await graphqlRes.json();
            setImports(prev => ({
              ...prev,
              graphql: (data.specs || []).map((s: { id: string; server_name: string; api_title: string; operations?: unknown[]; source_url?: string; auth_type?: string }) => ({
                id: s.id,
                name: s.server_name,
                title: s.api_title,
                operationCount: s.operations?.length || 0,
                sourceUrl: s.source_url,
                authType: s.auth_type,
              })),
            }));
          }

          if (mcpRes.ok) {
            const data = await mcpRes.json();
            // Filter to only show imported MCP servers (not native/api_key servers)
            const importedServers = (data.servers || []).filter((s: { source_type: string }) => s.source_type === 'mcp_import');
            setImports(prev => ({
              ...prev,
              mcpServers: importedServers.map((s: { id: string; server_name: string; display_name: string; toolCount: number; source_url: string; auth_type?: string }) => ({
                id: s.id,
                name: s.server_name,
                displayName: s.display_name,
                toolCount: s.toolCount,
                sourceUrl: s.source_url,
                authType: s.auth_type,
              })),
            }));
          }

          if (ragsRes.ok) {
            const data = await ragsRes.json();
            setImports(prev => ({
              ...prev,
              rags: (data.rags || []).map((r: { id: string; name: string; rag_name?: string; source_url?: string; source_type: string; auth_type?: string; icon?: string }) => ({
                id: r.id,
                name: r.name,
                ragName: r.rag_name || r.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
                sourceUrl: r.source_url,
                sourceType: r.source_type,
                authType: r.auth_type,
                toolCount: 1, // Each RAG generates 1 tool
                icon: r.icon,
              })),
            }));
          }

          if (agentsRes.ok) {
            const data = await agentsRes.json();
            setImports(prev => ({
              ...prev,
              a2aAgents: (data.agents || []).map((a: { id: string; agent_name: string; display_name: string; icon_url?: string; agent_url: string; auth_type?: string }) => ({
                id: a.id,
                name: a.agent_name,
                displayName: a.display_name,
                iconUrl: a.icon_url,
                agentUrl: a.agent_url,
                authType: a.auth_type,
              })),
            }));
          }
        } else {
          // Free tier: only fetch A2A agents
          const [agentsRes] = responses;
          if (agentsRes.ok) {
            const data = await agentsRes.json();
            setImports(prev => ({
              ...prev,
              a2aAgents: (data.agents || []).map((a: { id: string; agent_name: string; display_name: string; icon_url?: string; agent_url: string; auth_type?: string }) => ({
                id: a.id,
                name: a.agent_name,
                displayName: a.display_name,
                iconUrl: a.icon_url,
                agentUrl: a.agent_url,
                authType: a.auth_type,
              })),
            }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch imports:', error);
      } finally {
        setImportsLoading(false);
      }
    };
    fetchImports();
  }, [isPro, user]);

  // Fetch OAuth connections (available for all tiers)
  useEffect(() => {
    const fetchOAuthConnections = async () => {
      if (!user) {
        setOauthConnectionsLoading(false);
        return;
      }
      setOauthConnectionsLoading(true);
      try {
        const response = await fetch('/api/oauth/connections');
        if (response.ok) {
          const data = await response.json();
          setOauthConnections(data.connections || []);
        }
      } catch (error) {
        console.error('Failed to fetch OAuth connections:', error);
      } finally {
        setOauthConnectionsLoading(false);
      }
    };
    fetchOAuthConnections();
  }, [user]);

  // Revoke single OAuth token
  const revokeOAuthToken = async (tokenId: string, providerHash: string) => {
    try {
      const response = await fetch(`/api/oauth/connections?id=${tokenId}`, { method: 'DELETE' });
      if (response.ok) {
        setOauthConnections(prev => prev.map(c => {
          if (c.providerHash !== providerHash) return c;
          const newTokens = c.tokens.filter(t => t.id !== tokenId);
          return { ...c, tokens: newTokens };
        }).filter(c => c.tokens.length > 0));
      }
    } catch (error) {
      console.error('Failed to revoke OAuth token:', error);
    }
    setConfirmRevokeToken(null);
  };

  // Revoke all OAuth tokens for a connection
  const revokeAllOAuthTokens = async (providerHash: string) => {
    try {
      const response = await fetch(`/api/oauth/connections?providerHash=${encodeURIComponent(providerHash)}&deleteAll=true`, { method: 'DELETE' });
      if (response.ok) {
        setOauthConnections(prev => prev.filter(c => c.providerHash !== providerHash));
      }
    } catch (error) {
      console.error('Failed to revoke OAuth tokens:', error);
    }
    setConfirmRevokeAllTokens(null);
  };

  // Re-authenticate OAuth connection
  const reauthenticateOAuthConnection = async (conn: OAuthConnectionData) => {
    if (!conn.oauthConfig.authorization_endpoint) {
      alert('No authorization endpoint configured for this connection.');
      return;
    }

    setReauthenticatingConnection(conn.providerHash);

    // Build OAuth authorization URL
    const authUrl = new URL(conn.oauthConfig.authorization_endpoint);
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(JSON.stringify({ providerHash: conn.providerHash, returnUrl: window.location.href }));

    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', conn.oauthConfig.client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    if (conn.oauthConfig.scopes) {
      authUrl.searchParams.set('scope', conn.oauthConfig.scopes);
    }

    // Open OAuth popup
    const popup = window.open(authUrl.toString(), 'oauth', 'width=600,height=700,popup=1');

    // Listen for popup close
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        setReauthenticatingConnection(null);
        // Refresh connections
        fetch('/api/oauth/connections')
          .then(res => res.json())
          .then(data => setOauthConnections(data.connections || []))
          .catch(console.error);
      }
    }, 500);
  };

  // Delete RAG
  const deleteRag = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge base? All documents will be permanently deleted.')) return;
    try {
      const response = await fetch(`/api/ai/rags?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        setRags(prev => prev.filter(r => r.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete RAG:', error);
    }
  };

  // Create or update persona
  const savePersona = async () => {
    if (!personaForm.name || !personaForm.systemPrompt) return;
    setSavingPersona(true);
    try {
      const isEditing = !!editingPersona;
      const response = await fetch('/api/ai/personalities', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEditing ? { id: editingPersona.id } : {}),
          name: personaForm.name,
          description: personaForm.description,
          icon: personaForm.icon,
          systemPrompt: personaForm.systemPrompt,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (isEditing) {
          setPersonas(prev => prev.map(p => p.id === editingPersona.id ? data.personality : p));
        } else {
          setPersonas(prev => [...prev, data.personality]);
        }
        setShowCreatePersona(false);
        setEditingPersona(null);
        setPersonaForm({ name: '', description: '', icon: '🤖', systemPrompt: '' });
      }
    } catch (error) {
      console.error('Failed to save persona:', error);
    } finally {
      setSavingPersona(false);
    }
  };

  // Delete persona
  const deletePersona = async (id: string) => {
    try {
      const response = await fetch(`/api/ai/personalities?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        setPersonas(prev => prev.filter(p => p.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete persona:', error);
    }
  };

  // Open edit modal for persona
  const openEditPersona = (persona: Persona) => {
    setEditingPersona(persona);
    setPersonaForm({
      name: persona.name,
      description: persona.description || '',
      icon: persona.icon,
      systemPrompt: persona.system_prompt,
    });
    setShowCreatePersona(true);
  };

  // Delete a custom MCP server
  const deleteCustomServer = async (serverId: string) => {
    try {
      const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setServers(prev => prev.filter(s => s.id !== serverId));
        // Reset to default view if we deleted the selected server
        if (selectedServerView === serverId) {
          setSelectedServerView('default');
        }
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  const copyField = async (value: string, fieldName: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generateApiKey = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      // Call server-side API to generate key and store in Supabase
      const response = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to generate API key');
      }

      const data = await response.json();
      setApiKey(data.apiKey);
      setApiKeySuffix(data.apiKey?.slice(-4) || null);
      setStoredPlan(data.plan);
      setShowApiKey(true);
      // Reset warning states after successful generation
      setNeedsRegenerate(false);
      setProviderChanged(false);
    } catch (error) {
      console.error('Failed to generate API key:', error);
    }
    setGenerating(false);
  };

  const copyToClipboard = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMcpUrl = async () => {
    if (!apiKey) return;
    const mcpUrl = `${HOST_URL}/api/mcp/${apiKey}${getServerPathSuffix()}`;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isLoaded) {
    return (
      <View UNSAFE_style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: '#fff', fontSize: '1.25rem' }}>Loading...</div>
      </View>
    );
  }

  return (
    <View UNSAFE_style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <main style={{ paddingTop: '2rem', paddingBottom: '3rem', maxWidth: '56rem', margin: '0 auto', padding: '2rem 1rem 3rem' }}>
        {/* Welcome Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <DashboardIcon />
          <h1 style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0.75rem 0 0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>
              {greetingEmojis[greeting.type]}
            </span>
            {greeting.text}{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem', margin: 0 }}>
            {user?.primaryEmailAddress?.emailAddress}
          </p>
        </div>

        {/* Upgrade Banner - Only for Free users when billing is enabled */}
        {!isPro && isBillingEnabled() && (
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            borderRadius: '16px',
            padding: '1.5rem 2rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
          }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
                ⭐ Unlock Pro Features
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', margin: 0 }}>
                Get API access, MCP server, and all premium tools
              </p>
            </div>
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <button style={{
                background: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '0.85rem 2rem',
                color: '#667eea',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                transition: 'transform 0.2s ease',
              }}>
                Get Pro Now
              </button>
            </Link>
          </div>
        )}

        {/* Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.dashboardTop} style={{ marginBottom: '2rem' }} />

        {/* Current Plan Card */}
        <DashboardCard title="Your Plan" icon={
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: isPro ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
          }}>
            {planInfo.icon}
          </div>
        }>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{
                display: 'inline-block',
                padding: '0.35rem 1rem',
                borderRadius: '20px',
                background: isPlus
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : isPro
                    ? 'linear-gradient(135deg, #667eea, #764ba2)'
                    : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
              }}>
                {planInfo.name}
              </span>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>
                {planInfo.description}
              </p>
            </div>
            {(isPro || isPlus) && isBillingEnabled() ? (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}>
                  Manage Subscription
                </button>
              </Link>
            ) : !isPro && !isPlus && isBillingEnabled() ? (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: '#fff',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}>
                  Upgrade to Pro
                </button>
              </Link>
            ) : null}
          </div>
        </DashboardCard>

        {/* AI Budget Card - Right under subscription */}
        <DashboardCard
          title="AI Budget"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
        >
          {/* Pro-only blur overlay */}
          {!isPro && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '1rem' }}>
              <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💰</span>
              <span style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>Pro Feature</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '0.75rem' }}>Upgrade to Pro to access AI Chat with budget tracking</span>
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>Upgrade to Pro</button>
              </Link>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            {/* Budget Usage Bar */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Monthly Usage</span>
                <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
                  {formatCurrency(budgetData?.usage.totalCost || 0)} / {formatCurrency(budgetData?.budget.monthlyBudgetUsd || DEFAULT_MONTHLY_BUDGET)}
                </span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', height: '12px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(budgetData?.usage.budgetUsedPercent || 0, 100)}%`,
                  height: '100%',
                  borderRadius: '10px',
                  background: (budgetData?.usage.budgetUsedPercent || 0) > 90 ? 'linear-gradient(90deg, #ef4444, #dc2626)' : (budgetData?.usage.budgetUsedPercent || 0) > 70 ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #10b981, #059669)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                  {formatTokenCount(budgetData?.usage.totalTokens || 0)} tokens used
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                  {formatCurrency(budgetData?.usage.remainingBudget || budgetData?.budget.monthlyBudgetUsd || DEFAULT_MONTHLY_BUDGET)} remaining
                </span>
              </div>
            </div>

            {/* Spending Summary */}
            <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>💵 Total Spent This Month</span>
                <span style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>{formatCurrency(budgetData?.usage.totalCost || 0)}</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>↑ Input:</span>
                  <span style={{ color: '#fff', fontSize: '0.75rem' }}>{formatTokenCount(budgetData?.models?.reduce((sum, m) => sum + (m.usedTokens > 0 ? (budgetData.usage.byModel?.[m.modelId]?.inputTokens || 0) : 0), 0) || 0)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>↓ Output:</span>
                  <span style={{ color: '#fff', fontSize: '0.75rem' }}>{formatTokenCount(budgetData?.models?.reduce((sum, m) => sum + (m.usedTokens > 0 ? (budgetData.usage.byModel?.[m.modelId]?.outputTokens || 0) : 0), 0) || 0)}</span>
                </div>
              </div>
            </div>

            {/* Model Usage Breakdown */}
            {budgetData?.models && budgetData.models.filter(m => m.usedTokens > 0).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>📊 Spending by Model</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {budgetData.models.filter(m => m.usedTokens > 0).sort((a, b) => b.usedCost - a.usedCost).map(model => {
                    const modelUsage = budgetData.usage.byModel?.[model.modelId];
                    const costPercent = budgetData.usage.totalCost > 0 ? (model.usedCost / budgetData.usage.totalCost) * 100 : 0;
                    return (
                      <div key={model.modelId} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1rem' }}>{model.icon}</span>
                            <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>{model.modelName}</span>
                          </div>
                          <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(model.usedCost)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                          <span>↑{formatTokenCount(modelUsage?.inputTokens || 0)}</span>
                          <span>↓{formatTokenCount(modelUsage?.outputTokens || 0)}</span>
                          <span>{model.requestCount || modelUsage?.count || 0} requests</span>
                          <div style={{ flex: 1 }} />
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{costPercent.toFixed(1)}% of total</span>
                        </div>
                        {/* Mini progress bar */}
                        <div style={{ marginTop: '0.35rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${costPercent}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '4px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Budget Info - Plan Based */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>Monthly AI Budget</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                    Included with {isPlus ? 'Plus' : 'Pro'} plan: {formatCurrency(TOKEN_QUOTAS[isPlus ? 'plus' : 'pro'].aiCostBudget)}/month
                    {(budgetData?.budget.extraBudgetUsd || 0) > 0 && (
                      <span style={{ color: '#10b981' }}> + {formatCurrency(budgetData?.budget.extraBudgetUsd || 0)} extra</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: '1rem' }}>
                    {formatCurrency(budgetData?.budget.monthlyBudgetUsd || TOKEN_QUOTAS[isPlus ? 'plus' : 'pro'].aiCostBudget)}
                  </span>
                  {editingBudget ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>+$</span>
                      <input
                        type="number"
                        value={newBudget}
                        onChange={(e) => setNewBudget(e.target.value)}
                        min="0"
                        max="100"
                        step="0.50"
                        placeholder="0.00"
                        style={{ width: '60px', padding: '0.35rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem', textAlign: 'right' }}
                      />
                      <button onClick={saveBudget} disabled={savingBudget} style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>
                        {savingBudget ? '...' : '✓'}
                      </button>
                      <button onClick={() => setEditingBudget(false)} style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNewBudget('1.00'); setEditingBudget(true); }}
                      style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px dashed rgba(16, 185, 129, 0.4)', background: 'transparent', color: '#10b981', cursor: 'pointer', fontSize: '0.75rem' }}
                      title="Add extra budget for this month"
                    >
                      + Add Extra
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
              <Link href="/chat" style={{ textDecoration: 'none' }}>
                <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                  💬 Open AI Chat
                </button>
              </Link>
            </div>
          </div>
        </DashboardCard>

        {/* Budget History Card - Pro+ only */}
        <DashboardCard
          title="Budget History"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>}
        >
          {/* Pro-only blur overlay */}
          {!isPro && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '1rem' }}>
              <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</span>
              <span style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>Pro Feature</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textAlign: 'center' }}>View your historical AI usage month by month</span>
              {isBillingEnabled() && (
                <Link href="/pricing" style={{ marginTop: '0.75rem', textDecoration: 'none' }}>
                  <button style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                    Upgrade to Pro
                  </button>
                </Link>
              )}
            </div>
          )}
          <div style={{ position: 'relative', minHeight: '200px' }}>
            {isPro ? (
              <BudgetHistoryViewer />
            ) : (
              <div style={{ filter: 'blur(4px)', pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {['Jan', 'Feb', 'Mar'].map(m => (
                      <div key={m} style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{m}</div>
                    ))}
                  </div>
                  <div style={{ height: '80px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }} />
                </div>
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Preferences Card */}
        <DashboardCard
          title="Preferences"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
        >
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Set your default preferences for time, measurements, and currency.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Time Format */}
            <div>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>🕐 Time Format</label>
              <select
                value={preferences.timeFormat}
                onChange={(e) => updatePreferences({ timeFormat: e.target.value as TimeFormat })}
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
              >
                {Object.entries(TIME_FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value} style={{ background: '#1e293b' }}>{label}</option>
                ))}
              </select>
            </div>
            {/* Measurement System */}
            <div>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>📏 Measurements</label>
              <select
                value={preferences.measurementSystem}
                onChange={(e) => updatePreferences({ measurementSystem: e.target.value as MeasurementSystem })}
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
              >
                {Object.entries(MEASUREMENT_SYSTEM_LABELS).map(([value, label]) => (
                  <option key={value} value={value} style={{ background: '#1e293b' }}>{label}</option>
                ))}
              </select>
            </div>
            {/* Currency */}
            <div>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>💰 Currency</label>
              <select
                value={preferences.currency}
                onChange={(e) => updatePreferences({ currency: e.target.value as Currency })}
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
              >
                {Object.entries(CURRENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value} style={{ background: '#1e293b' }}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '1rem', textAlign: 'center' }}>
            These preferences are saved automatically and used across all tools.
          </p>
        </DashboardCard>

        {/* API Keys Card */}
        <DashboardCard title="API Keys" icon={<KeyIcon />}>
          {isPro ? (
            <div>
              {/* Provider change warning */}
              {providerChanged && (
                <div style={{
                  background: 'rgba(251, 191, 36, 0.15)',
                  border: '1px solid rgba(251, 191, 36, 0.5)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                }}>
                  <p style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
                    ⚠️ API Key Provider Changed
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: 0 }}>
                    The API key system has been updated. Please generate a new key to continue using MCP services.
                  </p>
                </div>
              )}

              {/* Plan change warning - needs regeneration */}
              {needsRegenerate && !providerChanged && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                }}>
                  <p style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
                    🔄 Plan Changed - Key Regeneration Required
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: 0 }}>
                    Your plan has changed from <strong>{storedPlan}</strong> to <strong>{planInfo.name.toLowerCase()}</strong>.
                    Please regenerate your API key to access your new plan features.
                  </p>
                </div>
              )}

              {apiKey && !providerChanged && !needsRegenerate ? (
                <div>
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '10px',
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: 'clamp(0.75rem, 2.5vw, 0.9rem)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ wordBreak: 'break-all' }}>
                      {showApiKey ? apiKey : '•'.repeat(32)}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.4rem 0.75rem',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {showApiKey ? '👁️ Hide' : '👁️ Show'}
                      </button>
                      <button
                        onClick={copyToClipboard}
                        style={{
                          background: copied ? '#10b981' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.4rem 0.75rem',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {copied ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={generateApiKey}
                    disabled={generating}
                    style={{
                      marginTop: '1.25rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      borderRadius: '8px',
                      padding: '0.6rem 1.25rem',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                    }}
                  >
                    {generating ? 'Regenerating...' : '🔄 Regenerate Key'}
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                    Generate an API key to use Tulzo tools in your AI assistants.
                  </p>
                  <button
                    onClick={generateApiKey}
                    disabled={generating}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.75rem 2rem',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
                  >
                    {generating ? 'Generating...' : '🔑 Generate API Key'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Pro-only overlay for API Keys */
            <>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '1rem' }}>
                <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔑</span>
                <span style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>Pro Feature</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '0.75rem' }}>Upgrade to Pro to generate API keys for MCP server access</span>
                <Link href="/pricing" style={{ textDecoration: 'none' }}>
                  <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>Upgrade to Pro</button>
                </Link>
              </div>
              <div style={{ filter: 'blur(4px)', opacity: 0.3, pointerEvents: 'none' }}>
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '10px',
                  padding: '1rem',
                  fontFamily: 'monospace',
                  color: '#10b981',
                  marginBottom: '1rem',
                }}>
                  tlz_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
                </div>
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                }}>
                  <code style={{ color: '#60a5fa', fontSize: '0.85rem' }}>
                    {HOST_URL}/api/mcp/...
                  </code>
                </div>
              </div>
            </>
          )}
        </DashboardCard>

        {/* Locked Sections for Free Users */}
        {!isPro && isBillingEnabled() && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            <LockedSection
              title="MCP Server Config"
              description="Upgrade to Pro to configure MCP server for Claude, Cursor, and Windsurf"
              emoji="⚙️"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              }
            />
            <LockedSection
              title="MCP Servers"
              description="Upgrade to Pro to create custom MCP servers with focused tool sets"
              emoji="🔧"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              }
            />
            <LockedSection
              title="Agent Creator"
              description="Upgrade to Pro to create AI agents with A2A protocol"
              emoji="🤖"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="4" cy="12" r="2" />
                  <circle cx="20" cy="12" r="2" />
                  <circle cx="12" cy="4" r="2" />
                  <circle cx="12" cy="20" r="2" />
                  <path d="M6 12h3M15 12h3M12 6v3M12 15v3" />
                </svg>
              }
            />
          </div>
        )}

        {/* MCP Server Config Card with Tabs - Pro only */}
        {isPro && (
        <div ref={mcpConfigCardRef} tabIndex={-1} style={{ outline: 'none' }}>
        <DashboardCard title="MCP Server Config" icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        }>
          {isPro && apiKey ? (
            <div>
              {/* Selected Server Indicator */}
              {(() => {
                const selectedServer = getSelectedServer();
                const serverName = selectedServer ? selectedServer.name : 'Default Server';
                const isCustom = selectedServer && selectedServer.serverName !== 'default';
                // Calculate tool count from enabled tools
                const enabledTools = selectedServer?.tools.filter(t => t.isEnabled) || [];
                const toolCount = enabledTools.length || totalAvailableTools;
                const hasDisabledTools = selectedServer && selectedServer.tools.some(t => !t.isEnabled);
                return (
                  <div style={{
                    background: isCustom ? 'rgba(167, 139, 250, 0.1)' : 'rgba(102, 126, 234, 0.1)',
                    border: `1px solid ${isCustom ? 'rgba(167, 139, 250, 0.3)' : 'rgba(102, 126, 234, 0.3)'}`,
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{isCustom ? '🔧' : '📦'}</span>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                          {serverName}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                          {isCustom
                            ? `${toolCount} tools selected`
                            : hasDisabledTools
                              ? `${toolCount} of ${totalAvailableTools} tools enabled`
                              : `All tools (${totalAvailableTools})`}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Link
                        href={isCustom ? `/dashboard/server/${selectedServer.id}` : '/docs/tools'}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.7)',
                          textDecoration: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View Docs
                      </Link>
                      <Link
                        href={isCustom && selectedServer ? `/dashboard/mcp-composer?edit=${selectedServer.id}` : '/dashboard/mcp-composer?edit=default'}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(167, 139, 250, 0.2)',
                          color: '#a78bfa',
                          textDecoration: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </Link>
                    </div>
                  </div>
                );
              })()}

              {/* Status */}
              <div style={{
                background: needsRegenerate ? 'rgba(251, 191, 36, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                border: needsRegenerate ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <span style={{ color: needsRegenerate ? '#fbbf24' : '#10b981', fontSize: '1rem' }}>●</span>
                <span style={{ color: needsRegenerate ? '#fbbf24' : '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
                  {needsRegenerate ? 'API Key Regeneration Required' : 'Server Active'}
                </span>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {(['oauth', 'header', 'path'] as MCPTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setMcpTab(tab)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: mcpTab === tab ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'oauth' ? '🔐 OAuth' : tab === 'header' ? '🔑 Header' : '🔗 URL Path'}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '12px',
                padding: '1rem',
              }}>
                {mcpTab === 'oauth' && (
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                      For ChatGPT, Claude.ai, n8n, and clients with OAuth support.
                    </p>
                    <ConfigField label="MCP Server URL" value={`${HOST_URL}/api/mcp${getServerPathSuffix()}`} onCopy={copyField} copiedField={copiedField} />

                    <div style={{ background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', padding: '0.75rem', marginTop: '1rem' }}>
                      <p style={{ color: '#667eea', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem' }}>✨ OAuth Auto-Discovery</p>
                      <ConfigField label="Discovery URL" value={`${HOST_URL}/.well-known/openid-configuration`} onCopy={copyField} copiedField={copiedField} small />
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', marginTop: '1rem' }}>
                      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.75rem' }}>🔑 Your OAuth Credentials</p>
                      <ConfigField label="Client ID" value={user?.id || ''} onCopy={copyField} copiedField={copiedField} small />
                      <ConfigField label="Client Secret" value={apiKey} onCopy={copyField} copiedField={copiedField} small isSecret />
                    </div>

                    <details style={{ marginTop: '1rem' }}>
                      <summary style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', cursor: 'pointer' }}>
                        📋 Manual Configuration
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        <ConfigField label="Authorization URL" value={`${HOST_URL}/api/oauth/authorize`} onCopy={copyField} copiedField={copiedField} small />
                        <ConfigField label="Token URL" value={`${HOST_URL}/api/oauth/token`} onCopy={copyField} copiedField={copiedField} small />
                        <ConfigField label="UserInfo URL" value={`${HOST_URL}/api/oauth/userinfo`} onCopy={copyField} copiedField={copiedField} small />
                        <ConfigField label="Scopes" value="openid profile email" onCopy={copyField} copiedField={copiedField} small />
                        <ConfigField label="Grant Types" value="authorization_code, refresh_token" onCopy={copyField} copiedField={copiedField} small />
                        <ConfigField label="PKCE" value="S256 (recommended)" onCopy={copyField} copiedField={copiedField} small />
                      </div>
                    </details>
                  </div>
                )}

                {mcpTab === 'header' && (
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                      For clients that support custom headers but not OAuth.
                    </p>
                    <ConfigField label="MCP Server URL" value={`${HOST_URL}/api/mcp${getServerPathSuffix()}`} onCopy={copyField} copiedField={copiedField} />
                    <ConfigField label="Header Name" value="x-api-key" onCopy={copyField} copiedField={copiedField} />
                    <ConfigField label="Header Value" value={apiKey} onCopy={copyField} copiedField={copiedField} isSecret />
                    <div style={{ background: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', padding: '0.75rem', marginTop: '1rem' }}>
                      <p style={{ color: '#fbbf24', fontSize: '0.8rem', margin: 0 }}>
                        💡 Alternative: Use <code style={{ color: '#fcd34d' }}>Authorization: Bearer {'{api_key}'}</code>
                      </p>
                    </div>
                  </div>
                )}

                {mcpTab === 'path' && (
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                      For Claude Desktop, Cursor, and clients without auth support.
                    </p>
                    <ConfigField
                      label="MCP Server URL (with API key)"
                      value={`${HOST_URL}/api/mcp/${apiKey}${getServerPathSuffix()}`}
                      onCopy={copyField}
                      copiedField={copiedField}
                      isSecret
                    />
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', padding: '0.75rem', marginTop: '1rem' }}>
                      <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>
                        ⚠️ This URL contains your API key. Keep it private!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : isPro ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem' }}>
                Generate an API key above to see MCP configuration options.
              </p>
            </div>
          ) : (
            <div style={{
              filter: 'blur(6px)',
              opacity: 0.4,
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.95rem', margin: '0 0 1rem' }}>
                Use Tulzo tools directly in ChatGPT, Claude, Cursor, and other AI assistants.
              </p>
              <div style={{
                background: needsRegenerate ? 'rgba(251, 191, 36, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                border: needsRegenerate ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: needsRegenerate ? '#fbbf24' : '#10b981', fontSize: '1.25rem' }}>●</span>
                  <span style={{ color: needsRegenerate ? '#fbbf24' : '#10b981', fontWeight: 600 }}>
                    {needsRegenerate ? 'API Key Regeneration Required' : 'Server Active'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DashboardCard>
        </div>
        )}

        {/* MCP Servers Card */}
        {isPro && apiKey && isMcpComposerEnabled() && (
          <DashboardCard title="MCP Servers" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          }>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Your default server and custom focused MCP servers.
            </p>

            {/* Servers List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {/* Default Server - All Tools */}
              <div style={{
                background: selectedServerView === 'default'
                  ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.25), rgba(118, 75, 162, 0.25))'
                  : 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))',
                border: selectedServerView === 'default'
                  ? '2px solid rgba(102, 126, 234, 0.5)'
                  : '1px solid rgba(102, 126, 234, 0.3)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
                      Default Server
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      background: 'rgba(102, 126, 234, 0.3)',
                      color: '#667eea',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}>DEFAULT</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {(() => {
                      const disabledCount = defaultServer?.tools.filter(t => !t.isEnabled).length || 0;
                      return disabledCount > 0
                        ? `${disabledCount} tools disabled`
                        : 'All available tools included';
                    })()}
                  </div>
                </div>
                {(() => {
                  const enabledCount = defaultServer?.tools.filter(t => t.isEnabled).length || totalAvailableTools;
                  const severity = getToolCountSeverity(enabledCount);
                  const color = getToolCountColor(severity);
                  return (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      background: `${color}22`,
                      color: color,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      {enabledCount} tools
                      {severity !== 'optimal' && <ToolCountWarning count={enabledCount} />}
                    </span>
                  );
                })()}
                <button
                  onClick={() => viewServerConfig('default')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    background: selectedServerView === 'default' ? 'rgba(102, 126, 234, 0.3)' : 'rgba(255,255,255,0.1)',
                    color: selectedServerView === 'default' ? '#667eea' : 'rgba(255,255,255,0.7)',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Config
                </button>
                <Link
                  href="/docs/tools"
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  Docs
                </Link>
              </div>

              {/* Custom Servers */}
              {customServers.map(server => {
                const enabledToolCount = server.tools.filter(t => t.isEnabled).length;
                const severity = getToolCountSeverity(enabledToolCount);
                const color = getToolCountColor(severity);
                const isSelected = selectedServerView === server.id;
                return (
                  <div key={server.id} style={{
                    background: isSelected ? 'rgba(167, 139, 250, 0.15)' : 'rgba(0,0,0,0.2)',
                    border: isSelected ? '2px solid rgba(167, 139, 250, 0.5)' : '1px solid transparent',
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
                            {server.name}
                          </span>
                          <ToolCountWarning count={enabledToolCount} />
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          Created {new Date(server.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        background: `${color}22`,
                        color: color,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        {enabledToolCount} tools
                      </span>
                      <button
                        onClick={() => viewServerConfig(server.id)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          background: isSelected ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255,255,255,0.1)',
                          color: isSelected ? '#a78bfa' : 'rgba(255,255,255,0.7)',
                          border: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        Config
                      </button>
                      <Link
                        href={`/dashboard/server/${server.id}`}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.7)',
                          textDecoration: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        Docs
                      </Link>
                      <button
                        onClick={() => deleteCustomServer(server.id)}
                        style={{
                          padding: '0.35rem 0.5rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                        title="Delete server"
                      >
                        ✕
                      </button>
                    </div>
                    {/* Publish to Marketplace button */}
                    <button
                      onClick={() => {/* Coming soon */}}
                      style={{
                        marginTop: '0.75rem',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px dashed rgba(251, 191, 36, 0.4)',
                        background: 'rgba(251, 191, 36, 0.1)',
                        color: '#fbbf24',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      Publish to Marketplace
                      <span style={{
                        fontSize: '0.6rem',
                        background: 'rgba(251, 191, 36, 0.3)',
                        padding: '0.1rem 0.3rem',
                        borderRadius: '4px',
                      }}>Soon</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Create New Button */}
            <Link
              href="/dashboard/mcp-composer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '2px dashed rgba(167, 139, 250, 0.4)',
                background: 'rgba(167, 139, 250, 0.1)',
                color: '#a78bfa',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Custom MCP Server
            </Link>
          </DashboardCard>
        )}

        {/* Imports Card - Available for all tiers (with restrictions for free) */}
        {isMcpComposerEnabled() && (
          <DashboardCard title="Imports" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          }>
            {/* Loading indicator */}
            {importsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                Loading imports...
              </div>
            )}
            {/* Summary counts - clickable filter pills */}
            {!importsLoading && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {/* All filter */}
                <button
                  onClick={() => setImportsFilter('all')}
                  style={{
                    background: importsFilter === 'all' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: importsFilter === 'all' ? '#fff' : 'rgba(255,255,255,0.6)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: importsFilter === 'all' ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  All
                </button>
                {imports.restApis.length > 0 && (
                  <button
                    onClick={() => setImportsFilter(importsFilter === 'rest' ? 'all' : 'rest')}
                    style={{
                      background: importsFilter === 'rest' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: importsFilter === 'rest' ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ☁️ {imports.restApis.length} REST API{imports.restApis.length !== 1 ? 's' : ''}
                  </button>
                )}
                {imports.graphql.length > 0 && (
                  <button
                    onClick={() => setImportsFilter(importsFilter === 'graphql' ? 'all' : 'graphql')}
                    style={{
                      background: importsFilter === 'graphql' ? 'rgba(102, 126, 234, 0.4)' : 'rgba(102, 126, 234, 0.2)',
                      color: '#667eea',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: importsFilter === 'graphql' ? '1px solid rgba(102, 126, 234, 0.5)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ◈ {imports.graphql.length} GraphQL
                  </button>
                )}
                {imports.mcpServers.length > 0 && (
                  <button
                    onClick={() => setImportsFilter(importsFilter === 'mcp' ? 'all' : 'mcp')}
                    style={{
                      background: importsFilter === 'mcp' ? 'rgba(251, 146, 60, 0.4)' : 'rgba(251, 146, 60, 0.2)',
                      color: '#fb923c',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: importsFilter === 'mcp' ? '1px solid rgba(251, 146, 60, 0.5)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    🔌 {imports.mcpServers.length} MCP Server{imports.mcpServers.length !== 1 ? 's' : ''}
                  </button>
                )}
                {imports.a2aAgents.length > 0 && (
                  <button
                    onClick={() => setImportsFilter(importsFilter === 'a2a' ? 'all' : 'a2a')}
                    style={{
                      background: importsFilter === 'a2a' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.2)',
                      color: '#f59e0b',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: importsFilter === 'a2a' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    🤖 {imports.a2aAgents.length} A2A Agent{imports.a2aAgents.length !== 1 ? 's' : ''}
                  </button>
                )}
                {imports.rags.length > 0 && (
                  <button
                    onClick={() => setImportsFilter(importsFilter === 'rag' ? 'all' : 'rag')}
                    style={{
                      background: importsFilter === 'rag' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.2)',
                      color: '#8b5cf6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: importsFilter === 'rag' ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    📚 {imports.rags.length} RAG{imports.rags.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )}

            {/* Imported items list */}
            {!importsLoading && (imports.restApis.length > 0 || imports.graphql.length > 0 || imports.mcpServers.length > 0 || imports.a2aAgents.length > 0 || imports.rags.length > 0) && (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                {/* REST APIs */}
                {(importsFilter === 'all' || importsFilter === 'rest') && imports.restApis.map(api => (
                  <Link key={api.id} href={`/dashboard/rest-api/${api.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.25rem', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <FaviconImage baseUrl={api.sourceUrl} alt={api.title || api.name} size={20} borderRadius={4} fallbackEmoji="☁️" fallbackBgColor="rgba(16, 185, 129, 0.2)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{api.title || api.name}</span>
                          <span style={{ color: '#10b981', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>REST</span>
                          {api.authType && api.authType !== 'none' && (
                            <span style={{ color: '#8b5cf6', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{api.authType.toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                          {api.sourceUrl && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{api.sourceUrl}</span>}
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', flexShrink: 0 }}>• {api.endpointCount} tools</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {/* GraphQL */}
                {(importsFilter === 'all' || importsFilter === 'graphql') && imports.graphql.map(gql => (
                  <Link key={gql.id} href={`/dashboard/graphql/${gql.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.25rem', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <FaviconImage baseUrl={gql.sourceUrl} alt={gql.title || gql.name} size={20} borderRadius={4} fallbackEmoji="◈" fallbackBgColor="rgba(102, 126, 234, 0.2)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gql.title || gql.name}</span>
                          <span style={{ color: '#667eea', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(102, 126, 234, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>GraphQL</span>
                          {gql.authType && gql.authType !== 'none' && (
                            <span style={{ color: '#8b5cf6', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{gql.authType.toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                          {gql.sourceUrl && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{gql.sourceUrl}</span>}
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', flexShrink: 0 }}>• {gql.operationCount} tools</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {/* MCP Servers */}
                {(importsFilter === 'all' || importsFilter === 'mcp') && imports.mcpServers.map(mcp => (
                  <Link key={mcp.id} href={`/dashboard/mcp-server/${mcp.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.25rem', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <FaviconImage baseUrl={mcp.sourceUrl} alt={mcp.displayName || mcp.name} size={20} borderRadius={4} fallbackEmoji="🔌" fallbackBgColor="rgba(251, 146, 60, 0.2)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mcp.displayName || mcp.name}</span>
                          <span style={{ color: '#fb923c', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(251, 146, 60, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>MCP</span>
                          {mcp.authType && mcp.authType !== 'none' && (
                            <span style={{ color: '#8b5cf6', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{mcp.authType.toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                          {mcp.sourceUrl && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{mcp.sourceUrl}</span>}
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', flexShrink: 0 }}>• {mcp.toolCount} tools</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {/* A2A Agents */}
                {(importsFilter === 'all' || importsFilter === 'a2a') && imports.a2aAgents.map(agent => (
                  <Link key={agent.id} href={`/dashboard/a2a-agent/${agent.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.25rem', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <FaviconImage iconUrl={agent.iconUrl} baseUrl={agent.agentUrl} alt={agent.displayName || agent.name} size={20} borderRadius={4} fallbackEmoji="🤖" fallbackBgColor="rgba(245, 158, 11, 0.2)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.displayName || agent.name}</span>
                          <span style={{ color: '#f59e0b', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>A2A</span>
                          {agent.authType && agent.authType !== 'none' && (
                            <span style={{ color: '#8b5cf6', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{agent.authType.toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{agent.agentUrl}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', flexShrink: 0 }}>• 1 tool</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {/* RAGs */}
                {(importsFilter === 'all' || importsFilter === 'rag') && imports.rags.map(rag => {
                  // For CSV: compose endpoint URL, for URL imports: use source URL
                  const ragEndpointUrl = rag.sourceType === 'csv'
                    ? `${HOST_URL}/api/collection/${apiKey || '{api_key}'}/${rag.ragName}`
                    : rag.sourceUrl;
                  return (
                  <Link key={rag.id} href={`/dashboard/rag/${rag.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.25rem', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>{rag.icon || '📚'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rag.name}</span>
                          <span style={{ color: '#8b5cf6', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>RAG</span>
                          <span style={{ color: rag.sourceType === 'csv' ? '#10b981' : '#3b82f6', fontSize: '0.55rem', fontWeight: 600, background: rag.sourceType === 'csv' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{rag.sourceType === 'csv' ? 'CSV' : 'URL'}</span>
                          {rag.authType && rag.authType !== 'none' && (
                            <span style={{ color: '#8b5cf6', fontSize: '0.55rem', fontWeight: 600, background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{rag.authType.toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                          {ragEndpointUrl && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{ragEndpointUrl}</span>}
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', flexShrink: 0 }}>• {rag.toolCount} tool{rag.toolCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!importsLoading && imports.restApis.length === 0 && imports.graphql.length === 0 && imports.mcpServers.length === 0 && imports.a2aAgents.length === 0 && imports.rags.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📥</span>
                No APIs or agents imported yet
              </div>
            )}

            {/* Import buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
              {/* REST API - Pro only */}
              {isPro ? (
                <Link href="/dashboard/swagger-import" style={{ textDecoration: 'none' }}>
                  <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> REST API
                  </button>
                </Link>
              ) : (
                <div style={{ position: 'relative' }}>
                  <button disabled style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.05)', color: 'rgba(16, 185, 129, 0.4)', fontSize: '0.75rem', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> REST API
                  </button>
                  <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontSize: '0.55rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: '4px' }}>PRO</span>
                </div>
              )}
              {/* GraphQL - Pro only */}
              {isPro ? (
                <Link href="/dashboard/graphql-import" style={{ textDecoration: 'none' }}>
                  <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(102, 126, 234, 0.4)', background: 'rgba(102, 126, 234, 0.1)', color: '#667eea', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> GraphQL
                  </button>
                </Link>
              ) : (
                <div style={{ position: 'relative' }}>
                  <button disabled style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(102, 126, 234, 0.2)', background: 'rgba(102, 126, 234, 0.05)', color: 'rgba(102, 126, 234, 0.4)', fontSize: '0.75rem', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> GraphQL
                  </button>
                  <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontSize: '0.55rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: '4px' }}>PRO</span>
                </div>
              )}
              {/* MCP Server - Pro only */}
              {isPro ? (
                <Link href="/dashboard/mcp-import" style={{ textDecoration: 'none' }}>
                  <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(251, 146, 60, 0.4)', background: 'rgba(251, 146, 60, 0.1)', color: '#fb923c', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> MCP Server
                  </button>
                </Link>
              ) : (
                <div style={{ position: 'relative' }}>
                  <button disabled style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(251, 146, 60, 0.2)', background: 'rgba(251, 146, 60, 0.05)', color: 'rgba(251, 146, 60, 0.4)', fontSize: '0.75rem', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> MCP Server
                  </button>
                  <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontSize: '0.55rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: '4px' }}>PRO</span>
                </div>
              )}
              {/* A2A Agent - Available for all tiers */}
              <Link href="/dashboard/agent-import" style={{ textDecoration: 'none' }}>
                <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <span>+</span> A2A Agent
                </button>
              </Link>
              {/* RAG - Pro+ only */}
              {isPro ? (
                <Link href="/dashboard/rag-import" style={{ textDecoration: 'none' }}>
                  <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span>+</span> RAG
                  </button>
                </Link>
              ) : (
                <div style={{ position: 'relative' }}>
                  <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(139, 92, 246, 0.2)', background: 'rgba(139, 92, 246, 0.05)', color: 'rgba(139, 92, 246, 0.4)', fontSize: '0.75rem', fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', filter: 'blur(0.5px)' }} disabled>
                    <span>+</span> RAG
                  </button>
                  <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: '0.55rem', fontWeight: 700, padding: '2px 5px', borderRadius: '4px' }}>PRO</div>
                </div>
              )}
            </div>
          </DashboardCard>
        )}

        {/* OAuth Connections Card - Available for all tiers */}
        {isMcpComposerEnabled() && (
          <DashboardCard title="OAuth Connections" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }>
            {/* Loading indicator */}
            {oauthConnectionsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                Loading connections...
              </div>
            )}

            {/* Empty state */}
            {!oauthConnectionsLoading && oauthConnections.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🔐</span>
                No OAuth connections yet. Import an API or agent with OAuth2 authentication to see connections here.
              </div>
            )}

            {/* Connections list */}
            {!oauthConnectionsLoading && oauthConnections.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {oauthConnections.map(conn => {
                  const isExpanded = expandedOAuthConnection === conn.providerHash;
                  // Get the most recent token (first in array since sorted by updated_at desc)
                  const mostRecentToken = conn.tokens[0];
                  const hasExpiredTokens = conn.tokens.some(t => t.isExpired);
                  const allExpired = conn.tokens.every(t => t.isExpired);

                  return (
                    <div key={conn.providerHash} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '0.75rem', border: allExpired ? '1px solid rgba(239, 68, 68, 0.3)' : hasExpiredTokens ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(139, 92, 246, 0.2)' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setExpandedOAuthConnection(isExpanded ? null : conn.providerHash)}>
                        <span style={{ fontSize: '1.25rem' }}>🔑</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {new URL(conn.oauthConfig.token_endpoint).hostname}
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                            {conn.tokens.length} token{conn.tokens.length !== 1 ? 's' : ''} • {conn.linkedImports.length} import{conn.linkedImports.length !== 1 ? 's' : ''}
                            {allExpired ? (
                              <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>• All expired</span>
                            ) : hasExpiredTokens ? (
                              <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>• Some expired</span>
                            ) : (
                              <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>• Active</span>
                            )}
                          </div>
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          {/* Connection-level actions */}
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                            <button
                              onClick={() => reauthenticateOAuthConnection(conn)}
                              disabled={reauthenticatingConnection === conn.providerHash}
                              style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '0.75rem', fontWeight: 600, cursor: reauthenticatingConnection === conn.providerHash ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: reauthenticatingConnection === conn.providerHash ? 0.6 : 1 }}
                            >
                              🔄 {reauthenticatingConnection === conn.providerHash ? 'Authenticating...' : 'Re-authenticate'}
                            </button>
                            <button
                              onClick={() => setConfirmRevokeAllTokens({ providerHash: conn.providerHash, providerName: new URL(conn.oauthConfig.token_endpoint).hostname })}
                              style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              🗑️ Revoke All Tokens
                            </button>
                          </div>

                          {/* Tokens list */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tokens ({conn.tokens.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {conn.tokens.map((token, idx) => {
                                const expiresIn = token.accessTokenExpiresAt ? Math.max(0, Math.floor((new Date(token.accessTokenExpiresAt).getTime() - Date.now()) / 1000 / 60)) : null;
                                return (
                                  <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.4rem 0.6rem', border: token.isExpired ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.8rem' }}>{token.isShared ? '🌐' : '📌'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ color: '#fff', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        {token.isShared ? 'Shared Token' : `Server-specific`}
                                        {idx === 0 && <span style={{ background: 'rgba(139, 92, 246, 0.3)', color: '#a78bfa', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 600 }}>ACTIVE</span>}
                                      </div>
                                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>
                                        {token.isExpired ? (
                                          <span style={{ color: '#ef4444' }}>Expired</span>
                                        ) : expiresIn !== null ? (
                                          <span style={{ color: expiresIn < 5 ? '#f59e0b' : '#10b981' }}>Expires in {expiresIn}m</span>
                                        ) : (
                                          <span style={{ color: '#10b981' }}>No expiry</span>
                                        )}
                                        {token.hasRefreshToken && <span style={{ marginLeft: '0.5rem' }}>• Has refresh token</span>}
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setConfirmRevokeToken({ tokenId: token.id, providerHash: conn.providerHash }); }}
                                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'transparent', color: '#ef4444', fontSize: '0.65rem', cursor: 'pointer' }}
                                      title="Revoke this token"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Linked imports */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Linked Imports</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                              {conn.linkedImports.map(imp => (
                                <Link key={`${imp.type}-${imp.id}`} href={`/dashboard/${imp.type === 'rest_api' ? 'rest-api' : imp.type === 'a2a' ? 'a2a-agent' : imp.type === 'mcp' ? 'mcp-server' : imp.type}/${imp.id}`} style={{ textDecoration: 'none' }}>
                                  <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500 }}>
                                    {imp.type === 'rest_api' ? '📄' : imp.type === 'graphql' ? '◈' : imp.type === 'mcp' ? '🔌' : imp.type === 'a2a' ? '🤖' : '📚'} {imp.name}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>

                          {/* OAuth config */}
                          <div>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Configuration</div>
                            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.75rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '0.25rem' }}>Token Endpoint</div>
                              <div style={{ color: '#fff', wordBreak: 'break-all', marginBottom: '0.5rem' }}>{conn.oauthConfig.token_endpoint}</div>
                              <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '0.25rem' }}>Scopes</div>
                              <div style={{ color: '#fff' }}>{conn.oauthConfig.scopes || 'None'}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>
        )}

        {/* MCP Connections Card */}
        {isPro && connections.length > 0 && (
          <DashboardCard title="Active Connections" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 12l8-8" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          }>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Clients using your MCP server
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {connections.map((conn, i) => {
                // Support both new (method) and legacy (authMethod) field names
                const method = conn.method || conn.authMethod || 'path';
                const methodColors: Record<string, { bg: string; text: string }> = {
                  oauth: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
                  header: { bg: 'rgba(251, 191, 36, 0.2)', text: '#fbbf24' },
                  path: { bg: 'rgba(96, 165, 250, 0.2)', text: '#60a5fa' },
                  internal: { bg: 'rgba(167, 139, 250, 0.2)', text: '#a78bfa' },
                };
                const colors = methodColors[method] || methodColors.path;
                // Format lastUsed as UTC date+time
                const lastUsedDate = new Date(conn.lastUsed);
                const lastUsedUTC = lastUsedDate.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
                // Get IPs (support both new ips array and legacy single ip)
                const ips = conn.ips || (conn.ip ? [conn.ip] : []);

                return (
                  <div key={i} style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                  }}>
                    {/* Top row: Agent | Server | Method | Last Used */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}>
                      {/* Agent (left) */}
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>
                          {conn.agent.length > 50 ? conn.agent.slice(0, 50) + '...' : conn.agent}
                        </div>
                      </div>
                      {/* Server Name */}
                      {conn.serverName && (
                        <div style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: 'rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.7)',
                        }}>
                          {conn.serverName}
                        </div>
                      )}
                      {/* Method */}
                      <div style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: colors.bg,
                        color: colors.text,
                      }}>
                        {method.toUpperCase()}
                      </div>
                      {/* Last Used UTC (right) */}
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', minWidth: '140px', textAlign: 'right' }}>
                        {lastUsedUTC}
                      </div>
                    </div>
                    {/* IPs row */}
                    {ips.length > 0 && (
                      <div style={{
                        marginTop: '0.5rem',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                      }}>
                        {ips.join(' | ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DashboardCard>
        )}

        {/* Agent Creator Card - A2A Protocol */}
        {isPro && apiKey && isMcpComposerEnabled() && (
          <DashboardCard title="Agent Creator" icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="12" r="2" />
              <circle cx="20" cy="12" r="2" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="12" cy="20" r="2" />
              <path d="M6 12h3M15 12h3M12 6v3M12 15v3" />
            </svg>
          }>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Create AI agents that communicate via A2A protocol. Select models and aggregate tools from your MCP servers.
            </p>

            {/* Agent Creator Features */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🤖</span>
                  <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>Model Selection</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: 0 }}>
                  Choose from GPT-5, Claude 4, Gemini 3, Llama 3.1, and more
                </p>
              </div>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🔧</span>
                  <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>Tool Aggregation</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: 0 }}>
                  Combine tools from multiple MCP servers into one agent
                </p>
              </div>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🔗</span>
                  <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>A2A Protocol</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: 0 }}>
                  Agent-to-Agent communication for complex workflows
                </p>
              </div>
            </div>

            {/* Mock Agent List */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Your Agents</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>Coming Soon</span>
              </div>
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🤖</span>
                No agents created yet
              </div>
            </div>

            {/* Create Agent Button */}
            <button
              disabled
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '2px dashed rgba(245, 158, 11, 0.4)',
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'not-allowed',
                opacity: 0.6,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create A2A Agent
              <span style={{ fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.3)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>Soon</span>
            </button>
          </DashboardCard>
        )}

        {/* Personas Card - Available for all tiers */}
        {(
          <DashboardCard title="AI Personas" icon={
            <span style={{ fontSize: '24px' }}>🎭</span>
          }>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Create custom personas with system prompts to customize AI behavior in chat.
            </p>

            {/* Personas List */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Your Personas</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>{personas.length} total</span>
              </div>
              {personas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🎭</span>
                  No personas created yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {personas.map(persona => (
                    <div key={persona.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '1.5rem' }}>{persona.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{persona.name}</div>
                        {persona.description && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{persona.description}</div>}
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', marginTop: '0.25rem' }}>{persona.prompt_token_count} tokens</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button onClick={() => openEditPersona(persona)} style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', padding: '0.35rem 0.5rem', color: '#a78bfa', cursor: 'pointer', fontSize: '0.7rem' }}>Edit</button>
                        <button onClick={() => deletePersona(persona.id)} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.35rem 0.5rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create Persona Button */}
            <button
              onClick={() => { setEditingPersona(null); setPersonaForm({ name: '', description: '', icon: '🤖', systemPrompt: '' }); setShowCreatePersona(true); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '2px dashed rgba(139, 92, 246, 0.4)',
                background: 'rgba(139, 92, 246, 0.1)',
                color: '#a78bfa',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Persona
            </button>
          </DashboardCard>
        )}

        {/* Create/Edit Persona Modal */}
        {showCreatePersona && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowCreatePersona(false)}>
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflow: 'auto', border: '1px solid rgba(139, 92, 246, 0.3)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ color: '#fff', margin: '0 0 1.25rem', fontSize: '1.1rem' }}>{editingPersona ? 'Edit Persona' : 'Create Persona'}</h3>

              {/* Icon Picker */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>Icon</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['🤖', '🧠', '💡', '🎯', '🔮', '⚡', '🌟', '🎭', '👨‍💻', '👩‍🔬', '🦊', '🐱'].map(icon => (
                    <button key={icon} onClick={() => setPersonaForm(prev => ({ ...prev, icon }))} style={{ width: '40px', height: '40px', borderRadius: '8px', border: personaForm.icon === icon ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.2)', background: personaForm.icon === icon ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: '1.25rem' }}>{icon}</button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>Name *</label>
                <input type="text" value={personaForm.name} onChange={e => setPersonaForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Code Reviewer" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.9rem' }} />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>Description (optional)</label>
                <input type="text" value={personaForm.description} onChange={e => setPersonaForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description of this persona" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.9rem' }} />
              </div>

              {/* System Prompt */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>System Prompt *</label>
                <textarea value={personaForm.systemPrompt} onChange={e => setPersonaForm(prev => ({ ...prev, systemPrompt: e.target.value }))} placeholder="You are a helpful assistant that..." rows={6} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setShowCreatePersona(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
                <button onClick={savePersona} disabled={savingPersona || !personaForm.name || !personaForm.systemPrompt} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', cursor: savingPersona || !personaForm.name || !personaForm.systemPrompt ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: 500, opacity: savingPersona || !personaForm.name || !personaForm.systemPrompt ? 0.5 : 1 }}>{savingPersona ? 'Saving...' : (editingPersona ? 'Update' : 'Create')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Account Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '10px',
              padding: '0.75rem 1.5rem',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Bottom Ad */}
        <AdBanner slot={ADS_CONFIG.slots.dashboardFooter} style={{ marginTop: '3rem' }} />
      </main>

      <Footer />

      {/* OAuth Token Revocation Confirmation Modals */}
      {confirmRevokeToken && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setConfirmRevokeToken(null)}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Revoke Token</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Are you sure you want to revoke this token?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmRevokeToken(null)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => revokeOAuthToken(confirmRevokeToken.tokenId, confirmRevokeToken.providerHash)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Revoke</button>
            </div>
          </div>
        </div>
      )}

      {confirmRevokeAllTokens && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setConfirmRevokeAllTokens(null)}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Revoke All Tokens</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Are you sure you want to revoke ALL tokens for <strong style={{ color: '#fff' }}>{confirmRevokeAllTokens.providerName}</strong>? You will need to re-authenticate to use the linked imports.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmRevokeAllTokens(null)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => revokeAllOAuthTokens(confirmRevokeAllTokens.providerHash)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Revoke All</button>
            </div>
          </div>
        </div>
      )}

      {/* RAG Info Modal - Mobile Friendly */}
      {ragInfoModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setRagInfoModal(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>{ragInfoModal.icon}</span>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>{ragInfoModal.name}</h3>
                <code style={{ color: '#10b981', fontSize: '0.75rem' }}>{ragInfoModal.rag_name}</code>
              </div>
            </div>

            {/* Collection URL */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                📡 Collection API Endpoint
              </label>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}>
                <code style={{
                  color: '#10b981',
                  fontSize: '0.7rem',
                  flex: 1,
                  wordBreak: 'break-all',
                  minWidth: '200px',
                }}>
                  {HOST_URL}/api/collection/{apiKey || '{api_key}'}/{ragInfoModal.rag_name}
                </code>
                <button
                  onClick={() => {
                    const url = `${HOST_URL}/api/collection/${apiKey || '{api_key}'}/${ragInfoModal.rag_name}`;
                    navigator.clipboard.writeText(url);
                  }}
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.35rem 0.5rem',
                    color: '#10b981',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📋 Copy
                </button>
              </div>
            </div>

            {/* Server Description */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                📝 Server Description
              </label>
              <div style={{
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '6px',
                padding: '0.75rem',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '0.85rem',
                lineHeight: 1.5,
              }}>
                {ragInfoModal.server_description || ragInfoModal.description || 'No description provided.'}
              </div>
            </div>

            {/* Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: '0.5rem',
              marginBottom: '1rem'
            }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
                <div style={{ color: '#a78bfa', fontWeight: 600, fontSize: '1rem' }}>{ragInfoModal.document_count}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>Documents</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
                <div style={{ color: '#10b981', fontWeight: 600, fontSize: '1rem' }}>{formatTokenCount(ragInfoModal.total_tokens)}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>Tokens</div>
              </div>
            </div>

            {/* Usage Example */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                💡 Usage Example
              </label>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                color: '#60a5fa',
                overflowX: 'auto',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}># Search the collection</div>
                <div>curl &quot;{HOST_URL}/api/collection/{apiKey || '{api_key}'}/{ragInfoModal.rag_name}?q=your+query&quot;</div>
              </div>
            </div>

            <button
              onClick={() => setRagInfoModal(null)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: 'none',
                background: 'rgba(139, 92, 246, 0.3)',
                color: '#a78bfa',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </View>
  );
};

