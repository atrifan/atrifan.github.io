'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
import { ChatIcon } from '../components/ChatIcon';
import { FaviconImage } from '../components/FaviconImage';
import { MarkdownContent } from '../components/MarkdownContent';
import { SettingsPanel, SettingsPanelMode } from '../components/SettingsPanel';
import { OAuthAuthenticationModal, OAuthSuccessData } from '../components/OAuthAuthenticationModal';
import { ADS_CONFIG } from '../config/ads.config';
import type { OAuth2AuthConfig, OAuthServerType } from '../types/supabase';
import { applySEO } from '../utils/seo';
import { sendA2AMessage, sendA2AMessageStream, A2AReasoningEvent } from '../lib/a2a-client';
import { ReasoningBubbleList, ReasoningEvent } from '../components/ReasoningBubble';
import {
  AI_MODELS,
  TOKEN_QUOTAS,
  formatTokenCount,
  getUsagePercentage,
  estimateMessagesPerMonth,
  formatCurrency,
  DEFAULT_MONTHLY_BUDGET,
  getBudgetUsagePercent,
  calculateSafeTokensForBudget,
  calculateTokenCost,
} from '../config/ai-tokens.config';

interface ChatPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string;
  tokens?: { input: number; output: number };
  reasoningEvents?: ReasoningEvent[]; // Reasoning events from A2A streaming
}

interface Conversation {
  id: string;
  title: string;
  model_id: string;
  message_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

// Helper to format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Helper to format message content with clickable links
function formatMessageContent(content: string): React.ReactNode {
  // URL regex pattern
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

  const parts = content.split(urlPattern);

  return parts.map((part, index) => {
    if (urlPattern.test(part)) {
      // Reset regex lastIndex since we're reusing it
      urlPattern.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#60a5fa',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// Connector types
type ConnectorType = 'internal_mcp' | 'external_mcp' | 'internal_agent' | 'external_agent';

interface ChatConnector {
  id: string;
  connector_type: ConnectorType;
  mcp_server_id?: string;
  a2a_agent_id?: string;
  api_key_id?: string;
  external_url?: string;
  external_auth_type?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  external_auth_config?: Record<string, string>;
  external_headers?: Record<string, string>;
  display_name: string;
  description?: string;
  icon: string;
  icon_url?: string;
  is_enabled: boolean;
}

interface MCPServer {
  id: string;
  display_name: string;
  server_name: string;
  source_url: string;
  source_type?: 'native' | 'api_key' | 'mcp_import';
  toolCount: number;
  category?: string;
}

// A2A Agent types
interface A2AAgent {
  id: string;
  agent_name: string;
  display_name: string;
  agent_url: string;
  description?: string;
  icon_url?: string;
  auth_type?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  auth_config?: Record<string, string>;
}

// Personality types
interface Personality {
  id: string;
  name: string;
  description?: string;
  icon: string;
  system_prompt: string;
  prompt_token_count: number;
  is_default: boolean;
}

// Budget types
interface ModelBudgetInfo {
  modelId: string;
  modelName: string;
  icon: string;
  provider: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  safeTokensForBudget: number;
  usedTokens: number;
  usedCost: number;
  requestCount: number;
  usagePercent: number;
  remainingTokens: number;
}

interface BudgetData {
  budget: {
    monthlyBudgetUsd: number;
    hardLimit: boolean;
  };
  usage: {
    totalCost: number;
    totalTokens: number;
    budgetUsedPercent: number;
    remainingBudget: number;
    byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; count: number }>;
  };
  models: ModelBudgetInfo[];
}

// Donut chart component for model usage
const UsageDonut: React.FC<{ percent: number; size?: number; strokeWidth?: number }> = ({
  percent,
  size = 32,
  strokeWidth = 4
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const getColor = (p: number) => {
    if (p >= 90) return '#ef4444';
    if (p >= 70) return '#f59e0b';
    return '#10b981';
  };

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getColor(percent)}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  );
};

export const ChatPage: React.FC<ChatPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get tier and available models
  const tier = isPlus ? 'plus' : isPro ? 'pro' : 'free';
  const quota = TOKEN_QUOTAS[tier];
  const availableModels = AI_MODELS.filter(m => quota.models.includes(m.id));
  const defaultModel = availableModels[0]?.id || 'mistral/ministral-3b';

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // OAuth modal state
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthModalData, setOauthModalData] = useState<{
    serverName: string;
    serverType: OAuthServerType;
    serverId: string;
    oauthConfig: OAuth2AuthConfig;
  } | null>(null);
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const pendingMessageRef = useRef<ChatMessage | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Connectors state
  const [connectors, setConnectors] = useState<ChatConnector[]>([]);
  const [availableMcpServers, setAvailableMcpServers] = useState<MCPServer[]>([]);
  const [availableAgents, setAvailableAgents] = useState<A2AAgent[]>([]);
  const [showAddConnector, setShowAddConnector] = useState<ConnectorType | null>(null);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [connectorInfoModal, setConnectorInfoModal] = useState<{ connector: ChatConnector; tools: any[] } | null>(null);

  // Reasoning for connectors orchestration
  const [enableReasoning, setEnableReasoning] = useState(false);
  const [showReasoningInfoModal, setShowReasoningInfoModal] = useState(false);

  // A2A context ID for conversation continuity (task ID from external agent)
  const [a2aContextId, setA2aContextId] = useState<string | null>(null);

  // Budget state
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  // Personality state
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activePersonalityIds, setActivePersonalityIds] = useState<string[]>([]);
  const [showCreatePersonality, setShowCreatePersonality] = useState(false);
  const [newPersonality, setNewPersonality] = useState({ name: '', description: '', icon: '🤖', systemPrompt: '' });
  const [creatingPersonality, setCreatingPersonality] = useState(false);
  const [viewingPersona, setViewingPersona] = useState<Personality | null>(null);

  // RAG state
  interface RAG {
    id: string;
    name: string;
    description: string | null;
    icon: string;
    document_count: number;
    total_tokens: number;
    token_limit: number;
    is_enabled: boolean;
  }
  const [rags, setRags] = useState<RAG[]>([]);
  const [activeRagIds, setActiveRagIds] = useState<string[]>([]);

  // Chat config popover state
  const [showChatConfig, setShowChatConfig] = useState(false);
  const chatConfigRef = useRef<HTMLDivElement>(null);

