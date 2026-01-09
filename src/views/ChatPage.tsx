'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
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
  const [showAddConnector, setShowAddConnector] = useState<ConnectorType | null>(null);
  const [loadingConnectors, setLoadingConnectors] = useState(false);

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

  // Token usage (will be fetched from API)
  const [tokenUsage, setTokenUsage] = useState({
    used: 0,
    limit: quota.monthlyTokens,
  });

  const canAccessPro = isPro || isPlus;
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  // Budget-based calculations
  const monthlyBudget = budgetData?.budget.monthlyBudgetUsd || DEFAULT_MONTHLY_BUDGET;
  const totalCostSpent = budgetData?.usage.totalCost || 0;
  const budgetUsagePercent = getBudgetUsagePercent(totalCostSpent, monthlyBudget);
  const isBudgetExceeded = totalCostSpent >= monthlyBudget;

  // Get selected model's budget info
  const selectedModelBudget = budgetData?.models.find(m => m.modelId === selectedModel);

  // Calculate active personalities token count
  const activePersonalities = personalities.filter(p => activePersonalityIds.includes(p.id));
  const totalSystemPromptTokens = activePersonalities.reduce((sum, p) => sum + p.prompt_token_count, 0);

  // Legacy token-based (fallback)
  const usagePercent = budgetData ? budgetUsagePercent : getUsagePercentage(tokenUsage.used, tier);
  const isQuotaExceeded = budgetData ? isBudgetExceeded : tokenUsage.used >= tokenUsage.limit;

  // Fetch conversations and connectors on mount
  useEffect(() => {
    if (canAccessPro) {
      fetchConversations();
      fetchTokenUsage();
      fetchConnectors();
      fetchMcpServers();
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

  // Fetch token usage
  const fetchTokenUsage = async () => {
    try {
      const response = await fetch('/api/ai/usage', {
        headers: { 'x-user-tier': tier },
      });
      if (response.ok) {
        const data = await response.json();
        setTokenUsage({
          used: data.totalTokens || 0,
          limit: data.quota?.monthlyTokens || quota.monthlyTokens,
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
        if (errorData.reason === 'quota_exceeded') {
          setTokenUsage(prev => ({ ...prev, used: prev.limit }));
          throw new Error('Monthly token quota exceeded. Resets on the 1st.');
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
        setTokenUsage(prev => ({
          ...prev,
          used: prev.used + data.usage.input + data.usage.output,
        }));
        // Refresh budget data to update the display
        fetchBudget();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [message, messages, selectedModel, tier, isLoading, isQuotaExceeded, currentConversationId, activePersonalities]);

  // Handle Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

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
            {/* Chat Icon */}
            <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="chatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="url(#chatGradient)" opacity="0.2" />
              <path d="M30 35C30 31.6863 32.6863 29 36 29H64C67.3137 29 70 31.6863 70 35V55C70 58.3137 67.3137 61 64 61H45L35 71V61H36C32.6863 61 30 58.3137 30 55V35Z" stroke="url(#chatGradient)" strokeWidth="3" fill="none" />
              <circle cx="42" cy="45" r="3" fill="url(#chatGradient)" />
              <circle cx="50" cy="45" r="3" fill="url(#chatGradient)" />
              <circle cx="58" cy="45" r="3" fill="url(#chatGradient)" />
            </svg>
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

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ background: showHistory ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            📜 History
          </button>
          <button onClick={() => setShowConnectors(!showConnectors)} style={{ background: showConnectors ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            🔌 Connectors
          </button>
          <button onClick={() => setShowPersonalities(!showPersonalities)} style={{ background: showPersonalities ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            🎭 Personalities
            {activePersonalityIds.length > 0 && (
              <span style={{ background: '#f59e0b', color: '#000', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.7rem', fontWeight: 600 }}>
                {activePersonalityIds.length}
              </span>
            )}
          </button>
          <button onClick={startNewChat} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            + New Chat
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: (showHistory || showConnectors || showPersonalities) ? '280px 1fr' : '1fr', gap: '1rem' }}>
          {/* Sidebar */}
          {(showHistory || showConnectors || showPersonalities) && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '600px', overflowY: 'auto' }}>
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
                            <button onClick={() => removeConnector(conn.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
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
                    <Link href="/dashboard/mcp-import" style={{ textDecoration: 'none' }}>
                      <button style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '8px', padding: '0.6rem', color: '#667eea', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
                        🌐 External MCP Server
                      </button>
                    </Link>
                    <button disabled style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem', color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed', fontSize: '0.8rem', textAlign: 'left' }}>
                      🤖 Internal Agent <span style={{ fontSize: '0.65rem' }}>(Coming Soon)</span>
                    </button>
                    <button disabled style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem', color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed', fontSize: '0.8rem', textAlign: 'left' }}>
                      🌍 External Agent <span style={{ fontSize: '0.65rem' }}>(Coming Soon)</span>
                    </button>
                  </div>

                  {/* Internal MCP Server Selection */}
                  {showAddConnector === 'internal_mcp' && (
                    <div style={{ marginTop: '0.75rem', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(102, 126, 234, 0.2)' }}>
                      <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.5rem' }}>Select MCP Server</div>
                      {availableMcpServers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>No servers available</p>
                          <Link href="/dashboard/mcp-composer" style={{ textDecoration: 'none' }}>
                            <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                              + Create MCP Server
                            </button>
                          </Link>
                        </div>
                      ) : (
                        <>
                          {availableMcpServers.map(server => {
                            const isLinked = connectors.some(c => c.mcp_server_id === server.id);
                            const sourceLabel = server.source_type === 'api_key' ? '🔧 Native' : server.source_type === 'mcp_import' ? '🔌 MCP' : '📦';
                            return (
                              <div key={server.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '0.4rem' }}>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{ color: '#fff', fontSize: '0.8rem' }}>{server.display_name}</span>
                                    <span style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '0.1rem 0.3rem', borderRadius: '4px', fontSize: '0.6rem' }}>{sourceLabel}</span>
                                  </div>
                                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{server.toolCount} tools</div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                  {formatTokenCount(budgetData?.usage.totalTokens || tokenUsage.used)} tokens used
                </span>
                {isBudgetExceeded ? (
                  <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
                    ⚠️ Budget exceeded - Resets on 1st
                  </span>
                ) : budgetUsagePercent > 80 ? (
                  <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>
                    {formatCurrency(monthlyBudget - totalCostSpent)} remaining
                  </span>
                ) : (
                  <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer' }}>
                      ⚙️ Adjust budget
                    </span>
                  </Link>
                )}
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
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isQuotaExceeded ? 'Quota exceeded - upgrade or wait until next month' : `Message ${selectedModelData?.name}...`}
                    disabled={isQuotaExceeded || isLoading}
                    style={{
                      flex: 1,
                      background: isQuotaExceeded ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${isQuotaExceeded ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: '12px',
                      padding: '0.875rem 1rem',
                      color: '#fff',
                      fontSize: '0.95rem',
                      outline: 'none',
                      opacity: isQuotaExceeded ? 0.6 : 1,
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={isQuotaExceeded || isLoading || !message.trim()}
                    style={{
                      background: isQuotaExceeded ? 'rgba(100,100,100,0.5)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '0 1.5rem',
                      color: '#fff',
                      cursor: isQuotaExceeded || isLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      opacity: (!message.trim() || isLoading) ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? 'Sending...' : 'Send'} <span>→</span>
                  </button>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.75rem' }}>
                  Press Enter to send • {formatTokenCount(tokenUsage.limit - tokenUsage.used)} tokens remaining this month
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Banner */}
        <AdBanner slot={ADS_CONFIG.slots.chatBottom} format="horizontal" style={{ marginTop: '1.5rem' }} />
        <Footer />
      </View>
    </View>
  );
};

