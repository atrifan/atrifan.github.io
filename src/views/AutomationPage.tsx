'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
import { MermaidDiagram } from '../components/MermaidDiagram';
import { AutomationIcon } from '../components/AutomationIcon';
import { FaviconImage } from '../components/FaviconImage';
import { ChatInputArea } from '../components/ChatInputArea';
import { SettingsPanel, SettingsPanelMode } from '../components/SettingsPanel';
import { RetrievalEventsDisplay, RetrievalEventsData, RAGRetrievalEvent, HistoryMatchEvent } from '../components/RetrievalEventsDisplay';
import { applySEO } from '../utils/seo';
import { AI_MODELS, TOKEN_QUOTAS, formatCurrency, formatTokenCount, DEFAULT_MONTHLY_BUDGET } from '../config/ai-tokens.config';

interface AutomationPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

interface Automation {
  id: string;
  name: string;
  description: string;
  mermaid_diagram: string;
  flow_definition: { nodes: FlowNode[]; edges: FlowEdge[] };
  typescript_code: string | null;
  model_id: string;
  personality_ids: string[];
  schedule_type: string;
  schedule_config: Record<string, unknown>;
  status: string;
  total_runs: number;
  created_at: string;
  updated_at: string;
}

interface FlowNode {
  id: string;
  type: 'start' | 'end' | 'skill' | 'if' | 'else' | 'for' | 'while' | 'ai';
  label: string;
  config?: Record<string, unknown>;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

interface PromptHistory {
  id: string;
  prompt: string;
  response_mermaid: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

interface ExportHistory {
  id: string;
  mermaid_diagram: string;
  typescript_code: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

interface Personality {
  id: string;
  name: string;
  icon: string;
  description?: string;
  system_prompt: string;
  prompt_token_count: number;
  is_default: boolean;
}

interface MCPTool {
  server: string;
  serverId?: string;
  name: string;
  description: string;
  sourceType?: 'native' | 'api_key' | 'mcp_import';
  sourceUrl?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  hasWidget?: boolean;
}

interface BudgetData {
  budget: { monthlyBudgetUsd: number };
  usage: { totalCost: number; budgetUsedPercent: number; remainingBudget: number; totalTokens: number; byModel?: Record<string, { inputTokens: number; outputTokens: number }> };
  models: Array<{ modelId: string; usedCost: number; requestCount: number; usagePercent: number }>;
}

interface Connector {
  id: string;
  display_name: string;
  connector_type: 'native' | 'internal_mcp' | 'external_mcp' | 'internal_agent' | 'external_agent';
  icon?: string;
  icon_url?: string | null;
  external_url?: string | null;
  mcp_server_id?: string | null;
  a2a_agent_id?: string | null;
  api_key_id?: string | null;
}

interface MCPServer {
  id: string;
  display_name: string;
  server_name: string;
  source_type?: 'native' | 'api_key' | 'mcp_import';
  source_url: string;
  toolCount: number;
  category?: string;
}

// Schedule options
// TODO: Webhook trigger implementation:
// - Will provide a unique URL: {host}/api/{user_api_key}/hook/{automation_id}
// - user_api_key is stored in user_api_keys table (to be created)
// - Automations are linked to users via user_id column
// - Flow when webhook is called:
//   1. Extract api_key from URL path
//   2. Lookup user_id from user_api_keys table, validate key is active
//   3. Check user's subscription plan (rate limits, allowed triggers)
//   4. Validate automation_id exists and belongs to this user
//   5. Trigger the automation execution
//   6. Return execution result or queue confirmation
const SCHEDULE_OPTIONS = [
  { id: 'manual', label: 'Manual', icon: '▶️' },
  { id: 'daily', label: 'Daily', icon: '📅' },
  { id: 'weekly', label: 'Weekly', icon: '📆' },
  { id: 'monthly', label: 'Monthly', icon: '🗓️' },
  { id: 'cron', label: 'Cron', icon: '⚙️' },
  { id: 'webhook', label: 'Webhook', icon: '🔗', comingSoon: true },
];

export const AutomationPage: React.FC<AutomationPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  // Core state
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [currentAutomation, setCurrentAutomation] = useState<Automation | null>(null);
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportHistory[]>([]);

  // Builder state
  const [prompt, setPrompt] = useState('');
  const [mermaidDiagram, setMermaidDiagram] = useState('flowchart TD\n  start([Start]) --> end_node([End])');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastExplanation, setLastExplanation] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Model & personality - default will be set based on tier in useEffect
  const [selectedModel, setSelectedModel] = useState('');
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activePersonalityIds, setActivePersonalityIds] = useState<string[]>([]);

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