  // Delete confirmation modal state
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'all'; convId?: string } | null>(null);

  // Settings panel state (overlay on mobile, sidebar on large screens)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsPanelMode, setSettingsPanelMode] = useState<SettingsPanelMode>('main');
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Model statistics collapsed state
  const [modelStatsExpanded, setModelStatsExpanded] = useState(false);

  // Model selector dropdown state (for sidebar/overlay)
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Input bar model selector dropdown state
  const [showInputModelDropdown, setShowInputModelDropdown] = useState(false);
  const inputModelDropdownRef = useRef<HTMLDivElement>(null);

  // Detect screen size on mount and resize
  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Mobile keyboard handling removed - let CSS handle the layout
  // The 100dvh and flex layout should automatically adjust when keyboard opens

  // Last message token info
  const [lastMessageTokens, setLastMessageTokens] = useState<{ input: number; output: number } | null>(null);

  // Cost usage (will be fetched from API)
  const [costUsage, setCostUsage] = useState({
    used: 0,
    limit: quota.aiCostBudget,
  });

  // External agent usage stats (from /api/ai/usage byModel)
  const [externalAgentUsage, setExternalAgentUsage] = useState<Record<string, { input: number; output: number; cost: number; count: number }>>({});

  // Track which user messages are expanded (for collapsible long messages)
  const [expandedUserMessages, setExpandedUserMessages] = useState<Set<string>>(new Set());

  // Streaming state for A2A agents
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [streamingReasoningEvents, setStreamingReasoningEvents] = useState<ReasoningEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const canAccessPro = isPro || isPlus;
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  // For free tier: check if user has external agents (allows chat access)
  const [freeUserAgentsLoaded, setFreeUserAgentsLoaded] = useState(false);
  const [freeUserHasAgents, setFreeUserHasAgents] = useState(false);

  // Check if selected model is actually an external agent (prefixed with 'agent:')
  const isExternalAgentSelected = selectedModel.startsWith('agent:');
  const selectedAgentConnector = isExternalAgentSelected
    ? connectors.find(c => c.connector_type === 'external_agent' && `agent:${c.id}` === selectedModel)
    : null;

  // Get all external agent connectors for the model selector
  const externalAgentConnectors = connectors.filter(c => c.connector_type === 'external_agent');

  // Budget-based calculations
  const monthlyBudget = budgetData?.budget.monthlyBudgetUsd || DEFAULT_MONTHLY_BUDGET;
  const totalCostSpent = budgetData?.usage.totalCost || 0;
  const budgetUsagePercent = getBudgetUsagePercent(totalCostSpent, monthlyBudget);
  const isBudgetExceeded = totalCostSpent >= monthlyBudget;
  const remainingBudget = Math.max(0, monthlyBudget - totalCostSpent);

  // Get selected model's budget info
  const selectedModelBudget = budgetData?.models.find(m => m.modelId === selectedModel);

  // Calculate estimated tokens remaining for selected model
  const estimatedTokensRemaining = calculateSafeTokensForBudget(selectedModel, remainingBudget);

  // Calculate active personalities token count
  const activePersonalities = personalities.filter(p => activePersonalityIds.includes(p.id));
  const totalSystemPromptTokens = activePersonalities.reduce((sum, p) => sum + p.prompt_token_count, 0);

  // Budget-based usage
  const usagePercent = budgetData ? budgetUsagePercent : getUsagePercentage(costUsage.used, tier);
  const isQuotaExceeded = budgetData ? isBudgetExceeded : costUsage.used >= costUsage.limit;

  // Token estimation function (rough: ~4 chars per token)
  const estimateTokens = (text: string): number => {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  };

  // Calculate aggregated tokens from all messages in conversation
  // Input tokens are on user messages, output tokens are on assistant messages
  // (Assistant messages also have input tokens for cost calculation, but we don't double-count for display)
  const conversationTokens = messages.reduce(
    (acc, msg) => ({
      input: acc.input + (msg.role === 'user' ? (msg.tokens?.input || 0) : 0),
      output: acc.output + (msg.role === 'assistant' ? (msg.tokens?.output || 0) : 0),
    }),
    { input: 0, output: 0 }
  );

  // Calculate total conversation cost from assistant messages (each has input + output tokens)
  const conversationCost = messages
    .filter(msg => msg.role === 'assistant' && msg.tokens)
    .reduce((total, msg) => {
      const isAgent = msg.model?.startsWith('agent:');
      if (isAgent) return total; // External agents are free
      return total + calculateTokenCost(msg.model || selectedModel, msg.tokens!.input, msg.tokens!.output);
    }, 0);

  // Estimate tokens for current input
  const currentInputTokens = estimateTokens(message);

  // For free tier: check if user has external agents (allows chat access)
  useEffect(() => {
    if (!canAccessPro && isLoggedIn && !freeUserAgentsLoaded) {
      const checkFreeUserAgents = async () => {
        try {
          const response = await fetch('/api/agents/list');
          if (response.ok) {
            const data = await response.json();
            const agents = data.agents || [];
            setAvailableAgents(agents);
            setFreeUserHasAgents(agents.length > 0);
          }
        } catch (err) {
          console.error('Failed to check agents for free user:', err);
        } finally {
          setFreeUserAgentsLoaded(true);
        }
      };
      checkFreeUserAgents();
    }
  }, [canAccessPro, isLoggedIn, freeUserAgentsLoaded]);

  // Fetch conversations and connectors on mount
  useEffect(() => {
    if (canAccessPro || freeUserHasAgents) {
      fetchConversations();
      fetchCostUsage();
      fetchConnectors();
      fetchMcpServers();
      if (canAccessPro) {
        fetchAgents(); // Already fetched for free users above
      }
      fetchBudget();
      fetchPersonalities();
      fetchRags();
    }
  }, [canAccessPro, freeUserHasAgents]);

  // For free tier: set default model to first external agent when connectors load
  useEffect(() => {
    if (!canAccessPro && freeUserHasAgents && externalAgentConnectors.length > 0) {
      // If current model is not an external agent, switch to first available agent
      if (!selectedModel.startsWith('agent:')) {
        setSelectedModel(`agent:${externalAgentConnectors[0].id}`);
      }
    }
  }, [canAccessPro, freeUserHasAgents, externalAgentConnectors, selectedModel]);

  // Load conversation and A2A context from URL on mount only
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;

    const convId = searchParams.get('c');
    const ctxId = searchParams.get('ctx');

    if (canAccessPro || freeUserHasAgents) {
      initialLoadDone.current = true;
      if (convId) {
        loadConversation(convId);
      }
      if (ctxId) {
        setA2aContextId(ctxId);
      }
    }
  }, [searchParams, canAccessPro, freeUserHasAgents]);

  // Sync URL when conversation or contextId changes
  // Only include ctx param when there's a conversation ID (ctx is meaningless without a saved conversation)
  useEffect(() => {
    const currentUrlConvId = searchParams.get('c');
    const currentUrlCtxId = searchParams.get('ctx');

    // Build URL params - only include ctx if there's a conversation
    const params = new URLSearchParams();
    if (currentConversationId) {
      params.set('c', currentConversationId);
      // Only include ctx when we have a conversation ID
      if (a2aContextId) {
        params.set('ctx', a2aContextId);
      }
    }
    // If no conversation ID, don't include ctx in URL (it's a new chat)

    const newUrl = params.toString() ? `/chat?${params.toString()}` : '/chat';
    const currentUrl = currentUrlConvId || currentUrlCtxId
      ? `/chat?${new URLSearchParams(Object.fromEntries([[currentUrlConvId ? 'c' : '', currentUrlConvId], [currentUrlCtxId ? 'ctx' : '', currentUrlCtxId]].filter(([k]) => k))).toString()}`
      : '/chat';

    if (newUrl !== currentUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [currentConversationId, a2aContextId, router, searchParams]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // On mobile, scroll to bottom when typing starts (keyboard opens)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only on mobile, and only for printable characters
      if (window.innerWidth >= 768) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't steal focus if user is already typing in another input/textarea
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          return;
        }
        // Focus textarea and scroll to bottom
        if (textareaRef.current && document.activeElement !== textareaRef.current) {
          textareaRef.current.focus();
        }
        scrollToBottom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scrollToBottom]);

  useEffect(() => {
    applySEO('chat');
  }, []);

  // Close chat config popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatConfigRef.current && !chatConfigRef.current.contains(event.target as Node)) {
        setShowChatConfig(false);
      }
    };

    if (showChatConfig) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChatConfig]);

  // Close model dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };

    if (showModelDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModelDropdown]);

  // Close input bar model dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputModelDropdownRef.current && !inputModelDropdownRef.current.contains(event.target as Node)) {
        setShowInputModelDropdown(false);
      }
    };

    if (showInputModelDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInputModelDropdown]);

  // Fetch conversation history
  const fetchConversations = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/ai/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Show delete confirmation modal for single conversation
  const confirmDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent loading the conversation
    setDeleteConfirm({ type: 'single', convId });
  };

  // Show delete confirmation modal for all conversations
  const confirmClearAllHistory = () => {
    setDeleteConfirm({ type: 'all' });
  };

  // Execute the delete after confirmation
  const executeDelete = async () => {
    if (!deleteConfirm) return;

    try {
      if (deleteConfirm.type === 'single' && deleteConfirm.convId) {
        const response = await fetch(`/api/ai/conversations/${deleteConfirm.convId}`, { method: 'DELETE' });
        if (response.ok) {
          setConversations(prev => prev.filter(c => c.id !== deleteConfirm.convId));
          if (currentConversationId === deleteConfirm.convId) {
            setCurrentConversationId(null);
            setMessages([]);
            setA2aContextId(null);
          }
        }
      } else if (deleteConfirm.type === 'all') {
        await Promise.all(conversations.map(conv =>
          fetch(`/api/ai/conversations/${conv.id}`, { method: 'DELETE' })
        ));
        setConversations([]);
        setCurrentConversationId(null);
        setMessages([]);
        setA2aContextId(null);
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Fetch cost usage
  const fetchCostUsage = async () => {
    try {
      const response = await fetch('/api/ai/usage', {
        headers: { 'x-user-tier': tier },
      });
      if (response.ok) {
        const data = await response.json();
        setCostUsage({
          used: parseFloat(data.usage?.totalCost) || 0,
          limit: data.quota?.aiCostBudget || quota.aiCostBudget,
        });

        // Extract external agent usage from byModel (model IDs starting with "agent:")
        if (data.usage?.byModel) {
          const agentUsage: Record<string, { input: number; output: number; cost: number; count: number }> = {};
          Object.entries(data.usage.byModel).forEach(([modelId, usage]) => {
            if (modelId.startsWith('agent:')) {
              const u = usage as { input: number; output: number; cost: number; count: number };
              agentUsage[modelId] = {
                input: u.input || 0,
                output: u.output || 0,
                cost: u.cost || 0,
                count: u.count || 0,
              };
            }
          });
          setExternalAgentUsage(agentUsage);
        }
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    }
  };

  // Fetch budget data
  const fetchBudget = async () => {
    try {
      const response = await fetch('/api/ai/budget');
      if (response.ok) {
        const data = await response.json();
        setBudgetData(data);
      }
    } catch (err) {
      console.error('Failed to fetch budget:', err);
    }
  };

  // Fetch personalities
  const fetchPersonalities = async () => {
    try {
      const response = await fetch('/api/ai/personalities?context=chat');
      if (response.ok) {
        const data = await response.json();
        setPersonalities(data.personalities || []);
        setActivePersonalityIds(data.activeIds || []);
      }
    } catch (err) {
      console.error('Failed to fetch personalities:', err);
    }
  };

  // Create personality
  const createPersonality = async () => {
    if (!newPersonality.name || !newPersonality.systemPrompt) return;
    setCreatingPersonality(true);
    try {
      const response = await fetch('/api/ai/personalities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPersonality.name,
          description: newPersonality.description,
          icon: newPersonality.icon,
          systemPrompt: newPersonality.systemPrompt,
        }),
      });
      if (response.ok) {
        fetchPersonalities();
        setShowCreatePersonality(false);
        setNewPersonality({ name: '', description: '', icon: '🤖', systemPrompt: '' });
      }
    } catch (err) {
      console.error('Failed to create personality:', err);
    } finally {
      setCreatingPersonality(false);
    }
  };

  // Link/unlink personality
  const togglePersonality = async (personalityId: string) => {
    const isActive = activePersonalityIds.includes(personalityId);
    try {
      if (isActive) {
        await fetch(`/api/ai/personalities/active?personalityId=${personalityId}&context=chat`, { method: 'DELETE' });
        setActivePersonalityIds(prev => prev.filter(id => id !== personalityId));
      } else {
        await fetch('/api/ai/personalities/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalityId, context: 'chat' }),
        });
        setActivePersonalityIds(prev => [...prev, personalityId]);
      }
    } catch (err) {
      console.error('Failed to toggle personality:', err);
    }
  };

  // Fetch RAGs
  const fetchRags = async () => {
    try {
      const response = await fetch('/api/ai/rags?context=chat');
      if (response.ok) {
        const data = await response.json();
        setRags(data.rags || []);
        setActiveRagIds(data.activeIds || []);
      }
    } catch (err) {
      console.error('Failed to fetch RAGs:', err);
    }
  };

  // Toggle RAG
  const toggleRag = async (ragId: string) => {
    const isActive = activeRagIds.includes(ragId);
    try {
      if (isActive) {
        await fetch(`/api/ai/rags/active?ragId=${ragId}&context=chat`, { method: 'DELETE' });
        setActiveRagIds(prev => prev.filter(id => id !== ragId));
      } else {
        await fetch('/api/ai/rags/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ragId, context: 'chat' }),
        });
        setActiveRagIds(prev => [...prev, ragId]);
      }
    } catch (err) {
      console.error('Failed to toggle RAG:', err);
    }
  };

  // Delete personality
  const deletePersonality = async (personalityId: string) => {
    try {
      await fetch(`/api/ai/personalities?id=${personalityId}`, { method: 'DELETE' });
      setPersonalities(prev => prev.filter(p => p.id !== personalityId));
      setActivePersonalityIds(prev => prev.filter(id => id !== personalityId));
    } catch (err) {
      console.error('Failed to delete personality:', err);
    }
  };

  // Fetch connectors
  const fetchConnectors = async () => {
    try {
      setLoadingConnectors(true);
      const response = await fetch('/api/ai/connectors?context=chat');
      if (response.ok) {
        const data = await response.json();
        setConnectors(data.connectors || []);
      }
    } catch (err) {
      console.error('Failed to fetch connectors:', err);
    } finally {
      setLoadingConnectors(false);
    }
  };

  // Fetch available MCP servers
  const fetchMcpServers = async () => {
    try {
      const response = await fetch('/api/mcp-servers/list');
      if (response.ok) {
        const data = await response.json();
        setAvailableMcpServers(data.servers || []);
      }
    } catch (err) {
      console.error('Failed to fetch MCP servers:', err);
    }
  };

  // Fetch available A2A agents
  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/agents/list');
      if (response.ok) {
        const data = await response.json();
        setAvailableAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  // Add internal MCP connector
  const addInternalMcpConnector = async (server: MCPServer) => {
    try {
      // For internal MCP, pass the api_key_id directly
      // The server.id for api_key type is the api_key id
      const response = await fetch('/api/ai/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorType: 'internal_mcp',
          displayName: server.display_name,
          description: `${server.toolCount} tools`,
          icon: '🔧',
          // Pass api_key_id for proper foreign key reference
          apiKeyId: server.id,
          // Keep external_url for backwards compatibility
          externalUrl: `api_key:${server.id}`,
          context: 'chat',
        }),
      });
      if (response.ok) {
        fetchConnectors();
        setShowAddConnector(null);
      } else {
        const err = await response.json();
        console.error('Failed to add connector:', err);
      }
    } catch (err) {
      console.error('Failed to add connector:', err);
    }
  };

  // Add external MCP connector
  const addExternalMcpConnector = async (server: MCPServer) => {
    try {
      const response = await fetch('/api/ai/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorType: 'external_mcp',
          mcpServerId: server.id,
          displayName: server.display_name,
          description: `${server.toolCount} tools`,
          icon: '🌐',
          externalUrl: server.source_url,
          context: 'chat',
        }),
      });
      if (response.ok) {
        fetchConnectors();
        setShowAddConnector(null);
      }
    } catch (err) {
      console.error('Failed to add external connector:', err);
    }
  };

  // Add external agent connector
  const addExternalAgentConnector = async (agent: A2AAgent) => {
    try {
      const response = await fetch('/api/ai/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorType: 'external_agent',
          displayName: agent.display_name,
          description: agent.description ? agent.description.slice(0, 50) : 'A2A Agent',
          icon: '🤖',
          iconUrl: agent.icon_url || null,
          // Pass a2a_agent_id for proper foreign key reference
          a2aAgentId: agent.id,
          // Keep external_url for backwards compatibility
          externalUrl: agent.agent_url,
          // Pass auth type and config from the agent
          externalAuthType: agent.auth_type || 'none',
          externalAuthConfig: agent.auth_config || {},
          context: 'chat',
        }),
      });
      if (response.ok) {
        fetchConnectors();
        setShowAddConnector(null);
      }
    } catch (err) {
      console.error('Failed to add external agent connector:', err);
    }
  };

  // Remove connector
  const removeConnector = async (connectorId: string) => {
    try {
      const response = await fetch(`/api/ai/connectors?id=${connectorId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setConnectors(prev => prev.filter(c => c.id !== connectorId));
      }
    } catch (err) {
      console.error('Failed to remove connector:', err);
    }
  };

  // Show connector info modal with tools
  const showConnectorInfo = async (connector: ChatConnector) => {
    try {
      // For external_mcp, fetch from mcp_servers table
      if (connector.connector_type === 'external_mcp' && connector.mcp_server_id) {
        const response = await fetch(`/api/mcp-servers/${connector.mcp_server_id}`);
        if (response.ok) {
          const data = await response.json();
          // Transform tools from the nested structure
          const tools = (data.tools || []).map((st: any) => ({
            name: st.tool?.name || st.original_name,
            description: st.tool?.description || st.original_description,
            inputSchema: st.tool?.input_schema,
            outputSchema: st.tool?.output_schema,
            isEnabled: st.is_enabled,
          }));
          setConnectorInfoModal({ connector, tools });
        } else {
          setConnectorInfoModal({ connector, tools: [] });
        }
      }
      // For internal_mcp (api_key servers), we need to find the api_key id
      // The mcpServerId for internal_mcp is actually the api_key id
      else if (connector.connector_type === 'internal_mcp') {
        // Find the matching server from availableMcpServers
        const server = availableMcpServers.find(s => s.display_name === connector.display_name);
        if (server) {
          const response = await fetch(`/api/servers/${server.id}/tools`);
          if (response.ok) {
            const data = await response.json();
            const tools = (data.tools || []).map((t: any) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              outputSchema: t.outputSchema,
              isEnabled: t.isEnabled,
            }));
            setConnectorInfoModal({ connector, tools });
          } else {
            setConnectorInfoModal({ connector, tools: [] });
          }
        } else {
          setConnectorInfoModal({ connector, tools: [] });
        }
      } else {
        // External agent - show default A2A tool with query input
        const agentToolName = connector.display_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const defaultAgentTool = {
          name: `a2a_${agentToolName}`,
          description: connector.description || `Send a message to the ${connector.display_name} agent and receive a response.`,
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The message or query to send to the agent',
              },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'The agent\'s response message',
              },
            },
          },
          isEnabled: true,
        };
        setConnectorInfoModal({ connector, tools: [defaultAgentTool] });
      }
    } catch (err) {
      console.error('Failed to fetch connector tools:', err);
      setConnectorInfoModal({ connector, tools: [] });
    }
  };

  // Load a conversation
  const loadConversation = async (convId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/ai/conversations/${convId}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(convId);

        const modelId = data.conversation.model_id;

        // Always restore a2a_context_id from the conversation (or clear if not present)
        setA2aContextId(data.conversation.a2a_context_id || null);

        // Restore the model selection (works for both regular AI models and external agents)
        if (modelId) {
          setSelectedModel(modelId);
        }

        setMessages(
          (data.messages || []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at),
            model: m.model_id,
            tokens: m.input_tokens || m.output_tokens ? { input: m.input_tokens, output: m.output_tokens } : undefined,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Start new chat
  const startNewChat = () => {
    setCurrentConversationId(null);
    setA2aContextId(null); // Reset A2A context for new conversation
    setMessages([]);
    setError(null);
  };

  /**
   * NOTE TO SELF: OAuth Authentication and Retry Mechanism
   *
   * This is the common mechanism for handling OAuth authentication requirements
   * and automatically retrying the pending operation after successful auth.
   *
   * Usage:
   * 1. When a server/tool returns needsOAuth, call triggerOAuthAndRetry() with the message and config
   * 2. This opens the OAuth modal and stores the pending message
   * 3. On successful auth, handleOAuthSuccessRetry() is called automatically
   * 4. The pending message is resent without user intervention
   *
   * This can be reused for:
   * - A2A agents requiring OAuth
   * - MCP servers/tools requiring OAuth
   * - REST API connectors requiring OAuth
   * - Any other connector type that needs OAuth authentication
   */

  // Trigger OAuth modal and store pending message for retry after auth
  const triggerOAuthAndRetry = useCallback((
    pendingMsg: ChatMessage,
    oauthData: {
      serverName: string;
      serverType: OAuthServerType;
      serverId: string;
      oauthConfig: OAuth2AuthConfig;
    }
  ) => {
    console.log('[OAuth] Triggering OAuth flow for:', oauthData.serverName);
    setPendingMessage(pendingMsg);
    pendingMessageRef.current = pendingMsg;
    setOauthModalData(oauthData);
    setOauthModalOpen(true);
    setIsLoading(false);
  }, []);

  // Handle successful OAuth authentication - automatically retry pending message
  const handleOAuthSuccessRetry = useCallback(async (data?: OAuthSuccessData) => {
    const modalData = oauthModalData;
    setOauthModalOpen(false);
    setOauthModalData(null);

    // If DCR was used and we got a clientId, update the agent's auth_config
    // This ensures future token lookups can find the token via provider hash
    if (data?.clientId && modalData?.serverType === 'a2a' && modalData?.serverId) {
      try {
        console.log('[OAuth] Updating agent auth_config with DCR client_id:', data.clientId);
        await fetch(`/api/agents/${modalData.serverId}/update-oauth-client`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: data.clientId }),
        });
      } catch (err) {
        console.error('[OAuth] Failed to update agent auth_config:', err);
        // Non-fatal - continue with retry
      }
    }

    const msgToRetry = pendingMessageRef.current;
    if (msgToRetry) {
      console.log('[OAuth] Auth successful, retrying message:', msgToRetry.content.substring(0, 50));
      // Remove the pending message from the list (it will be re-added by sendMessage)
      setMessages(prev => prev.filter(m => m.id !== msgToRetry.id));
      // Set the message content and trigger send
      setMessage(msgToRetry.content);
      setPendingMessage(null);
      pendingMessageRef.current = null;
      // Use setTimeout to ensure state is updated before sending
      setTimeout(() => {
        const sendBtn = document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
        }
      }, 100);
    }
  }, [oauthModalData]);

  // Handle OAuth cancellation
  const handleOAuthCancel = useCallback(() => {
    setOauthModalOpen(false);
    setOauthModalData(null);
    setPendingMessage(null);
    pendingMessageRef.current = null;
    setError('Authentication cancelled');
  }, []);

  // Send message handler
  const sendMessage = useCallback(async () => {
    if (!message.trim() || isLoading) return;

    // Check quota before sending (skip for external agents - they're free)
    if (isQuotaExceeded && !isExternalAgentSelected) {
      setError('Monthly token quota exceeded. Please wait until the 1st of next month or upgrade your plan.');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);
    setError(null);
    setFailedMessageId(null); // Clear any previous failed message

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Handle external agent communication
      if (isExternalAgentSelected && selectedAgentConnector) {
        const a2aMessages = [...messages, userMessage].map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        // Get active personality system prompts
        const activeSystemPrompts = activePersonalityIds
          .map(id => personalities.find(p => p.id === id)?.system_prompt)
          .filter((prompt): prompt is string => !!prompt);

        // Reset streaming state
        setStreamingContent('');
        setStreamingReasoningEvents([]);
        setIsStreaming(true);

        // Collect reasoning events during streaming
        const collectedReasoningEvents: ReasoningEvent[] = [];
        let accumulatedContent = '';

        // Use streaming API for A2A agents
        const a2aResponse = await sendA2AMessageStream(
          {
            agentUrl: selectedAgentConnector.external_url || '',
            agentId: selectedAgentConnector.id,
            authType: selectedAgentConnector.external_auth_type,
            authConfig: selectedAgentConnector.external_auth_config,
            headers: selectedAgentConnector.external_headers,
            systemPrompts: activeSystemPrompts.length > 0 ? activeSystemPrompts : undefined,
            contextId: a2aContextId || undefined,
            signal: abortController.signal,
          },
          a2aMessages,
          {
            onReasoning: (event: A2AReasoningEvent) => {
              const reasoningEvent: ReasoningEvent = {
                id: event.id,
                reasoningType: event.reasoningType,
                title: event.title,
                text: event.text,
                timestamp: event.timestamp,
              };
              collectedReasoningEvents.push(reasoningEvent);
              setStreamingReasoningEvents(prev => [...prev, reasoningEvent]);
            },
            onContent: (text: string, append: boolean) => {
              if (append) {
                accumulatedContent += text;
              } else {
                accumulatedContent = text;
              }
              setStreamingContent(accumulatedContent);
            },
            onError: (error: string) => {
              console.error('[A2A Stream] Error:', error);
            },
          }
        );

        setIsStreaming(false);

        // Check if OAuth authentication is needed
        if (!a2aResponse.success && a2aResponse.needsOAuth && a2aResponse.oauthServerId) {
          console.log('[A2A] OAuth authentication required, serverId:', a2aResponse.oauthServerId);

          const serverOAuthConfig = a2aResponse.oauthConfig;
          const connectorAuthConfig = selectedAgentConnector.external_auth_config;

          const authEndpoint = serverOAuthConfig?.authorization_endpoint || connectorAuthConfig?.authorization_endpoint;
          const tokenEndpoint = serverOAuthConfig?.token_endpoint || connectorAuthConfig?.token_endpoint;
          const clientId = serverOAuthConfig?.client_id || connectorAuthConfig?.client_id;
          const scopes = serverOAuthConfig?.scopes || connectorAuthConfig?.scopes || 'openid';
          const useDcr = serverOAuthConfig?.use_dcr || (connectorAuthConfig?.use_dcr as unknown) === true || (connectorAuthConfig?.use_dcr as unknown) === 'true';
          const registrationEndpoint = serverOAuthConfig?.registration_endpoint || connectorAuthConfig?.registration_endpoint;

          const canAuthenticate = authEndpoint && tokenEndpoint && (clientId || (useDcr && registrationEndpoint));

          if (canAuthenticate) {
            triggerOAuthAndRetry(userMessage, {
              serverName: selectedAgentConnector.display_name,
              serverType: 'a2a',
              serverId: a2aResponse.oauthServerId,
              oauthConfig: {
                authorization_endpoint: authEndpoint,
                token_endpoint: tokenEndpoint,
                scopes: scopes,
                use_dcr: useDcr,
                client_id: clientId || '',
                client_secret: connectorAuthConfig?.client_secret || '',
                registration_endpoint: registrationEndpoint || '',
              },
            });
            return;
          } else {
            throw new Error('OAuth authentication required but configuration is incomplete.');
          }
        }

        if (!a2aResponse.success) {
          throw new Error(a2aResponse.error || 'Failed to communicate with agent');
        }

        // Store the context ID for conversation continuity
        if (a2aResponse.contextId && a2aResponse.contextId !== a2aContextId) {
          setA2aContextId(a2aResponse.contextId);
        }

        const assistantMessageContent = a2aResponse.content || accumulatedContent || 'No response from agent';
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: assistantMessageContent,
          timestamp: new Date(),
          model: `agent:${selectedAgentConnector.id}`,
          tokens: {
            input: a2aResponse.inputTokens || 0,
            output: a2aResponse.outputTokens || 0,
          },
          reasoningEvents: collectedReasoningEvents.length > 0 ? collectedReasoningEvents : undefined,
        };

        // Clear streaming state
        setStreamingContent('');
        setStreamingReasoningEvents([]);

        // Update user message with input tokens
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'user' && updated[i].id === userMessage.id) {
              updated[i] = {
                ...updated[i],
                tokens: {
                  input: a2aResponse.inputTokens || 0,
                  output: 0, // Output tokens shown on assistant message
                },
              };
              break;
            }
          }
          return [...updated, assistantMessage];
        });

        // Save messages to conversation for history persistence
        // Use the latest contextId (either from response or existing)
        const contextIdToSave = a2aResponse.contextId || a2aContextId;
        try {
          const saveResponse = await fetch('/api/a2a/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: currentConversationId,
              modelId: `agent:${selectedAgentConnector.id}`,
              userMessage: userMessage.content,
              assistantMessage: assistantMessageContent,
              inputTokens: a2aResponse.inputTokens || 0,
              outputTokens: a2aResponse.outputTokens || 0,
              a2aContextId: contextIdToSave,
            }),
          });

          if (saveResponse.ok) {
            const saveData = await saveResponse.json();
            if (saveData.conversationId && !currentConversationId) {
              setCurrentConversationId(saveData.conversationId);
              fetchConversations();
            }
          }
        } catch (saveErr) {
          console.error('Failed to save A2A messages:', saveErr);
        }

        // Update last message tokens for display (cost is $0 for external agents)
        if (a2aResponse.inputTokens || a2aResponse.outputTokens) {
          setLastMessageTokens({
            input: a2aResponse.inputTokens || 0,
            output: a2aResponse.outputTokens || 0
          });
        }

        // Refresh usage statistics display (fetchCostUsage updates externalAgentUsage)
        fetchCostUsage();
        fetchBudget();
      } else {
        // Handle regular AI model communication
        // Build system prompt from active personalities
        const combinedSystemPrompt = activePersonalities
          .map(p => p.system_prompt)
          .join('\n\n');

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-tier': tier,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content,
            })),
            model: selectedModel,
            conversationId: currentConversationId,
            systemPrompt: combinedSystemPrompt || undefined,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.reason === 'budget_exceeded') {
            setCostUsage(prev => ({ ...prev, used: prev.limit }));
            throw new Error('Monthly AI budget exceeded. Resets on the 1st.');
          }
          throw new Error(errorData.error || 'Failed to send message');
        }

        const data = await response.json();

        // Update conversation ID if new conversation was created
        if (data.conversationId && !currentConversationId) {
          setCurrentConversationId(data.conversationId);
          // Refresh conversations list
          fetchConversations();
        }

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content,
          timestamp: new Date(),
          model: selectedModel,
          // Store both input and output tokens on assistant message for cost calculation
          tokens: { input: data.usage?.input || 0, output: data.usage?.output || 0 },
        };

        // Update user message with input tokens (for display) and add assistant message
        setMessages(prev => {
          const updated = [...prev];
          // Find the last user message and add input tokens
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'user' && updated[i].id === userMessage.id) {
              updated[i] = {
                ...updated[i],
                tokens: {
                  input: data.usage?.input || 0,
                  output: 0,
                },
              };
              break;
            }
          }
          return [...updated, assistantMessage];
        });

        // Update last message tokens for display
        if (data.usage) {
          setLastMessageTokens({ input: data.usage.input, output: data.usage.output });
          // Update cost usage with the cost from this message
          if (data.usage.cost) {
            setCostUsage(prev => ({
              ...prev,
              used: prev.used + data.usage.cost,
            }));
          }
          // Refresh budget data to update the display
          fetchBudget();
        }
      }
    } catch (err) {
      // Check if this was a user-initiated cancellation
      if (err instanceof Error && err.name === 'AbortError') {
        // Add a canceled message as assistant response
        const canceledMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'User canceled the request.',
          timestamp: new Date(),
          model: isExternalAgentSelected && selectedAgentConnector ? `agent:${selectedAgentConnector.id}` : selectedModel,
        };
        setMessages(prev => [...prev, canceledMessage]);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setFailedMessageId(userMessage.id); // Track the failed message for retry
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [message, messages, selectedModel, tier, isLoading, isQuotaExceeded, currentConversationId, activePersonalities, isExternalAgentSelected, selectedAgentConnector, a2aContextId]);

  // Stop/cancel the current request
  const stopRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Retry failed message - resends the last failed user message
  const retryFailedMessage = useCallback(async () => {
    if (!failedMessageId || isLoading) return;

    // Find the failed message
    const failedMessage = messages.find(m => m.id === failedMessageId);
    if (!failedMessage || failedMessage.role !== 'user') return;

    // Set the message content and trigger send
    setMessage(failedMessage.content);
    // Remove the failed message from the list (it will be re-added by sendMessage)
    setMessages(prev => prev.filter(m => m.id !== failedMessageId));
    setFailedMessageId(null);
    setError(null);

    // Use setTimeout to ensure state updates before sending
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-send-button]') as HTMLButtonElement;
      if (sendBtn) sendBtn.click();
    }, 50);
  }, [failedMessageId, messages, isLoading]);

  // Auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  // Handle Enter key - Enter to send, Cmd/Ctrl+Enter for new line
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+Enter: insert new line manually
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = message.substring(0, start) + '\n' + message.substring(end);
        setMessage(newValue);
        // Set cursor position after the newline
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
          adjustTextareaHeight();
        }, 0);
      } else if (!e.shiftKey) {
        // Enter without modifiers: send message
        e.preventDefault();
        sendMessage();
      }
    }
  }, [sendMessage, message, setMessage, adjustTextareaHeight]);

  // Show upgrade modal for non-Pro users without external agents
  // Free users with external agents can access chat
  if (!canAccessPro && !freeUserHasAgents) {
    // Still loading agents for free user
    if (!freeUserAgentsLoaded && isLoggedIn) {
      return (
        <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
          <View maxWidth="56rem" marginX="auto" UNSAFE_style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <span style={{ fontSize: '2rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '1rem' }}>Loading...</p>
          </View>
        </View>
      );
    }
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <UpgradeModal
          isOpen={true}
          title="AI Chat - Pro Feature"
          featureName="AI Chat with multiple models"
          message="AI Chat with built-in models is available for Pro and Plus subscribers. However, free users can access chat by importing external A2A agents from the dashboard. Import an external agent to start chatting!"
          showCloseButton={false}
          showDashboardLink={true}
        />
        <View maxWidth="56rem" marginX="auto" UNSAFE_style={{ filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              CHAT
            </h1>
          </View>
        </View>
        <Footer />
      </View>
    );
  }

  // Add class to body for hiding iubenda
  useEffect(() => {
    document.body.classList.add('chat-page-active');
    return () => {
      document.body.classList.remove('chat-page-active');
    };
  }, []);

  return (
    <div className="chat-fullscreen">
      {/* Header - compact with essential controls */}
      <div className="chat-fullscreen-header">
        <div style={{ maxWidth: '56rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          {/* Left: Back + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '1.25rem', flexShrink: 0 }}>←</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              {isExternalAgentSelected && selectedAgentConnector ? (
                <>
                  <FaviconImage
                    iconUrl={selectedAgentConnector.icon_url || undefined}
                    baseUrl={selectedAgentConnector.external_url?.startsWith('http') ? selectedAgentConnector.external_url : undefined}
                    size={24}
                    fallbackEmoji="🤖"
                  />
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedAgentConnector.display_name}</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.25rem' }}>{selectedModelData?.icon || '💬'}</span>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedModelData?.name || 'Chat'}</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Budget + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* Budget indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.6rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.8rem' }}>💰</span>
              <span style={{ color: budgetUsagePercent > 80 ? '#ef4444' : budgetUsagePercent > 50 ? '#f59e0b' : '#10b981', fontSize: '0.75rem', fontWeight: 600 }}>{formatCurrency(remainingBudget)}</span>
            </div>

            {/* New chat button */}
            <button onClick={startNewChat} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.35rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>+</span>
              <span className="desktop-only">New</span>
            </button>

            {/* History button - opens settings panel */}
            <button onClick={() => {
              setShowSettingsPanel(true);
              setSettingsPanelMode('main');
            }} style={{ background: showSettingsPanel ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.35rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', position: 'relative' }}>
              📜
              {conversations.length > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#8b5cf6', color: '#fff', borderRadius: '8px', padding: '0 0.25rem', fontSize: '0.55rem', fontWeight: 700, minWidth: '14px', textAlign: 'center' }}>{conversations.length > 99 ? '99+' : conversations.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="chat-with-sidebar">
        {/* Main Chat Area */}
        <div className="chat-main-area">
          {/* Messages Area - Scrollable */}
          <div className="chat-fullscreen-messages">
            <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
        {/* Messages */}
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '50vh', padding: '2rem', textAlign: 'center' }}>
            {isExternalAgentSelected && selectedAgentConnector ? (
              <>
                {/* External Agent Welcome */}
                <div style={{ marginBottom: '1rem' }}>
                  <FaviconImage
                    iconUrl={selectedAgentConnector.icon_url || undefined}
                    baseUrl={selectedAgentConnector.external_url?.startsWith('http') ? selectedAgentConnector.external_url : undefined}
                    size={64}
                    fallbackEmoji="🤖"
                  />
                </div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Start chatting with {selectedAgentConnector.display_name}</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', maxWidth: '400px' }}>Ask questions, get help or chat.</p>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem' }}>🤖 External Agent</span>
                  <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255,255,255,0.6)', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem' }}>$0.00 cost</span>
                </div>
              </>
            ) : (
              <>
                {/* AI Model Welcome */}
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{selectedModelData?.icon || '💬'}</div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Start chatting with {selectedModelData?.name}</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', maxWidth: '400px' }}>Ask questions, get help with calculations, or explore your connected tools.</p>
                {(connectors.length > 0 || activePersonalityIds.length > 0) && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {connectors.length > 0 && <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem' }}>🔌 {connectors.length} connector{connectors.length > 1 ? 's' : ''}</span>}
                    {activePersonalityIds.length > 0 && <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem' }}>🎭 {activePersonalityIds.length} persona{activePersonalityIds.length > 1 ? 's' : ''}</span>}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.4rem', marginTop: '1.5rem', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden' }}>
                  {['Calculate my budget', 'Help me sleep better', 'What\'s my trading risk?', 'Convert units'].map(suggestion => (
                    <button key={suggestion} onClick={() => setMessage(suggestion)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '0.35rem 0.75rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px', flexShrink: 1 }}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
            {messages.map((msg, index) => {
              // Check if this message is from an external agent
              const isAgentMessage = msg.model?.startsWith('agent:');
              const agentConnectorId = isAgentMessage ? msg.model?.replace('agent:', '') : null;
              const agentConnector = agentConnectorId ? connectors.find(c => c.id === agentConnectorId) : null;
              // Look up the model data for this specific message
              const msgModelData = msg.model ? AI_MODELS.find(m => m.id === msg.model) : null;
              // Check if this is the last message and it failed
              const isLastMessage = index === messages.length - 1;
              const showRetry = isLastMessage && msg.role === 'user' && msg.id === failedMessageId && !isLoading;

              // Check if user message is long (more than ~4 lines worth of characters)
              const isUserMessageLong = msg.role === 'user' && msg.content.length > 200;
              const isUserMessageExpanded = expandedUserMessages.has(msg.id);

              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '0.875rem 1rem',
                      borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: msg.role === 'user' ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : isAgentMessage ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      cursor: msg.role === 'user' && isUserMessageLong ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (msg.role === 'user' && isUserMessageLong) {
                        setExpandedUserMessages(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(msg.id)) {
                            newSet.delete(msg.id);
                          } else {
                            newSet.add(msg.id);
                          }
                          return newSet;
                        });
                      }
                    }}
                  >
                    {msg.role === 'assistant' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>
                        {isAgentMessage && agentConnector ? (
                          <>
                            <FaviconImage
                              iconUrl={agentConnector.icon_url || undefined}
                              baseUrl={agentConnector.external_url?.startsWith('http') ? agentConnector.external_url : undefined}
                              size={14}
                              fallbackEmoji="🤖"
                            />
                            <span>{agentConnector.display_name}</span>
                          </>
                        ) : (
                          <>
                            <span>{msgModelData?.icon || selectedModelData?.icon}</span>
                            <span>{msgModelData?.name || selectedModelData?.name || 'AI'}</span>
                          </>
                        )}
                      </div>
                    )}
                    {/* Reasoning bubbles for A2A agent messages */}
                    {msg.role === 'assistant' && msg.reasoningEvents && msg.reasoningEvents.length > 0 && (
                      <ReasoningBubbleList events={msg.reasoningEvents} maxVisible={3} />
                    )}
                    <div style={{
                      fontSize: '0.875rem',
                      maxHeight: msg.role === 'user' && isUserMessageLong && !isUserMessageExpanded ? '5.25rem' : 'none',
                      overflow: 'hidden',
                      position: 'relative',
                    }}>
                      <MarkdownContent content={msg.content} />
                      {msg.role === 'user' && isUserMessageLong && !isUserMessageExpanded && (
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: '2.5rem',
                          background: 'linear-gradient(transparent 0%, rgba(99, 102, 241, 0.9) 50%, rgba(99, 102, 241, 1) 100%)',
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          paddingBottom: '0.35rem',
                        }}>
                          <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 500, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>▼ Click to expand</span>
                        </div>
                      )}
                    </div>
                    {isUserMessageLong && isUserMessageExpanded && (
                      <div style={{ marginTop: '0.75rem', textAlign: 'center', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                        <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 500 }}>▲ Click to collapse</span>
                      </div>
                    )}
                    {msg.tokens && (msg.tokens.input > 0 || msg.tokens.output > 0) && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {msg.role === 'user' && msg.tokens.input > 0 && (
                          <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>↑ {msg.tokens.input} prompt</span>
                        )}
                        {msg.role === 'assistant' && msg.tokens.output > 0 && (
                          <span style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#60a5fa' }}>↓ {msg.tokens.output} generated</span>
                        )}
                        {msg.role === 'assistant' && (
                          <span style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: isAgentMessage ? 'rgba(255,255,255,0.5)' : '#f59e0b' }}>
                            {isAgentMessage ? '$0.00' : formatCurrency(calculateTokenCost(msg.model || selectedModel, msg.tokens.input, msg.tokens.output))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Like/Dislike buttons for assistant messages */}
                  {msg.role === 'assistant' && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <button
                        onClick={() => {/* TODO: implement like functionality */}}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '6px',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                          e.currentTarget.style.color = '#10b981';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                          e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                        }}
                        title="Good response"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => {/* TODO: implement dislike functionality */}}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '6px',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                          e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                        }}
                        title="Bad response"
                      >
                        👎
                      </button>
                    </div>
                  )}
                  {/* Retry button for failed messages */}
                  {showRetry && (
                    <button
                      onClick={retryFailedMessage}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        marginTop: '0.5rem',
                        padding: '0.35rem 0.65rem',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: '#ef4444',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                      }}
                      title="Retry sending this message"
                    >
                      <span style={{ fontSize: '0.85rem' }}>↻</span>
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              );
            })}
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '80%' }}>
                {/* Show streaming reasoning events */}
                {isStreaming && streamingReasoningEvents.length > 0 && (
                  <div style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <ReasoningBubbleList events={streamingReasoningEvents} maxVisible={5} />
                  </div>
                )}
                {/* Show streaming content or loading dots */}
                <div style={{ padding: '0.875rem 1rem', borderRadius: '18px 18px 18px 4px', background: isExternalAgentSelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.1)', width: '100%' }}>
                  {isStreaming && streamingContent ? (
                    <div style={{ fontSize: '0.875rem', color: '#fff' }}>
                      <MarkdownContent content={streamingContent} />
                      <span style={{ animation: 'pulse 1s infinite', color: 'rgba(255,255,255,0.6)' }}>▌</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.3rem', color: 'rgba(255,255,255,0.6)' }}>
                      <span style={{ animation: 'pulse 1s infinite', animationDelay: '0s' }}>●</span>
                      <span style={{ animation: 'pulse 1s infinite', animationDelay: '0.2s' }}>●</span>
                      <span style={{ animation: 'pulse 1s infinite', animationDelay: '0.4s' }}>●</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
      </div>

      {/* Fixed Input Bar - Bottom */}
      <div className="chat-fullscreen-input">
        <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
          {/* Aggregated token stats */}
          {messages.length > 0 && (conversationTokens.input > 0 || conversationTokens.output > 0) && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.7rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                Conversation:
                <span style={{ color: '#10b981', marginLeft: '0.35rem' }}>↑ {formatTokenCount(conversationTokens.input)} in</span>
                <span style={{ color: '#60a5fa', marginLeft: '0.5rem' }}>↓ {formatTokenCount(conversationTokens.output)} out</span>
                <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>{formatCurrency(conversationCost)}</span>
              </span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.5rem', color: '#ef4444', fontSize: '0.8rem' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            {/* Config button - toggles settings panel (sidebar on large screens, overlay on mobile) */}
            <button
              onClick={() => { setShowSettingsPanel(true); setSettingsPanelMode('main'); }}
              style={{ width: '44px', height: '44px', borderRadius: '12px', background: (connectors.length > 0 || activePersonalityIds.length > 0) ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, position: 'relative' }}
            >
              ⚙️
              {(connectors.length > 0 || activePersonalityIds.length > 0) && (
                <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#f59e0b', color: '#000', borderRadius: '8px', padding: '0 0.25rem', fontSize: '0.55rem', fontWeight: 700, minWidth: '14px', textAlign: 'center' }}>{connectors.length + activePersonalityIds.length}</span>
              )}
            </button>

            {/* Textarea with token counter */}
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  const textarea = e.target;
                  textarea.style.height = 'auto';
                  const maxHeight = 120;
                  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  // Keyboard will open - let the viewport resize handler deal with scrolling
                  // Don't force scroll here to allow user to scroll freely
                }}
                placeholder={isQuotaExceeded ? 'Quota exceeded' : `Message ${isExternalAgentSelected && selectedAgentConnector ? selectedAgentConnector.display_name : (selectedModelData?.name || 'AI')}...`}
                disabled={isQuotaExceeded || isLoading}
                rows={1}
                style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.75rem 1rem', paddingRight: '5rem', color: '#fff', fontSize: '1rem', lineHeight: 1.4, resize: 'none', minHeight: '44px', maxHeight: '120px', outline: 'none', fontFamily: 'inherit' }}
              />
              {/* Live token counter */}
              {(currentInputTokens > 0 || totalSystemPromptTokens > 0) && (
                <div style={{ position: 'absolute', right: '0.75rem', bottom: '0.75rem', display: 'flex', gap: '0.25rem', fontSize: '0.65rem', pointerEvents: 'none' }}>
                  {currentInputTokens > 0 && (
                    <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{currentInputTokens}</span>
                  )}
                  {totalSystemPromptTokens > 0 && (
                    <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>+{totalSystemPromptTokens} 🎭</span>
                  )}
                </div>
              )}
            </div>

            {/* Send/Stop button */}
            {isLoading ? (
              <button
                onClick={stopRequest}
                aria-label="Stop request"
                title="Stop (cancel request)"
                style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!message.trim() || isQuotaExceeded}
                aria-label="Send message"
                data-send-button
                style={{ width: '44px', height: '44px', borderRadius: '12px', background: (!message.trim() || isQuotaExceeded) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', color: '#fff', cursor: (!message.trim() || isQuotaExceeded) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (!message.trim() || isQuotaExceeded) ? 0.5 : 1 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            )}
          </div>

          {/* Model selector + Helper text */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {/* Model selector button with dropdown */}
            <div ref={inputModelDropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowInputModelDropdown(!showInputModelDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '0.25rem 0.5rem',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  transition: 'all 0.2s',
                }}
              >
                {isExternalAgentSelected && selectedAgentConnector ? (
                  <>
                    <FaviconImage
                      iconUrl={selectedAgentConnector.icon_url || undefined}
                      baseUrl={selectedAgentConnector.external_url?.startsWith('http') ? selectedAgentConnector.external_url : undefined}
                      size={14}
                      fallbackEmoji="🤖"
                    />
                    <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedAgentConnector.display_name}</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '0.8rem' }}>{selectedModelData?.icon || '💬'}</span>
                    <span>{selectedModelData?.name || 'Model'}</span>
                  </>
                )}
                <span style={{ transform: showInputModelDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.6rem', opacity: 0.6 }}>▼</span>
              </button>

              {/* Dropdown menu - opens UPWARD (since it's at bottom of screen) */}
              {showInputModelDropdown && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '4px',
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '10px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 100,
                  minWidth: '180px',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
                }}>
                  {/* AI Models Section - only show for Pro/Plus users */}
                  {canAccessPro && availableModels.length > 0 && (
                    <>
                      <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>AI Models</div>
                      {availableModels.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedModel(m.id); setShowInputModelDropdown(false); }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            background: selectedModel === m.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.8rem',
                            textAlign: 'left',
                          }}
                        >
                          <span>{m.icon}</span>
                          <span>{m.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {/* External Agents Section */}
                  {externalAgentConnectors.length > 0 && (
                    <>
                      <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', borderTop: canAccessPro && availableModels.length > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>External Agents</div>
                      {externalAgentConnectors.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => { setSelectedModel(`agent:${agent.id}`); setShowInputModelDropdown(false); }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            background: selectedModel === `agent:${agent.id}` ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.8rem',
                            textAlign: 'left',
                          }}
                        >
                          <FaviconImage iconUrl={agent.icon_url || undefined} baseUrl={agent.external_url?.startsWith('http') ? agent.external_url : undefined} size={16} fallbackEmoji="🤖" />
                          <span>{agent.display_name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Feature toggle buttons */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {/* Reasoning toggle - only show when connectors exist and not using external agent */}
              {connectors.length > 0 && !isExternalAgentSelected && (
                <button
                  onClick={() => setEnableReasoning(!enableReasoning)}
                  title={enableReasoning ? 'Reasoning enabled (click to disable)' : 'Enable reasoning for tool orchestration'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    background: enableReasoning ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.08)',
                    border: enableReasoning ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    padding: '0.25rem 0.4rem',
                    color: enableReasoning ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s',
                  }}
                >
                  🧠
                </button>
              )}

              {/* RAG toggle - show when RAGs exist */}
              {rags.length > 0 && (
                <button
                  onClick={() => { setShowSettingsPanel(true); setSettingsPanelMode('rags'); }}
                  title={activeRagIds.length > 0 ? `${activeRagIds.length} knowledge base${activeRagIds.length > 1 ? 's' : ''} active (click to manage)` : 'No knowledge bases active (click to add)'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    background: activeRagIds.length > 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.08)',
                    border: activeRagIds.length > 0 ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    padding: '0.25rem 0.4rem',
                    color: activeRagIds.length > 0 ? '#10b981' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    transition: 'all 0.2s',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    <path d="M8 7h8" />
                    <path d="M8 11h8" />
                    <path d="M8 15h4" />
                  </svg>
                  {activeRagIds.length > 0 && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{activeRagIds.length}</span>
                  )}
                </button>
              )}
            </div>

            {/* Token/budget info */}
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
              {isExternalAgentSelected ? (
                '∞ tokens (free)'
              ) : (
                <>~{formatTokenCount(calculateSafeTokensForBudget(selectedModel, remainingBudget))} tokens • {formatCurrency(remainingBudget)} left</>
              )}
            </span>
          </div>
        </div>
      </div>
        </div>{/* End chat-main-area */}
      </div>{/* End chat-with-sidebar */}

      {/* Settings Panel */}
      <SettingsPanel
        mode="chat"
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isLargeScreen={isLargeScreen}
        panelMode={settingsPanelMode}
        setPanelMode={setSettingsPanelMode}
        budgetData={budgetData}
        tier={isPlus ? 'plus' : isPro ? 'pro' : 'free'}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        availableModels={availableModels}
        externalAgentConnectors={externalAgentConnectors}
        externalAgentUsage={externalAgentUsage}
        connectors={connectors}
        removeConnector={removeConnector}
        availableMcpServers={availableMcpServers}
        addInternalMcpConnector={addInternalMcpConnector}
        addExternalMcpConnector={addExternalMcpConnector}
        availableAgents={availableAgents}
        addExternalAgentConnector={addExternalAgentConnector}
        personalities={personalities}
        activePersonalityIds={activePersonalityIds}
        togglePersonality={togglePersonality}
        setViewingPersona={setViewingPersona}
        rags={rags}
        activeRagIds={activeRagIds}
        toggleRag={toggleRag}
        enableReasoning={enableReasoning}
        setEnableReasoning={setEnableReasoning}
        showReasoningToggle={true}
        isExternalAgentSelected={isExternalAgentSelected}
        onShowReasoningInfo={() => setShowReasoningInfoModal(true)}
        conversations={conversations}
        currentConversationId={currentConversationId}
        loadConversation={loadConversation}
        confirmDeleteConversation={confirmDeleteConversation}
        confirmClearAllHistory={confirmClearAllHistory}
        onNewItem={startNewChat}
        newItemLabel="New Chat"
      />

      {/* Connector Info Modal */}
      {connectorInfoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>{connectorInfoModal.connector.display_name}</h3>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '1rem' }}>{connectorInfoModal.tools.length} tools available</div>
            {connectorInfoModal.tools.map((tool: { name: string; description: string }, i: number) => (
              <div key={i} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{tool.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{tool.description}</div>
              </div>
            ))}
            <button onClick={() => setConnectorInfoModal(null)} style={{ marginTop: '1rem', width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Close</button>
          </div>
        </div>
      )}

      {/* Persona View Modal */}
      {viewingPersona && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setViewingPersona(null)}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto', border: '1px solid rgba(245, 158, 11, 0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '2rem' }}>{viewingPersona.icon}</span>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>{viewingPersona.name}</h3>
                {viewingPersona.description && <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{viewingPersona.description}</p>}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>System Prompt</div>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                <pre style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', lineHeight: 1.5 }}>{viewingPersona.system_prompt}</pre>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{viewingPersona.prompt_token_count} tokens</span>
              <Link href="/dashboard" onClick={() => setViewingPersona(null)} style={{ color: '#a78bfa', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>✏️</span> Edit in Dashboard
              </Link>
            </div>

            <button onClick={() => setViewingPersona(null)} style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Close</button>
          </div>
        </div>
      )}

      {/* Reasoning Info Modal */}
      {showReasoningInfoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowReasoningInfoModal(false)}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', border: '1px solid rgba(139, 92, 246, 0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🧠</div>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>Reasoning for Connectors</h3>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem' }}>
                When enabled, the AI will use advanced reasoning to better orchestrate your connected tools and agents.
              </p>
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ color: '#f59e0b', fontSize: '1rem' }}>⚠️</span>
                  <div>
                    <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Token Usage</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                      Reasoning can consume more tokens. The additional tokens used will be displayed in the output tokens stats.
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowReasoningInfoModal(false)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                Close
              </button>
              <button onClick={() => setShowReasoningInfoModal(false)} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '320px', width: '100%', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗑️</div>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>
                {deleteConfirm.type === 'all' ? 'Clear All History?' : 'Delete Conversation?'}
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
                {deleteConfirm.type === 'all'
                  ? 'This will permanently delete all your conversations. This action cannot be undone.'
                  : 'This conversation will be permanently deleted.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={executeDelete} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Authentication Modal - uses common retry mechanism defined above */}
      {oauthModalData && (
        <OAuthAuthenticationModal
          isOpen={oauthModalOpen}
          serverName={oauthModalData.serverName}
          serverType={oauthModalData.serverType}
          serverId={oauthModalData.serverId}
          oauthConfig={oauthModalData.oauthConfig}
          onSuccess={handleOAuthSuccessRetry}
          onCancel={handleOAuthCancel}
        />
      )}
    </div>
  );
};
