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
  const mcpConfigCardRef = useRef<HTMLDivElement>(null);

  // Budget state
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudget, setNewBudget] = useState<string>('5.00');
  const [savingBudget, setSavingBudget] = useState(false);

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
              <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</span>
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
            /* Blurred section for free users */
            <div style={{
              filter: 'blur(6px)',
              opacity: 0.4,
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
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
          )}
        </DashboardCard>

        {/* Locked Sections for Free Users */}
        {!isPro && isBillingEnabled() && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <LockedSection
              title="MCP Server Config"
              description="Configure your MCP server for AI assistants like Claude, Cursor, and Windsurf."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              }
            />
            <LockedSection
              title="MCP Servers"
              description="Create custom MCP servers with only the tools you need."
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              }
            />
            <LockedSection
              title="Agent Creator"
              description="Create AI agents that communicate via A2A protocol."
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
                const toolCount = enabledTools.length || TOTAL_TOOL_COUNT;
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
                              ? `${toolCount} of ${TOTAL_TOOL_COUNT} tools enabled`
                              : `All tools (${TOTAL_TOOL_COUNT})`}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Link
                        href={isCustom ? `/dashboard/mcp-server/${selectedServer.id}` : '/docs/tools'}
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
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <span style={{ color: '#10b981', fontSize: '1rem' }}>●</span>
                <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>Server Active</span>
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
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#10b981', fontSize: '1.25rem' }}>●</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Server Active</span>
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
                  const enabledCount = defaultServer?.tools.filter(t => t.isEnabled).length || TOTAL_TOOL_COUNT;
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
                        href={`/dashboard/mcp-server/${server.id}`}
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
    </View>
  );
};

