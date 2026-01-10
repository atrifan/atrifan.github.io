'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
import { ChatIcon } from '../components/ChatIcon';
import { FaviconImage } from '../components/FaviconImage';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
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

// Connector types
type ConnectorType = 'internal_mcp' | 'external_mcp' | 'internal_agent' | 'external_agent';

interface ChatConnector {
  id: string;
  connector_type: ConnectorType;
  mcp_server_id?: string;
  external_url?: string;
  display_name: string;
  description?: string;
  icon: string;
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
  // Get tier and available models
  const tier = isPlus ? 'plus' : isPro ? 'pro' : 'free';
  const quota = TOKEN_QUOTAS[tier];
  const availableModels = AI_MODELS.filter(m => quota.models.includes(m.id));
  const defaultModel = availableModels[0]?.id || 'mistral/ministral-3b';

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Budget state
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  // Personality state
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activePersonalityIds, setActivePersonalityIds] = useState<string[]>([]);
  const [showPersonalities, setShowPersonalities] = useState(false);
  const [showCreatePersonality, setShowCreatePersonality] = useState(false);
  const [newPersonality, setNewPersonality] = useState({ name: '', description: '', icon: '🤖', systemPrompt: '' });
  const [creatingPersonality, setCreatingPersonality] = useState(false);

  // Last message token info
  const [lastMessageTokens, setLastMessageTokens] = useState<{ input: number; output: number } | null>(null);

  // Cost usage (will be fetched from API)
  const [costUsage, setCostUsage] = useState({
    used: 0,
    limit: quota.aiCostBudget,
  });

  const canAccessPro = isPro || isPlus;
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

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

  // Fetch conversations and connectors on mount
  useEffect(() => {
    if (canAccessPro) {
      fetchConversations();
      fetchCostUsage();
      fetchConnectors();
      fetchMcpServers();
      fetchAgents();
      fetchBudget();
      fetchPersonalities();
    }
  }, [canAccessPro]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    applySEO('chat');
  }, []);

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
      const response = await fetch('/api/ai/personalities');
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
        await fetch(`/api/ai/personalities/active?personalityId=${personalityId}`, { method: 'DELETE' });
        setActivePersonalityIds(prev => prev.filter(id => id !== personalityId));
      } else {
        await fetch('/api/ai/personalities/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalityId }),
        });
        setActivePersonalityIds(prev => [...prev, personalityId]);
      }
    } catch (err) {
      console.error('Failed to toggle personality:', err);
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
      const response = await fetch('/api/ai/connectors');
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
      const response = await fetch('/api/ai/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorType: 'internal_mcp',
          mcpServerId: server.id,
          displayName: server.display_name,
          description: `${server.toolCount} tools available`,
          icon: '🔧',
        }),
      });
      if (response.ok) {
        fetchConnectors();
        setShowAddConnector(null);
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
          description: `${server.toolCount} tools from ${server.source_url || 'external server'}`,
          icon: '🌐',
          externalUrl: server.source_url,
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
          description: agent.description || `A2A Agent at ${agent.agent_url}`,
          icon: '🤖',
          externalUrl: agent.agent_url,
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
      // Fetch tools for this connector's MCP server
      if (connector.mcp_server_id) {
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
          // Fallback - show modal with empty tools
          setConnectorInfoModal({ connector, tools: [] });
        }
      } else {
        // External connector - no tools to fetch
        setConnectorInfoModal({ connector, tools: [] });
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
        setSelectedModel(data.conversation.model_id);
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
    setMessages([]);
    setError(null);
  };

  // Send message handler
  const sendMessage = useCallback(async () => {
    if (!message.trim() || isLoading) return;

    // Check quota before sending
    if (isQuotaExceeded) {
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

    try {
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
        tokens: data.usage,
      };

      setMessages(prev => [...prev, assistantMessage]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [message, messages, selectedModel, tier, isLoading, isQuotaExceeded, currentConversationId, activePersonalities]);

  // Close all sidebars
  const closeSidebars = useCallback(() => {
    setShowHistory(false);
    setShowConnectors(false);
    setShowPersonalities(false);
  }, []);

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

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <UpgradeModal
          isOpen={true}
          title="AI Chat - Pro Feature"
          featureName="AI Chat with multiple models"
          showCloseButton={false}
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

  return (
    <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <View maxWidth="56rem" marginX="auto">
        {/* Back Button */}
        <div style={{ marginBottom: '2rem' }}>
          <BackToTools />
        </div>

        {/* Top Ad */}
        <AdBanner slot={ADS_CONFIG.slots.chatTop} format="horizontal" />

        {/* Hero Header - Centered like CUT */}
        <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
          <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
            <ChatIcon size={100} />
          </div>

          <h1 style={{
            fontSize: 'clamp(1.75rem, 6vw, 4rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em',
          }}>
            CHAT
          </h1>

          <p style={{
            fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.7)',
            maxWidth: '500px',
            margin: '0 auto 1rem',
          }}>
            Multi-model AI assistant with access to all your tools
          </p>

          {!canAccessPro && (
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              padding: '0.3rem 0.8rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-block',
            }}>
              PRO FEATURE
            </span>
          )}
        </View>

        {/* Action Buttons - Compact on mobile */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setShowHistory(!showHistory); setShowConnectors(false); setShowPersonalities(false); }} style={{ background: showHistory ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
            📜 History
          </button>
          <button onClick={() => { setShowConnectors(!showConnectors); setShowHistory(false); setShowPersonalities(false); }} style={{ background: showConnectors ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
            🔌 Connectors
          </button>
          <button onClick={() => { setShowPersonalities(!showPersonalities); setShowHistory(false); setShowConnectors(false); }} style={{ background: showPersonalities ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            🎭 Persona
            {activePersonalityIds.length > 0 && (
              <span style={{ background: '#f59e0b', color: '#000', borderRadius: '10px', padding: '0.1rem 0.35rem', fontSize: '0.65rem', fontWeight: 600 }}>
                {activePersonalityIds.length}
              </span>
            )}
          </button>
          <button onClick={startNewChat} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
            + New
          </button>
        </div>

        {/* Main Layout - Desktop: side-by-side, Mobile: stacked */}
        <div className={`chat-layout-grid ${!(showHistory || showConnectors || showPersonalities) ? 'no-sidebar' : ''}`}>
          {/* Left Panel - Shows when any panel is active */}
          {(showHistory || showConnectors || showPersonalities) && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', height: 'fit-content', maxHeight: '60vh', overflowY: 'auto' }}>
              {showHistory && (
                <div>
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📜 Chat History
                    {loadingHistory && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Loading...</span>}
                  </h3>
                  {conversations.length === 0 && !loadingHistory ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>
                      No conversations yet. Start chatting!
                    </p>
                  ) : (
                    conversations.map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        style={{
                          background: currentConversationId === conv.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          cursor: 'pointer',
                          border: currentConversationId === conv.id ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                        }}
                      >
                        <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.title}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                            {formatRelativeTime(conv.updated_at)}
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                            {conv.message_count} msgs
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <button onClick={startNewChat} style={{ width: '100%', background: 'rgba(139, 92, 246, 0.2)', border: '1px dashed rgba(139, 92, 246, 0.5)', borderRadius: '8px', padding: '0.75rem', color: '#a78bfa', cursor: 'pointer', marginTop: '0.5rem' }}>+ New Chat</button>
                </div>
              )}
              {showConnectors && (
                <div style={{ marginTop: showHistory ? '1.5rem' : 0 }}>
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🔌 Connectors
                    {loadingConnectors && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Loading...</span>}
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', margin: '0 0 1rem' }}>
                    Link MCP servers and agents to this chat
                  </p>

                  {/* Active Connectors */}
                  {connectors.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Active</div>
                      {connectors.map(conn => (
                        <div key={conn.id} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>{conn.icon}</span>
                              <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>{conn.display_name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              {conn.mcp_server_id ? (
                                <Link href={`/dashboard/mcp-composer?edit=${conn.mcp_server_id}`} style={{ textDecoration: 'none' }}>
                                  <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.1rem 0.25rem' }} title="Edit server">✏️</button>
                                </Link>
                              ) : conn.external_url ? (
                                <a href={conn.external_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                  <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.1rem 0.25rem' }} title="Open external URL">🔗</button>
                                </a>
                              ) : null}
                              <button onClick={() => showConnectorInfo(conn)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.1rem 0.25rem' }} title="View tools info">ⓘ</button>
                              <button onClick={() => removeConnector(conn.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '6px', background: conn.connector_type.includes('mcp') ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: conn.connector_type.includes('mcp') ? '#667eea' : '#f59e0b' }}>
                              {conn.connector_type.replace('_', ' ').toUpperCase()}
                            </span>
                            {conn.description && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{conn.description}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Connector Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <button onClick={() => setShowAddConnector(showAddConnector === 'internal_mcp' ? null : 'internal_mcp')} style={{ width: '100%', background: showAddConnector === 'internal_mcp' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '8px', padding: '0.6rem', color: '#667eea', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
                      🔧 Internal MCP Server
                    </button>
                    <button onClick={() => setShowAddConnector(showAddConnector === 'external_mcp' ? null : 'external_mcp')} style={{ width: '100%', background: showAddConnector === 'external_mcp' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '0.6rem', color: '#10b981', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
                      🌐 External MCP Server
                    </button>
                    <button disabled style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem', color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed', fontSize: '0.8rem', textAlign: 'left' }}>
                      🤖 Internal Agent <span style={{ fontSize: '0.65rem' }}>(Coming Soon)</span>
                    </button>
                    <button onClick={() => setShowAddConnector(showAddConnector === 'external_agent' ? null : 'external_agent')} style={{ width: '100%', background: showAddConnector === 'external_agent' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.6rem', color: '#f59e0b', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
                      🌍 External Agent
                    </button>
                  </div>

                  {/* Internal MCP Server Selection */}
                  {showAddConnector === 'internal_mcp' && (
                    <div style={{ marginTop: '0.75rem', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(102, 126, 234, 0.2)' }}>
                      <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.5rem' }}>Select Internal MCP Server</div>
                      {(() => {
                        const internalServers = availableMcpServers.filter(s => s.source_type === 'api_key');
                        if (internalServers.length === 0) {
                          return (
                            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>No internal servers created</p>
                              <Link href="/dashboard/mcp-composer" style={{ textDecoration: 'none' }}>
                                <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                                  + Create MCP Server
                                </button>
                              </Link>
                            </div>
                          );
                        }
                        return (
                          <>
                            {internalServers.map(server => {
                              const isLinked = connectors.some(c => c.mcp_server_id === server.id);
                              return (
                                <div key={server.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '0.4rem' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span style={{ fontSize: '1rem' }}>🔧</span>
                                      <span style={{ color: '#fff', fontSize: '0.8rem' }}>{server.display_name}</span>
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginLeft: '1.35rem' }}>{server.toolCount} tools</div>
                                  </div>
                                  {isLinked ? (
                                    <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓ Linked</span>
                                  ) : (
                                    <button onClick={() => addInternalMcpConnector(server)} style={{ background: 'rgba(139, 92, 246, 0.3)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', color: '#a78bfa', cursor: 'pointer', fontSize: '0.75rem' }}>
                                      + Add
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            <Link href="/dashboard/mcp-composer" style={{ textDecoration: 'none' }}>
                              <button style={{ width: '100%', background: 'rgba(139, 92, 246, 0.2)', border: '1px dashed rgba(139, 92, 246, 0.5)', borderRadius: '6px', padding: '0.5rem', color: '#a78bfa', cursor: 'pointer', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                                + Create New MCP Server
                              </button>
                            </Link>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* External MCP Server Selection */}
                  {showAddConnector === 'external_mcp' && (
                    <div style={{ marginTop: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.5rem' }}>Select External MCP Server</div>
                      {(() => {
                        const externalServers = availableMcpServers.filter(s => s.source_type === 'mcp_import');
                        if (externalServers.length === 0) {
                          return (
                            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>No external servers imported</p>
                              <Link href="/dashboard/mcp-import" style={{ textDecoration: 'none' }}>
                                <button style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                                  + Import External Server
                                </button>
                              </Link>
                            </div>
                          );
                        }
                        return (
                          <>
                            {externalServers.map(server => {
                              const isLinked = connectors.some(c => c.mcp_server_id === server.id);
                              return (
                                <div key={server.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '0.4rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                                    <FaviconImage
                                      baseUrl={server.source_url}
                                      alt={server.display_name}
                                      size={20}
                                      borderRadius={4}
                                      fallbackEmoji="🌐"
                                      fallbackBgColor="rgba(16, 185, 129, 0.2)"
                                    />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ color: '#fff', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.display_name}</div>
                                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{server.toolCount} tools</div>
                                    </div>
                                  </div>
                                  {isLinked ? (
                                    <span style={{ color: '#10b981', fontSize: '0.75rem', flexShrink: 0 }}>✓ Linked</span>
                                  ) : (
                                    <button onClick={() => addExternalMcpConnector(server)} style={{ background: 'rgba(16, 185, 129, 0.3)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', color: '#10b981', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>
                                      + Add
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            <Link href="/dashboard/mcp-import" style={{ textDecoration: 'none' }}>
                              <button style={{ width: '100%', background: 'rgba(16, 185, 129, 0.2)', border: '1px dashed rgba(16, 185, 129, 0.5)', borderRadius: '6px', padding: '0.5rem', color: '#10b981', cursor: 'pointer', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                                + Import New External Server
                              </button>
                            </Link>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* External Agent Selection */}
                  {showAddConnector === 'external_agent' && (
                    <div style={{ marginTop: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                      <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.5rem' }}>Select External Agent</div>
                      {availableAgents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>No external agents imported</p>
                          <Link href="/dashboard/a2a-import" style={{ textDecoration: 'none' }}>
                            <button style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                              + Import External Agent
                            </button>
                          </Link>
                        </div>
                      ) : (
                        <>
                          {availableAgents.map(agent => {
                            const isLinked = connectors.some(c => c.external_url === agent.agent_url);
                            return (
                              <div key={agent.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '0.4rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                                  <FaviconImage
                                    iconUrl={agent.icon_url}
                                    baseUrl={agent.agent_url}
                                    alt={agent.display_name}
                                    size={20}
                                    borderRadius={4}
                                    fallbackEmoji="🤖"
                                    fallbackBgColor="rgba(245, 158, 11, 0.2)"
                                  />
                                  <span style={{ color: '#fff', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.display_name}</span>
                                </div>
                                {isLinked ? (
                                  <span style={{ color: '#f59e0b', fontSize: '0.75rem', flexShrink: 0 }}>✓ Linked</span>
                                ) : (
                                  <button onClick={() => addExternalAgentConnector(agent)} style={{ background: 'rgba(245, 158, 11, 0.3)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', color: '#f59e0b', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>
                                    + Add
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          <Link href="/dashboard/a2a-import" style={{ textDecoration: 'none' }}>
                            <button style={{ width: '100%', background: 'rgba(245, 158, 11, 0.2)', border: '1px dashed rgba(245, 158, 11, 0.5)', borderRadius: '6px', padding: '0.5rem', color: '#f59e0b', cursor: 'pointer', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                              + Import New External Agent
                            </button>
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Personalities Panel */}
              {showPersonalities && (
                <div style={{ marginTop: (showHistory || showConnectors) ? '1.5rem' : 0 }}>
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🎭 Personalities
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
                    Define system prompts that shape AI behavior
                  </p>

                  {/* Active personalities summary */}
                  {activePersonalityIds.length > 0 && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 500 }}>
                        {activePersonalityIds.length} active • ~{totalSystemPromptTokens} tokens
                      </div>
                    </div>
                  )}

                  {/* Personality list */}
                  {personalities.map(p => {
                    const isActive = activePersonalityIds.includes(p.id);
                    return (
                      <div key={p.id} style={{ background: isActive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)', border: isActive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{p.icon}</span>
                            <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>{p.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>~{p.prompt_token_count}t</span>
                            <button onClick={() => togglePersonality(p.id)} style={{ background: isActive ? '#f59e0b' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.4rem', color: isActive ? '#000' : '#fff', cursor: 'pointer', fontSize: '0.65rem' }}>
                              {isActive ? '✓' : '+'}
                            </button>
                            <button onClick={() => deletePersonality(p.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                          </div>
                        </div>
                        {p.description && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '0.25rem' }}>{p.description}</div>}
                      </div>
                    );
                  })}

                  {/* Create new personality */}
                  {showCreatePersonality ? (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', padding: '0.75rem', marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Name"
                        value={newPersonality.name}
                        onChange={(e) => setNewPersonality(prev => ({ ...prev, name: e.target.value }))}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem', marginBottom: '0.4rem' }}
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={newPersonality.description}
                        onChange={(e) => setNewPersonality(prev => ({ ...prev, description: e.target.value }))}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem', marginBottom: '0.4rem' }}
                      />
                      <textarea
                        placeholder="System prompt..."
                        value={newPersonality.systemPrompt}
                        onChange={(e) => setNewPersonality(prev => ({ ...prev, systemPrompt: e.target.value }))}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem', minHeight: '80px', resize: 'vertical', marginBottom: '0.4rem' }}
                      />
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                        ~{Math.ceil((newPersonality.systemPrompt?.length || 0) / 4)} tokens
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={createPersonality} disabled={creatingPersonality || !newPersonality.name || !newPersonality.systemPrompt} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: 'none', background: '#f59e0b', color: '#000', cursor: 'pointer', fontSize: '0.8rem', opacity: (!newPersonality.name || !newPersonality.systemPrompt) ? 0.5 : 1 }}>
                          {creatingPersonality ? '...' : 'Create'}
                        </button>
                        <button onClick={() => { setShowCreatePersonality(false); setNewPersonality({ name: '', description: '', icon: '🤖', systemPrompt: '' }); }} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowCreatePersonality(true)} style={{ width: '100%', background: 'rgba(245, 158, 11, 0.2)', border: '1px dashed rgba(245, 158, 11, 0.5)', borderRadius: '8px', padding: '0.6rem', color: '#f59e0b', cursor: 'pointer', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                      + Create Personality
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Main Chat Area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Budget Usage Bar */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>💰</span>
                  <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Monthly Budget</span>
                  <span style={{
                    background: tier === 'plus' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    color: '#fff',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '8px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                  }}>
                    {tier.toUpperCase()}
                  </span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
                  {formatCurrency(totalCostSpent)} / {formatCurrency(monthlyBudget)}
                </span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', height: '12px', overflow: 'hidden' }}>
                <div style={{
                  width: `${budgetUsagePercent}%`,
                  height: '100%',
                  background: budgetUsagePercent > 90 ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                    : budgetUsagePercent > 70 ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : 'linear-gradient(90deg, #10b981, #059669)',
                  borderRadius: '10px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                  {formatCurrency(budgetData?.usage.totalCost || costUsage.used)} spent
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Estimated tokens remaining for selected model */}
                  <span style={{ color: '#60a5fa', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem' }}>🎯</span>
                    ~{formatTokenCount(estimatedTokensRemaining)} tokens left
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>({selectedModelData?.name})</span>
                  </span>
                  {isBudgetExceeded ? (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
                      ⚠️ Budget exceeded
                    </span>
                  ) : budgetUsagePercent > 80 ? (
                    <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>
                      {formatCurrency(remainingBudget)} left
                    </span>
                  ) : (
                    <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer' }}>
                        ⚙️ Adjust
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Model Selector with Budget Donut */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {tier === 'plus' ? 'Select Model' : 'Your Model'}
                </h3>
                {tier === 'pro' && (
                  <Link href="/pricing" style={{ textDecoration: 'none' }}>
                    <span style={{ color: '#f59e0b', fontSize: '0.75rem', cursor: 'pointer' }}>
                      ⬆️ Upgrade to Plus for more models
                    </span>
                  </Link>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                {availableModels.map(model => {
                  const modelBudget = budgetData?.models.find(m => m.modelId === model.id);
                  const modelUsagePercent = modelBudget?.usagePercent || 0;
                  const isSelected = selectedModel === model.id;

                  return (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      style={{
                        background: isSelected
                          ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                          : 'rgba(255,255,255,0.08)',
                        border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        padding: '0.75rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        position: 'relative',
                      }}
                    >
                      {/* Donut chart in corner */}
                      <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <UsageDonut percent={modelUsagePercent} size={28} strokeWidth={3} />
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem' }}>
                          {Math.round(100 - modelUsagePercent)}%
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span>{model.icon}</span>
                        <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{model.name}</span>
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>{model.provider}</div>

                      {/* Budget info for this model */}
                      {modelBudget && (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>
                            <span>Used: {formatTokenCount(modelBudget.usedTokens)}</span>
                            <span>{formatCurrency(modelBudget.usedCost)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.15rem' }}>
                            <span>Safe: {formatTokenCount(modelBudget.safeTokensForBudget)}</span>
                            <span>{formatTokenCount(modelBudget.remainingTokens)} left</span>
                          </div>
                        </div>
                      )}

                      {/* Cost badges */}
                      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.55rem',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#10b981',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '6px',
                        }}>
                          ${model.inputCostPer1M}/M in
                        </span>
                        <span style={{
                          fontSize: '0.55rem',
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: '#60a5fa',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '6px',
                        }}>
                          ${model.outputCostPer1M}/M out
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chat Messages Area */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
              {/* Messages or Empty state */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '500px' }}>
                {messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', height: '100%' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{selectedModelData?.icon || '🤖'}</div>
                    <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: '0 0 0.5rem' }}>Start chatting with {selectedModelData?.name}</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '400px' }}>
                      Ask questions, get help with calculations, or explore your connected tools.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                      {['Calculate my budget', 'Help me sleep better', 'What\'s my trading risk?', 'Convert units'].map(suggestion => (
                        <button key={suggestion} onClick={() => setMessage(suggestion)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '0.5rem 1rem', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '0.85rem' }}>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {messages.map((msg) => (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '80%',
                          padding: '0.875rem 1rem',
                          borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: msg.role === 'user' ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'rgba(255,255,255,0.1)',
                          color: '#fff',
                        }}>
                          {msg.role === 'assistant' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                              <span>{selectedModelData?.icon}</span>
                              <span>{selectedModelData?.name}</span>
                            </div>
                          )}
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>
                          {msg.tokens && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>
                                ↑ {msg.tokens.input}
                              </span>
                              <span style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#60a5fa' }}>
                                ↓ {msg.tokens.output}
                              </span>
                              <span>= {msg.tokens.input + msg.tokens.output} tokens</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ padding: '0.875rem 1rem', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.1)' }}>
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <span style={{ animation: 'pulse 1s infinite', animationDelay: '0s' }}>●</span>
                            <span style={{ animation: 'pulse 1s infinite', animationDelay: '0.2s' }}>●</span>
                            <span style={{ animation: 'pulse 1s infinite', animationDelay: '0.4s' }}>●</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#ef4444', fontSize: '0.85rem' }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Last Message Token Summary */}
              {lastMessageTokens && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>Last message:</span>
                    <span style={{ color: '#10b981' }}>↑ {lastMessageTokens.input} in</span>
                    <span style={{ color: '#60a5fa' }}>↓ {lastMessageTokens.output} out</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>= {lastMessageTokens.input + lastMessageTokens.output} total</span>
                  </div>
                  {activePersonalityIds.length > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
                      🎭 ~{totalSystemPromptTokens}t system
                    </div>
                  )}
                </div>
              )}

              {/* Input Area */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '1rem' }}>
                {/* Model Selector Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Model:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      padding: '0.4rem 0.6rem',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none',
                      appearance: 'none',
                      paddingRight: '1.5rem',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.5rem center',
                    }}
                  >
                    {availableModels.map(m => (
                      <option key={m.id} value={m.id} style={{ background: '#1a1a2e' }}>
                        {m.icon} {m.name}
                      </option>
                    ))}
                  </select>
                  {tier === 'pro' && (
                    <Link href="/pricing" style={{ textDecoration: 'none' }}>
                      <span style={{ color: '#f59e0b', fontSize: '0.7rem', cursor: 'pointer' }}>⬆️ More models</span>
                    </Link>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); adjustTextareaHeight(); }}
                    onKeyDown={handleKeyDown}
                    onFocus={closeSidebars}
                    placeholder={isQuotaExceeded ? 'Quota exceeded - upgrade or wait until next month' : `Message ${selectedModelData?.name}...`}
                    disabled={isQuotaExceeded || isLoading}
                    rows={3}
                    style={{
                      flex: 1,
                      background: isQuotaExceeded ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${isQuotaExceeded ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: '0.75rem',
                      padding: '0.875rem 1rem',
                      color: '#fff',
                      fontSize: '1rem', // 16px minimum prevents iOS zoom
                      outline: 'none',
                      opacity: isQuotaExceeded ? 0.6 : 1,
                      resize: 'none',
                      minHeight: '5rem', // ~3 lines
                      maxHeight: '12.5rem',
                      lineHeight: '1.5',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => { closeSidebars(); sendMessage(); }}
                    disabled={isQuotaExceeded || isLoading || !message.trim()}
                    title={isLoading ? 'Sending...' : 'Send message (Enter)'}
                    style={{
                      background: isQuotaExceeded ? 'rgba(100,100,100,0.5)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                      border: 'none',
                      borderRadius: '0.75rem',
                      width: '3rem',
                      height: '3rem',
                      color: '#fff',
                      cursor: isQuotaExceeded || isLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: (!message.trim() || isLoading) ? 0.6 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {isLoading ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </button>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 'clamp(0.7rem, 1.5vw, 0.8rem)', textAlign: 'center', marginTop: '0.5rem' }}>
                  Enter to send • ⌘+Enter for new line • {formatCurrency(remainingBudget)} left • ~{formatTokenCount(estimatedTokensRemaining)} tokens
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Banner */}
        <AdBanner slot={ADS_CONFIG.slots.chatBottom} format="horizontal" style={{ marginTop: '1.5rem' }} />
        <Footer />

        {/* Connector Info Modal */}
        {connectorInfoModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConnectorInfoModal(null)}>
            <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '1.5rem', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>{connectorInfoModal.connector.icon} {connectorInfoModal.connector.display_name}</h3>
                <button onClick={() => setConnectorInfoModal(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>×</button>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: connectorInfoModal.connector.connector_type.includes('mcp') ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: connectorInfoModal.connector.connector_type.includes('mcp') ? '#667eea' : '#f59e0b' }}>
                  {connectorInfoModal.connector.connector_type.replace('_', ' ').toUpperCase()}
                </span>
                {connectorInfoModal.connector.description && (
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{connectorInfoModal.connector.description}</p>
                )}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {connectorInfoModal.tools.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.4)' }}>
                    <p style={{ margin: 0 }}>No tools available or unable to fetch tools.</p>
                    {connectorInfoModal.connector.external_url && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>External URL: {connectorInfoModal.connector.external_url}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                      {connectorInfoModal.tools.length} tool{connectorInfoModal.tools.length !== 1 ? 's' : ''} available
                    </div>
                    {connectorInfoModal.tools.map((tool: any, idx: number) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem', marginBottom: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h4 style={{ color: '#667eea', margin: '0 0 0.5rem', fontSize: '0.95rem' }}>{tool.name}</h4>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>{tool.description}</p>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Input Schema:</span>
                            <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.7rem', color: '#a78bfa', margin: 0, overflow: 'auto', maxHeight: '100px' }}>
                              {JSON.stringify(tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }, null, 2)}
                            </pre>
                          </div>
                          {(tool.outputSchema || tool.output_schema) && (
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Output Schema:</span>
                              <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.7rem', color: '#10b981', margin: 0, overflow: 'auto', maxHeight: '100px' }}>
                                {JSON.stringify(tool.outputSchema || tool.output_schema || { type: 'object' }, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setConnectorInfoModal(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Close</button>
              </div>
            </div>
          </div>
        )}
      </View>
    </View>
  );
};