  // MCP tools
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set()); // Which servers' tools to use

  // Budget
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  // UI state
  const [view, setView] = useState<'list' | 'builder' | 'history' | 'code'>('list');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [automationName, setAutomationName] = useState('');
  const [automationDescription, setAutomationDescription] = useState('');
  const [selectedSchedule, setSelectedSchedule] = useState('manual');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedCode, setExportedCode] = useState('');
  const [lastTokenUsage, setLastTokenUsage] = useState<{ input: number; output: number } | null>(null);
  const [toolInfoModal, setToolInfoModal] = useState<{ server: string; tools: MCPTool[] } | null>(null);

  // No connectors error modal state
  const [showNoConnectorsModal, setShowNoConnectorsModal] = useState(false);

  // Settings panel state
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsPanelMode, setSettingsPanelMode] = useState<SettingsPanelMode>('main');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [availableMcpServers, setAvailableMcpServers] = useState<MCPServer[]>([]);
  const [viewingPersona, setViewingPersona] = useState<Personality | null>(null);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // History memory state (embeds automation prompts to Upstash for semantic search)
  const [historyMemoryEnabled, setHistoryMemoryEnabled] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Send recent history toggle (last 2-4 exchanges for immediate context)
  // Disable for agents that don't support multiple text parts
  const [sendRecentHistory, setSendRecentHistory] = useState(true);

  // Settings persistence - track if settings have been loaded from server
  const settingsLoadedRef = useRef(false);
  const [historySearchResults, setHistorySearchResults] = useState<Array<{ chatId: string; topScore: number; messages: Array<{ content: string; messageType: string }> }>>([]);
  const [isSearchingHistory, setIsSearchingHistory] = useState(false);

  // Retrieval events state (RAG + history context for current prompt)
  const [retrievalEvents, setRetrievalEvents] = useState<RetrievalEventsData>({});

  // Check screen size for responsive layout
  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Group tools by server
  const toolsByServer = useMemo(() => {
    const grouped: Record<string, MCPTool[]> = {};
    mcpTools.forEach(tool => {
      if (!grouped[tool.server]) {
        grouped[tool.server] = [];
      }
      grouped[tool.server].push(tool);
    });
    return grouped;
  }, [mcpTools]);

  // Get tools from selected servers only
  const activeTools = useMemo(() => {
    if (selectedServers.size === 0) return mcpTools; // All if none selected
    return mcpTools.filter(tool => selectedServers.has(tool.server));
  }, [mcpTools, selectedServers]);

  // Group automations into folders by schedule type (or use a default folder)
  const automationFolders = useMemo(() => {
    const folders: Record<string, Automation[]> = {};
    automations.forEach(auto => {
      const folderName = auto.schedule_type === 'manual' ? '📁 Manual' :
                         auto.schedule_type === 'daily' ? '📅 Daily' :
                         auto.schedule_type === 'weekly' ? '📆 Weekly' :
                         auto.schedule_type === 'monthly' ? '🗓️ Monthly' :
                         auto.schedule_type === 'cron' ? '⚙️ Cron' : '📁 Other';
      if (!folders[folderName]) folders[folderName] = [];
      folders[folderName].push(auto);
    });
    return Object.entries(folders).map(([name, autos]) => ({ name, automations: autos }));
  }, [automations]);

  const toggleServerExpand = (server: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(server)) {
        next.delete(server);
      } else {
        next.add(server);
      }
      return next;
    });
  };

  const toggleServerSelect = (server: string) => {
    setSelectedServers(prev => {
      const next = new Set(prev);
      if (next.has(server)) {
        next.delete(server);
      } else {
        next.add(server);
      }
      return next;
    });
  };

  // Select all servers by default when tools load
  useEffect(() => {
    if (mcpTools.length > 0 && selectedServers.size === 0) {
      const allServers = new Set(mcpTools.map(t => t.server));
      setSelectedServers(allServers);
    }
  }, [mcpTools]);

  const canAccessPro = isPro || isPlus;
  const tier = isPlus ? 'plus' : isPro ? 'pro' : 'free';
  const quota = TOKEN_QUOTAS[tier];
  const availableModels = AI_MODELS.filter(m => quota.models.includes(m.id));
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  // Set default model based on tier
  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      setSelectedModel(availableModels[0].id);
    }
  }, [availableModels, selectedModel]);

  // Add class to body for hiding iubenda
  useEffect(() => {
    document.body.classList.add('automation-page-active');
    return () => {
      document.body.classList.remove('automation-page-active');
    };
  }, []);

  // Persist settings when they change
  useEffect(() => {
    saveAutomationSetting('historyMemoryEnabled', historyMemoryEnabled);
  }, [historyMemoryEnabled]);

  useEffect(() => {
    saveAutomationSetting('sendRecentHistory', sendRecentHistory);
  }, [sendRecentHistory]);

  // Save selected model when it changes (but not when loading an automation)
  useEffect(() => {
    if (selectedModel && !currentAutomation) {
      saveAutomationSetting('defaultModel', selectedModel);
    }
  }, [selectedModel, currentAutomation]);

  // Fetch data on mount
  useEffect(() => {
    applySEO('automation');
    if (canAccessPro) {
      fetchAutomations();
      fetchBudget();
      fetchPersonalities();
      fetchRags();
      fetchMcpTools();
      fetchConnectors();
      fetchAvailableMcpServers();
      fetchAutomationSettings();
    }
  }, [canAccessPro]);

  const fetchAutomations = async () => {
    try {
      const response = await fetch('/api/ai/automations');
      if (response.ok) {
        const data = await response.json();
        setAutomations(data.automations || []);
      }
    } catch (error) {
      console.error('Failed to fetch automations:', error);
    }
  };

  const fetchBudget = async () => {
    try {
      const response = await fetch('/api/ai/budget');
      if (response.ok) {
        const data = await response.json();
        setBudgetData(data);
      }
    } catch (error) {
      console.error('Failed to fetch budget:', error);
    }
  };

  const fetchPersonalities = async () => {
    try {
      const response = await fetch('/api/ai/personalities?context=automation');
      if (response.ok) {
        const data = await response.json();
        setPersonalities(data.personalities || []);
        // Load active personality IDs from DB for automation context
        // Only if we don't have a current automation loaded (which has its own personality_ids)
        if (!currentAutomation) {
          setActivePersonalityIds(data.activeIds || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch personalities:', error);
    }
  };

  const fetchMcpTools = async () => {
    try {
      const allTools: MCPTool[] = [];

      // 1. Fetch native tools from /api/tools
      try {
        const toolsResponse = await fetch('/api/tools');
        if (toolsResponse.ok) {
          const toolsData = await toolsResponse.json();
          for (const tool of toolsData.tools || []) {
            allTools.push({ server: 'default', name: tool.name, description: tool.description, sourceType: 'native' });
          }
        }
      } catch (err) {
        console.error('Failed to fetch native tools:', err);
      }

      // 2. Fetch user's API key servers with their tools
      try {
        const serversResponse = await fetch('/api/servers');
        if (serversResponse.ok) {
          const serversData = await serversResponse.json();
          for (const server of serversData.servers || []) {
            // Skip default server since we already got native tools
            if (server.serverName === 'default') continue;
            for (const tool of server.tools || []) {
              if (tool.isEnabled) {
                allTools.push({ server: server.serverName, serverId: server.id, name: tool.name, description: tool.description, sourceType: 'api_key' });
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch server tools:', err);
      }

      // 3. Fetch MCP server tools (external imports) - fetch actual tools from each server
      try {
        const mcpResponse = await fetch('/api/mcp-servers/list');
        if (mcpResponse.ok) {
          const mcpData = await mcpResponse.json();
          // Fetch actual tools from each MCP server
          for (const server of mcpData.servers || []) {
            if (server.source_type === 'mcp_import') {
              try {
                const serverResponse = await fetch(`/api/mcp-servers/${server.id}`);
                if (serverResponse.ok) {
                  const serverData = await serverResponse.json();
                  // Transform tools from the nested structure
                  const serverTools = (serverData.tools || []).map((st: {
                    tool?: { name?: string; description?: string; input_schema?: Record<string, unknown>; output_schema?: Record<string, unknown>; has_widget?: boolean };
                    original_name?: string;
                    original_description?: string;
                    is_enabled?: boolean;
                    has_widget?: boolean;
                  }) => ({
                    server: server.server_name,
                    serverId: server.id,
                    name: st.tool?.name || st.original_name || 'Unknown',
                    description: st.tool?.description || st.original_description || '',
                    sourceType: 'mcp_import' as const,
                    sourceUrl: server.source_url,
                    inputSchema: st.tool?.input_schema,
                    outputSchema: st.tool?.output_schema,
                    hasWidget: st.tool?.has_widget || st.has_widget || false,
                  }));
                  allTools.push(...serverTools);
                }
              } catch (err) {
                console.error(`Failed to fetch tools for MCP server ${server.server_name}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch MCP servers:', err);
      }

      setMcpTools(allTools);
    } catch (error) {
      console.error('Failed to fetch MCP tools:', error);
    }
  };

  // Fetch connectors for automation
  const fetchConnectors = async () => {
    try {
      const response = await fetch('/api/ai/connectors?context=automation');
      if (response.ok) {
        const data = await response.json();
        // Filter out external agents for automation mode
        const mcpConnectors = (data.connectors || []).filter((c: Connector) =>
          c.connector_type !== 'external_agent' && c.connector_type !== 'internal_agent'
        );
        setConnectors(mcpConnectors);
      }
    } catch (error) {
      console.error('Failed to fetch connectors:', error);
    }
  };

  // Fetch available MCP servers
  const fetchAvailableMcpServers = async () => {
    try {
      const response = await fetch('/api/mcp-servers/list');
      if (response.ok) {
        const data = await response.json();
        setAvailableMcpServers(data.servers || []);
      }
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error);
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
          displayName: server.display_name,
          description: `${server.toolCount} tools`,
          icon: '🔧',
          externalUrl: `api_key:${server.id}`,
          context: 'automation',
        }),
      });
      if (response.ok) {
        fetchConnectors();
        fetchMcpTools();
      }
    } catch (error) {
      console.error('Failed to add connector:', error);
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
          context: 'automation',
        }),
      });
      if (response.ok) {
        fetchConnectors();
        fetchMcpTools();
      }
    } catch (error) {
      console.error('Failed to add connector:', error);
    }
  };

  // Remove connector
  const removeConnector = async (id: string) => {
    try {
      await fetch(`/api/ai/connectors?id=${id}`, { method: 'DELETE' });
      fetchConnectors();
      fetchMcpTools();
    } catch (error) {
      console.error('Failed to remove connector:', error);
    }
  };

  // Toggle personality - persist to DB for automation context
  const togglePersonality = async (id: string) => {
    const isActive = activePersonalityIds.includes(id);
    try {
      if (isActive) {
        await fetch(`/api/ai/personalities/active?personalityId=${id}&context=automation`, { method: 'DELETE' });
        setActivePersonalityIds(prev => prev.filter(p => p !== id));
      } else {
        await fetch('/api/ai/personalities/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalityId: id, context: 'automation' }),
        });
        setActivePersonalityIds(prev => [...prev, id]);
      }
    } catch (error) {
      console.error('Failed to toggle personality:', error);
    }
  };

  // Fetch RAGs
  const fetchRags = async () => {
    try {
      const response = await fetch('/api/ai/rags?context=automation');
      if (response.ok) {
        const data = await response.json();
        setRags(data.rags || []);
        setActiveRagIds(data.activeIds || []);
      }
    } catch (error) {
      console.error('Failed to fetch RAGs:', error);
    }
  };

  // Fetch automation settings from preferences
  const fetchAutomationSettings = async () => {
    try {
      const response = await fetch('/api/preferences?context=automation');
      if (response.ok) {
        const data = await response.json();
        const settings = data.contextSettings || data.automationSettings || {};
        settingsLoadedRef.current = true;

        // Apply saved settings (only if not loading an automation which has its own model)
        if (settings.historyMemoryEnabled !== undefined) {
          setHistoryMemoryEnabled(settings.historyMemoryEnabled);
        }
        if (settings.sendRecentHistory !== undefined) {
          setSendRecentHistory(settings.sendRecentHistory);
        }
        if (settings.defaultModel && !currentAutomation && availableModels.some(m => m.id === settings.defaultModel)) {
          setSelectedModel(settings.defaultModel);
        }
      }
    } catch (err) {
      console.error('Failed to fetch automation settings:', err);
    }
  };

  // Save a single automation setting
  const saveAutomationSetting = async (key: string, value: boolean | string) => {
    // Don't save until initial settings are loaded
    if (!settingsLoadedRef.current) return;

    try {
      await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'automation',
          settings: { [key]: value },
        }),
      });
    } catch (err) {
      console.error('Failed to save automation setting:', err);
    }
  };

  // Toggle RAG
  const toggleRag = async (ragId: string) => {
    const isActive = activeRagIds.includes(ragId);
    try {
      if (isActive) {
        await fetch(`/api/ai/rags/active?ragId=${ragId}&context=automation`, { method: 'DELETE' });
        setActiveRagIds(prev => prev.filter(id => id !== ragId));
      } else {
        await fetch('/api/ai/rags/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ragId, context: 'automation' }),
        });
        setActiveRagIds(prev => [...prev, ragId]);
      }
    } catch (error) {
      console.error('Failed to toggle RAG:', error);
    }
  };

  // Fetch prompt history for an automation
  const fetchPromptHistory = useCallback(async (automationId: string) => {
    try {
      const response = await fetch(`/api/ai/automations/history?automationId=${automationId}`);
      if (response.ok) {
        const data = await response.json();
        setPromptHistory(data.history || []);
      } else {
        console.error('Failed to fetch prompt history');
        setPromptHistory([]);
      }
    } catch (error) {
      console.error('Error fetching prompt history:', error);
      setPromptHistory([]);
    }
  }, []);

  // Fetch export history for an automation
  const fetchExportHistory = useCallback(async (automationId: string) => {
    try {
      const response = await fetch(`/api/ai/automations/export-history?automationId=${automationId}`);
      if (response.ok) {
        const data = await response.json();
        setExportHistory(data.history || []);
      } else {
        console.error('Failed to fetch export history');
        setExportHistory([]);
      }
    } catch (error) {
      console.error('Error fetching export history:', error);
      setExportHistory([]);
    }
  }, []);

  // Generate flow from prompt
  const generateFlow = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    // Check if at least one connector is added and enabled
    if (connectors.length === 0) {
      setShowNoConnectorsModal(true);
      return;
    }

    setIsGenerating(true);
    setLastTokenUsage(null);
    setRetrievalEvents({});

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Build combined system prompt from active personalities
    const activePersonalities = personalities.filter(p => activePersonalityIds.includes(p.id));
    let personaSystemPrompt = activePersonalities.map(p => p.system_prompt).filter(Boolean).join('\n\n');

    // Token estimation function (rough: ~4 chars per token)
    const estimateTokens = (text: string): number => {
      if (!text) return 0;
      return Math.ceil(text.length / 4);
    };

    // Collected retrieval data
    let collectedRagData: RAGRetrievalEvent[] = [];
    let collectedHistoryData: HistoryMatchEvent[] = [];
    let ragContextString = '';
    let historyContextString = '';

    try {
      // Search active RAGs if any are enabled
      if (activeRagIds.length > 0) {
        setRetrievalEvents({ isSearching: true });
        try {
          const ragRes = await fetch('/api/ai/rag-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ragIds: activeRagIds,
              query: prompt,
              topK: 3,
            }),
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json();
            collectedRagData = ragData.results || [];
            if (ragData.contextString) {
              ragContextString = ragData.contextString;
              personaSystemPrompt = ragData.contextString + (personaSystemPrompt || '');
            }
            setRetrievalEvents(prev => ({ ...prev, ragEvents: collectedRagData, isSearching: false }));
          }
        } catch (ragErr) {
          console.error('Failed to fetch RAG context:', ragErr);
          setRetrievalEvents(prev => ({ ...prev, isSearching: false }));
        }
      }

      // Fetch semantic history context if enabled and we have an automation
      if (historyMemoryEnabled && currentAutomation?.id) {
        setRetrievalEvents(prev => ({ ...prev, isSearching: true }));
        try {
          const contextRes = await fetch('/api/ai/history-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: currentAutomation.id,
              currentMessage: prompt,
              topK: 3,
              historyType: 'chat_history',
            }),
          });
          if (contextRes.ok) {
            const contextData = await contextRes.json();
            if (contextData.contextString) {
              historyContextString = contextData.contextString;
              // Prepend semantic history context to system prompt
              personaSystemPrompt = contextData.contextString + (personaSystemPrompt || '');
            }
            if (contextData.context && contextData.context.length > 0) {
              collectedHistoryData = contextData.context.map((c: string, i: number) => ({
                chatId: currentAutomation.id,
                score: 1 - (i * 0.1),
                messages: [{ content: c, messageType: 'context' }],
              }));
            }
            setRetrievalEvents(prev => ({ ...prev, historyEvents: collectedHistoryData, isSearching: false }));
          }
        } catch (histErr) {
          console.error('Failed to fetch history context:', histErr);
          setRetrievalEvents(prev => ({ ...prev, isSearching: false }));
        }
      }

      setRetrievalEvents(prev => ({ ...prev, isSending: true }));

      // Build recent history for context (last 2 prompts) if enabled
      // Helps with references like "undo that", "make it faster", etc.
      // Note: promptHistory is ordered descending (newest first), so we take first 2 and reverse
      const recentHistoryData = sendRecentHistory && promptHistory.length > 0
        ? promptHistory.slice(0, 2).reverse().map(h => ({
            prompt: h.prompt,
            // Include a brief note about what the mermaid result was
            response: h.response_mermaid ? '(flow updated)' : undefined,
          }))
        : undefined;

      // Estimate token counts for context tracking
      const ragTokensEstimate = ragContextString ? estimateTokens(ragContextString) : 0;
      const historyTokensEstimate = historyContextString ? estimateTokens(historyContextString) : 0;
      const recentHistoryTokensEstimate = recentHistoryData
        ? recentHistoryData.reduce((sum, h) => sum + estimateTokens(h.prompt) + estimateTokens(h.response || ''), 0)
        : 0;
      const personaTokensEstimate = activePersonalities.reduce(
        (sum, p) => sum + estimateTokens(p.system_prompt), 0
      );

      // Build persona data for tracking
      const personaDataForTracking = activePersonalities.length > 0
        ? activePersonalities.map(p => ({ id: p.id, name: p.name, prompt: p.system_prompt }))
        : null;

      const response = await fetch('/api/ai/automations/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: currentAutomation?.id,
          prompt,
          currentMermaid: mermaidDiagram,
          modelId: selectedModel,
          availableTools: activeTools,
          personaSystemPrompt: personaSystemPrompt || undefined,
          recentHistory: recentHistoryData,
          // Context tracking data
          ragData: collectedRagData.length > 0 ? collectedRagData : null,
          historyData: collectedHistoryData.length > 0 ? collectedHistoryData : null,
          personaData: personaDataForTracking,
          ragTokens: ragTokensEstimate,
          historyTokens: historyTokensEstimate,
          recentHistoryTokens: recentHistoryTokensEstimate,
          personaTokens: personaTokensEstimate,
        }),
        signal: abortController.signal,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.mermaid) setMermaidDiagram(data.mermaid);
        if (data.explanation) setLastExplanation(data.explanation);
        if (data.usage) setLastTokenUsage(data.usage);

        // Embed to history if enabled and we have an automation
        if (currentAutomation?.id && data.historyId) {
          embedPromptToHistory(
            currentAutomation.id,
            data.historyId,
            prompt,
            `${data.explanation || ''}\n\nMermaid:\n${data.mermaid || ''}`
          );
        }

        setPrompt('');
        fetchBudget();
        // Refresh prompt history if we have an automation
        if (currentAutomation?.id) {
          fetchPromptHistory(currentAutomation.id);
        }
      }
    } catch (error) {
      // Check if this was a user-initiated cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        setLastExplanation('User canceled the request.');
      } else {
        console.error('Failed to generate flow:', error);
      }
    } finally {
      setIsGenerating(false);
      setRetrievalEvents({});
      abortControllerRef.current = null;
    }
  }, [prompt, mermaidDiagram, selectedModel, activeTools, currentAutomation, isGenerating, personalities, activePersonalityIds, fetchPromptHistory, connectors, activeRagIds, sendRecentHistory, promptHistory, historyMemoryEnabled]);

  // Stop/cancel the current request
  const stopRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Save automation
  const saveAutomation = async () => {
    if (!automationName.trim()) return;

    try {
      const method = currentAutomation ? 'PUT' : 'POST';
      const body = currentAutomation
        ? { id: currentAutomation.id, name: automationName, description: automationDescription, mermaid_diagram: mermaidDiagram, model_id: selectedModel, personality_ids: activePersonalityIds, schedule_type: selectedSchedule }
        : { name: automationName, description: automationDescription, model_id: selectedModel, personality_ids: activePersonalityIds };

      const response = await fetch('/api/ai/automations', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentAutomation(data.automation);
        setShowSaveModal(false);
        fetchAutomations();
      }
    } catch (error) {
      console.error('Failed to save automation:', error);
    }
  };

  // Export to TypeScript
  const exportToTypeScript = async () => {
    if (!currentAutomation) return;
    setIsExporting(true);

    // Build combined system prompt from active personalities
    const activePersonalities = personalities.filter(p => activePersonalityIds.includes(p.id));
    const personaSystemPrompt = activePersonalities.map(p => p.system_prompt).filter(Boolean).join('\n\n');

    try {
      const response = await fetch('/api/ai/automations/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: currentAutomation.id,
          flowDefinition: currentAutomation.flow_definition,
          mermaidDiagram,
          modelId: selectedModel,
          automationName: currentAutomation.name,
          personaSystemPrompt: personaSystemPrompt || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setExportedCode(data.typescriptCode);
        if (data.usage) setLastTokenUsage(data.usage);
        setShowExportModal(false);
        setView('code');
        fetchBudget();
        // Refresh export history
        if (currentAutomation?.id) {
          fetchExportHistory(currentAutomation.id);
        }
      }
    } catch (error) {
      console.error('Failed to export:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Delete automation
  const deleteAutomation = async (id: string) => {
    try {
      await fetch(`/api/ai/automations?id=${id}`, { method: 'DELETE' });
      // Also delete embeddings from Upstash if history memory was enabled
      fetch(`/api/ai/history-embed?chatId=${id}&historyType=chat_history`, { method: 'DELETE' })
        .catch(err => console.error('Failed to delete history embeddings:', err));
      fetchAutomations();
      if (currentAutomation?.id === id) {
        setCurrentAutomation(null);
        setView('list');
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Search history using semantic search
  const handleHistorySearch = async () => {
    if (!historySearchQuery.trim() || isSearchingHistory) return;

    setIsSearchingHistory(true);
    try {
      const response = await fetch('/api/ai/history-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: historySearchQuery,
          historyType: 'chat_history', // Automations use same history type
          topK: 5,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setHistorySearchResults(data.sessions || []);
      }
    } catch (err) {
      console.error('History search failed:', err);
    } finally {
      setIsSearchingHistory(false);
    }
  };

  // Embed prompt to history (when history memory is enabled)
  const embedPromptToHistory = async (
    automationId: string,
    promptId: string,
    userPrompt: string,
    assistantResponse: string
  ) => {
    if (!historyMemoryEnabled) return;

    try {
      // Embed user prompt
      await fetch('/api/ai/history-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: automationId,
          messageId: `${promptId}-user`,
          messageType: 'user',
          content: userPrompt,
          historyType: 'chat_history',
        }),
      });

      // Embed assistant response (mermaid + explanation)
      await fetch('/api/ai/history-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: automationId,
          messageId: `${promptId}-assistant`,
          messageType: 'assistant',
          content: assistantResponse,
          modelId: selectedModel,
          historyType: 'chat_history',
        }),
      });
    } catch (err) {
      console.error('Failed to embed prompt to history:', err);
    }
  };

  // Start new automation
  const startNew = () => {
    setCurrentAutomation(null);
    setMermaidDiagram('flowchart TD\n  start([Start]) --> end_node([End])');
    setPromptHistory([]);
    setExportHistory([]);
    setExportedCode('');
    setAutomationName('');
    setAutomationDescription('');
    setView('builder');
  };

  // Load automation
  const loadAutomation = (auto: Automation) => {
    setCurrentAutomation(auto);
    setMermaidDiagram(auto.mermaid_diagram || 'flowchart TD\n  start([Start]) --> end_node([End])');
    setAutomationName(auto.name);
    setAutomationDescription(auto.description || '');
    setSelectedModel(auto.model_id);
    setActivePersonalityIds(auto.personality_ids || []);
    setSelectedSchedule(auto.schedule_type);
    setExportedCode(auto.typescript_code || '');
    setView('builder');
    // Fetch prompt and export history for this automation
    fetchPromptHistory(auto.id);
    fetchExportHistory(auto.id);
  };

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <UpgradeModal isOpen={true} title="Automation - Pro Feature" featureName="Workflow Automation" showCloseButton={false} />
        <View maxWidth="56rem" marginX="auto" UNSAFE_style={{ filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}><BackToTools /></div>
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 4rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AUTOMATION</h1>
          </View>
        </View>
        <Footer />
      </View>
    );
  }

  return (
    <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
      <View maxWidth="56rem" marginX="auto">
        <div style={{ marginBottom: '1.5rem' }}><BackToTools /></div>

        {/* Header */}
        <View UNSAFE_style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
            <AutomationIcon size={100} />
          </div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>AUTOMATION BUILDER</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Build workflows with natural language • Export to TypeScript</p>
        </View>

        {/* Budget Bar */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>💰</span>
              <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>Budget</span>
              <span style={{ background: tier === 'plus' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600 }}>{tier.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{formatCurrency(budgetData?.usage.totalCost || 0)} / {formatCurrency(budgetData?.budget.monthlyBudgetUsd || DEFAULT_MONTHLY_BUDGET)}</span>
              <div style={{ width: '100px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${budgetData?.usage.budgetUsedPercent || 0}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '6px' }} />
              </div>
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => setView('list')} style={{ background: view === 'list' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>📁 My Automations</button>
          <button onClick={() => setView('builder')} style={{ background: view === 'builder' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>🔧 Builder</button>
          {currentAutomation && <button onClick={() => setView('history')} style={{ background: view === 'history' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>📜 Prompt History</button>}
          {exportedCode && <button onClick={() => setView('code')} style={{ background: view === 'code' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>💻 Code</button>}

          {/* History Memory toggle */}
          <button
            onClick={() => setHistoryMemoryEnabled(!historyMemoryEnabled)}
            title={historyMemoryEnabled ? "History Memory enabled - click to disable" : "History Memory disabled - click to enable"}
            style={{ background: historyMemoryEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)', border: historyMemoryEnabled ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: historyMemoryEnabled ? '#10b981' : '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            📜
          </button>

          {/* Send Recent History toggle */}
          <button
            onClick={() => setSendRecentHistory(!sendRecentHistory)}
            title={sendRecentHistory ? "Recent history enabled - last 2 exchanges sent for context. Click to disable." : "Recent history disabled - only current message sent. Click to enable."}
            style={{ background: sendRecentHistory ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: sendRecentHistory ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: sendRecentHistory ? '#3b82f6' : '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            💬
          </button>

          <button onClick={startNew} style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', marginLeft: 'auto' }}>+ New Automation</button>
        </div>

        {/* LIST VIEW */}
        {view === 'list' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 1rem' }}>📁 Your Automations</h2>
            {automations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.5)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚡</div>
                <p>No automations yet. Click "New Automation" to get started!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {automations.map(auto => (
                  <div key={auto.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ color: '#fff', fontSize: '1rem', margin: 0, fontWeight: 600 }}>{auto.name}</h3>
                      <span style={{ background: auto.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: auto.status === 'active' ? '#10b981' : 'rgba(255,255,255,0.5)', padding: '0.15rem 0.4rem', borderRadius: '6px', fontSize: '0.65rem' }}>{auto.status}</span>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{auto.description || 'No description'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                      <span>⏰ {auto.schedule_type}</span>
                      <span>•</span>
                      <span>{auto.total_runs} runs</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => loadAutomation(auto)} style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '8px', padding: '0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>Edit</button>
                      <button onClick={() => deleteAutomation(auto.id)} style={{ background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BUILDER VIEW - Placeholder, actual content rendered in fullscreen portal */}
        {view === 'builder' && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.5)' }}>
            <p>Loading builder...</p>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && currentAutomation && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 1rem' }}>📜 Prompt History for "{currentAutomation.name}"</h2>

            {/* Generated Code Section */}
            {currentAutomation.typescript_code && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ color: '#a78bfa', fontSize: '0.9rem', margin: 0 }}>💻 Generated TypeScript Code</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setView('code')}
                      style={{ background: 'rgba(139, 92, 246, 0.3)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.6rem', color: '#a78bfa', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      👁️ View
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([currentAutomation.typescript_code || ''], { type: 'text/typescript' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${currentAutomation.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ts`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      style={{ background: 'rgba(16, 185, 129, 0.3)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.6rem', color: '#10b981', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      ⬇️ Download
                    </button>
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: 0 }}>
                  Last generated code is available for review and download
                </p>
              </div>
            )}

            {/* Prompt History Section */}
            <h3 style={{ color: '#f59e0b', fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📝</span> Mermaid Generation History
            </h3>
            {promptHistory.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>No prompts yet. Start building in the Builder tab!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {promptHistory.map((ph, i) => (
                  <div key={ph.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600 }}>#{promptHistory.length - i}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{new Date(ph.created_at).toLocaleString()}</span>
                    </div>

                    {/* User Prompt */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Your prompt:</div>
                      <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{ph.prompt}</p>
                    </div>

                    {/* Visual Mermaid Diagram */}
                    {ph.response_mermaid && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Generated Diagram:</span>
                          <button
                            onClick={() => {
                              setMermaidDiagram(ph.response_mermaid);
                              setView('builder');
                            }}
                            style={{ background: 'rgba(245, 158, 11, 0.2)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', color: '#f59e0b', cursor: 'pointer', fontSize: '0.65rem' }}
                          >
                            ↩️ Restore
                          </button>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.5rem', maxHeight: '200px', overflow: 'auto' }}>
                          <MermaidDiagram definition={ph.response_mermaid} />
                        </div>
                      </div>
                    )}

                    {/* Token Usage for Mermaid Generation */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', fontSize: '0.7rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Mermaid tokens:</span>
                      <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>
                        ↑ {ph.input_tokens.toLocaleString()} input
                      </span>
                      <span style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#60a5fa' }}>
                        ↓ {ph.output_tokens.toLocaleString()} output
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                        = {(ph.input_tokens + ph.output_tokens).toLocaleString()} total
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Export History Section */}
            <h3 style={{ color: '#10b981', fontSize: '1rem', marginBottom: '0.75rem', marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💻</span> TypeScript Export History
            </h3>
            {exportHistory.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>No exports yet. Use the Export button to generate TypeScript code!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {exportHistory.map((eh, i) => (
                  <div key={eh.id} style={{ background: 'rgba(16, 185, 129, 0.05)', borderRadius: '10px', padding: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>Export #{exportHistory.length - i}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{new Date(eh.created_at).toLocaleString()}</span>
                    </div>

                    {/* Source Diagram Preview */}
                    {eh.mermaid_diagram && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Source diagram:</div>
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.5rem', maxHeight: '150px', overflow: 'auto' }}>
                          <MermaidDiagram definition={eh.mermaid_diagram} />
                        </div>
                      </div>
                    )}

                    {/* Generated TypeScript Code */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Generated TypeScript:</span>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            onClick={() => {
                              setExportedCode(eh.typescript_code);
                              setView('code');
                            }}
                            style={{ background: 'rgba(59, 130, 246, 0.2)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', color: '#60a5fa', cursor: 'pointer', fontSize: '0.65rem' }}
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => {
                              const blob = new Blob([eh.typescript_code], { type: 'text/typescript' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `automation-${eh.id.slice(0, 8)}.ts`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            style={{ background: 'rgba(16, 185, 129, 0.2)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', color: '#10b981', cursor: 'pointer', fontSize: '0.65rem' }}
                          >
                            ⬇️ Download
                          </button>
                        </div>
                      </div>
                      <pre style={{
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: '0.7rem',
                        margin: 0,
                        padding: '0.5rem',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '6px',
                        overflow: 'auto',
                        maxHeight: '100px',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace'
                      }}>{eh.typescript_code.slice(0, 300)}{eh.typescript_code.length > 300 ? '...' : ''}</pre>
                    </div>

                    {/* Token Usage for Export */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', fontSize: '0.7rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Export tokens:</span>
                      <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>
                        ↑ {eh.input_tokens.toLocaleString()} input
                      </span>
                      <span style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#60a5fa' }}>
                        ↓ {eh.output_tokens.toLocaleString()} output
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                        = {(eh.input_tokens + eh.output_tokens).toLocaleString()} total
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CODE VIEW */}
        {view === 'code' && exportedCode && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>💻 Generated TypeScript</h2>
              <button onClick={() => navigator.clipboard.writeText(exportedCode)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>📋 Copy</button>
            </div>
            <pre style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1rem', overflow: 'auto', maxHeight: '500px', fontSize: '0.8rem', color: '#a5b4fc', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{exportedCode}</pre>
          </div>
        )}

        {/* Save Modal */}
        {showSaveModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '90%' }}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>💾 Save Automation</h3>
              <input type="text" value={automationName} onChange={(e) => setAutomationName(e.target.value)} placeholder="Automation name..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', marginBottom: '0.75rem' }} />
              <textarea value={automationDescription} onChange={(e) => setAutomationDescription(e.target.value)} placeholder="Description (optional)..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', marginBottom: '1rem', minHeight: '80px', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowSaveModal(false)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveAutomation} disabled={!automationName.trim()} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', opacity: !automationName.trim() ? 0.5 : 1 }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '1.5rem', maxWidth: '450px', width: '90%' }}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>📤 Export to TypeScript</h3>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ color: '#f59e0b', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>⚠️ Token Usage Warning</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: 0 }}>This will use approximately <strong>~2,000-4,000 tokens</strong> to generate TypeScript code. This will be deducted from your budget.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowExportModal(false)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button onClick={exportToTypeScript} disabled={isExporting} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', cursor: 'pointer' }}>{isExporting ? 'Generating...' : 'Generate Code'}</button>
              </div>
            </div>
          </div>
        )}

        {/* No Connectors Error Modal */}
        {showNoConnectorsModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowNoConnectorsModal(false)}>
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', border: '1px solid rgba(239, 68, 68, 0.3)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔌</div>
                <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>No Connectors Added</h3>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', lineHeight: 1.6, textAlign: 'center', marginBottom: '1.25rem' }}>
                You need to add at least one connector before creating an automation. Connectors provide the tools and capabilities your automation can use.
              </p>
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1.25rem' }}>
                <p style={{ color: '#a78bfa', fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
                  💡 Click the ⚙️ button to open settings and add connectors
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => setShowNoConnectorsModal(false)}
                  style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowNoConnectorsModal(false);
                    setShowSettingsPanel(true);
                    setSettingsPanelMode('connectors');
                  }}
                  style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}
                >
                  Add Connectors
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tool Info Modal */}
        {toolInfoModal && (() => {
          const sourceUrl = toolInfoModal.tools[0]?.sourceUrl;
          const sourceType = toolInfoModal.tools[0]?.sourceType;
          return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setToolInfoModal(null)}>
            <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
                <h3 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', minWidth: 0, overflow: 'hidden' }}>
                  {sourceType === 'mcp_import' && sourceUrl ? (
                    <FaviconImage
                      baseUrl={sourceUrl}
                      alt={toolInfoModal.server}
                      size={24}
                      borderRadius={4}
                      fallbackEmoji="🔌"
                      fallbackBgColor="transparent"
                    />
                  ) : (
                    <span>🔧</span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toolInfoModal.server} Tools</span>
                </h3>
                <button onClick={() => setToolInfoModal(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                {toolInfoModal.tools.map((tool, idx) => (
                  <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <h4 style={{ color: '#f59e0b', margin: 0, fontSize: '0.9rem', wordBreak: 'break-word' }}>{tool.name}</h4>
                      {tool.hasWidget && (
                        <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }}>
                          🎨 Widget
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '0 0 0.75rem', wordBreak: 'break-word' }}>{tool.description}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Input Schema:</span>
                        <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.65rem', color: '#a78bfa', margin: 0, overflowX: 'auto', overflowY: 'auto', maxHeight: '80px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {JSON.stringify(tool.inputSchema || { type: 'object', properties: {} }, null, 2)}
                        </pre>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Output Schema:</span>
                        <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.65rem', color: '#10b981', margin: 0, overflowX: 'auto', overflowY: 'auto', maxHeight: '80px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {JSON.stringify(tool.outputSchema || { type: 'object' }, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button onClick={() => setToolInfoModal(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Close</button>
              </div>
            </div>
          </div>
          );
        })()}

        <Footer />
      </View>

      {/* FULLSCREEN BUILDER VIEW */}
      {view === 'builder' && (
        <div className="automation-fullscreen">
          {/* Content Area - Scrollable (between fixed input at bottom) */}
          <div className="automation-fullscreen-content" style={{ paddingTop: '1rem' }}>
            <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Mermaid Diagram - Fill available space */}
              <div className="automation-fullscreen-diagram">
                <MermaidDiagram
                  definition={mermaidDiagram}
                  title={currentAutomation?.name || 'Workflow'}
                  editable={true}
                  onDefinitionChange={setMermaidDiagram}
                  minHeight="100%"
                  maxHeight="none"
                />
              </div>

              {/* Create Automation Button - Centered under diagram */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', marginBottom: '0.5rem' }}>
                <button
                  onClick={() => setShowSaveModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '0.75rem 2rem',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
                  }}
                >
                  ⚡ Create Automation
                </button>
              </div>
            </div>
          </div>

          {/* Fixed Input Bar - Bottom */}
          <div className="automation-fullscreen-input">
            <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
              {/* Retrieval events during generation */}
              {isGenerating && (retrievalEvents.isSearching || retrievalEvents.ragEvents || retrievalEvents.isSending) && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <RetrievalEventsDisplay data={retrievalEvents} />
                </div>
              )}
              {/* Last generation stats */}
              {(lastTokenUsage || lastExplanation) && (
                <div style={{ marginBottom: '0.5rem' }}>
                  {lastTokenUsage && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', marginBottom: lastExplanation ? '0.25rem' : 0 }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Last generation:</span>
                      <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>↑ {lastTokenUsage.input}</span>
                      <span style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#60a5fa' }}>↓ {lastTokenUsage.output}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>= {lastTokenUsage.input + lastTokenUsage.output} tokens</span>
                    </div>
                  )}
                  {lastExplanation && (
                    <div style={{ padding: '0.35rem 0.5rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{lastExplanation}</div>
                  )}
                </div>
              )}

              {/* Reusable Chat Input Area */}
              <ChatInputArea
                message={prompt}
                setMessage={setPrompt}
                onSend={generateFlow}
                onStop={stopRequest}
                isLoading={isGenerating}
                placeholder="Describe your workflow..."
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                tier={tier}
                remainingBudget={budgetData?.usage.remainingBudget || 0}
                activePersonalities={personalities.filter(p => activePersonalityIds.includes(p.id))}
                sendButtonLabel="⚡"
                showSettingsButton={true}
                onSettingsClick={() => setShowSettingsPanel(true)}
                showPersonasToggle={true}
                activePersonasCount={activePersonalityIds.length}
                onPersonasClick={() => { setShowSettingsPanel(true); setSettingsPanelMode('personas'); }}
                showReasoningToggle={true}
                enableReasoning={true}
                showRagToggle={rags.length > 0}
                activeRagCount={activeRagIds.length}
                onRagClick={() => { setShowSettingsPanel(true); setSettingsPanelMode('rags'); }}
                showConnectorsToggle={true}
                activeConnectorsCount={connectors.length}
                onConnectorsClick={() => { setShowSettingsPanel(true); setSettingsPanelMode('connectors'); }}
                historyMemoryEnabled={historyMemoryEnabled}
                setHistoryMemoryEnabled={setHistoryMemoryEnabled}
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        mode="automation"
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isLargeScreen={isLargeScreen}
        panelMode={settingsPanelMode}
        setPanelMode={setSettingsPanelMode}
        budgetData={budgetData}
        tier={tier}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        availableModels={availableModels}
        connectors={connectors}
        removeConnector={removeConnector}
        availableMcpServers={availableMcpServers}
        addInternalMcpConnector={addInternalMcpConnector}
        addExternalMcpConnector={addExternalMcpConnector}
        totalToolsCount={mcpTools.length}
        personalities={personalities}
        activePersonalityIds={activePersonalityIds}
        togglePersonality={togglePersonality}
        setViewingPersona={setViewingPersona}
        rags={rags}
        activeRagIds={activeRagIds}
        toggleRag={toggleRag}
        automationFolders={automationFolders}
        currentAutomationId={currentAutomation?.id || null}
        loadAutomation={loadAutomation}
        deleteAutomation={deleteAutomation}
        historyMemoryEnabled={historyMemoryEnabled}
        setHistoryMemoryEnabled={setHistoryMemoryEnabled}
        sendRecentHistory={sendRecentHistory}
        setSendRecentHistory={setSendRecentHistory}
        historySearchQuery={historySearchQuery}
        setHistorySearchQuery={setHistorySearchQuery}
        historySearchResults={historySearchResults}
        onHistorySearch={handleHistorySearch}
        isSearchingHistory={isSearchingHistory}
        onNewItem={startNew}
        newItemLabel="New Automation"
        scheduleOptions={SCHEDULE_OPTIONS}
        selectedSchedule={selectedSchedule}
        setSelectedSchedule={setSelectedSchedule}
      />

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
              <Link href="/dashboard" onClick={() => setViewingPersona(null)} style={{ color: '#f59e0b', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>✏️</span> Edit in Dashboard
              </Link>
            </div>

            <button onClick={() => setViewingPersona(null)} style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Close</button>
          </div>
        </div>
      )}
    </View>
  );
};
