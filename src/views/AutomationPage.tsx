'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
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
import { parseMermaid, mermaidToWorkflow, workflowToYamlString, ScheduleConfig, normalizeNameToId } from '../lib/automation/mermaid-to-yaml';
import { workflowToMermaid } from '../lib/automation/yaml-to-mermaid';
import { WorkflowDefinition } from '../lib/automation/types';
import { AutomationFinder, Automation as FinderAutomation, Execution as FinderExecution } from '../components/AutomationFinder';
import * as yaml from 'yaml';

// Supabase client for realtime subscriptions
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

interface AutomationPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

interface Automation {
  id: string;
  name: string;
  display_name: string | null;
  description: string;
  category: string;
  mermaid_diagram: string;
  yaml_definition: string | null;
  flow_definition: { nodes: FlowNode[]; edges: FlowEdge[] };
  typescript_code: string | null;
  model_id: string;
  personality_ids: string[];
  schedule_type: string;
  schedule_config: Record<string, unknown>;
  trigger_config: Record<string, unknown> | null;
  cron_expression: string | null;
  required_inputs: Record<string, RequiredInputConfig> | null;
  output_config: OutputConfigItem[] | null;
  workflow_version: number;
  status: string;
  last_run_status: 'success' | 'warning' | 'error' | null;
  last_run_at: string | null;
  last_run_message: string | null;
  total_runs: number;
  created_at: string;
  updated_at: string;
}

interface RequiredInputConfig {
  value?: unknown;
  sensitive?: boolean;
  human_input?: boolean;
  description?: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

interface OutputConfigItem {
  type: 'email' | 'slack' | 'webhook' | 'push' | 'automation';
  [key: string]: unknown;
}

interface AutomationExecution {
  id: string;
  automation_id: string;
  status: 'pending' | 'waiting_input' | 'running' | 'paused' | 'completed' | 'failed';
  trigger_type: string;
  current_step: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AutomationLog {
  id: string;
  execution_id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  step_id: string | null;
  step_name: string | null;
  message: string;
  status: string | null;
  duration_ms: number | null;
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
  tool_count?: number; // Number of tools in this connector
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
  { id: 'manual', label: 'Manual', icon: '▶️', description: 'Run manually or via API' },
  { id: 'daily', label: 'Daily', icon: '📅', description: 'Run every day at a specific time' },
  { id: 'weekly', label: 'Weekly', icon: '📆', description: 'Run on specific days each week' },
  { id: 'monthly', label: 'Monthly', icon: '🗓️', description: 'Run on specific days each month' },
  { id: 'cron', label: 'Cron', icon: '⚙️', description: 'Custom cron expression' },
  { id: 'webhook', label: 'Webhook', icon: '🔗', description: 'Trigger via HTTP webhook' },
];

// Weekly frequency options
const WEEKLY_FREQUENCY_OPTIONS = [
  { id: 1, label: 'Every week' },
  { id: 2, label: 'Every 2 weeks' },
  { id: 3, label: 'Every 3 weeks' },
  { id: 4, label: 'Every 4 weeks' },
];

// Days of week
const DAYS_OF_WEEK = [
  { id: 0, label: 'Sun', full: 'Sunday' },
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' },
];

// Validate cron expression (basic validation)
const validateCron = (cron: string): { valid: boolean; error?: string } => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, error: 'Cron must have 5 parts: minute hour day month weekday' };
  }
  const [minute, hour, day, month, weekday] = parts;

  const validatePart = (part: string, min: number, max: number, name: string): string | null => {
    if (part === '*') return null;
    if (part.includes('/')) {
      const [base, step] = part.split('/');
      if (base !== '*' && (isNaN(Number(base)) || Number(base) < min || Number(base) > max)) {
        return `Invalid ${name} base value`;
      }
      if (isNaN(Number(step)) || Number(step) < 1) {
        return `Invalid ${name} step value`;
      }
      return null;
    }
    if (part.includes(',')) {
      for (const p of part.split(',')) {
        const num = Number(p);
        if (isNaN(num) || num < min || num > max) {
          return `Invalid ${name} value: ${p}`;
        }
      }
      return null;
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
        return `Invalid ${name} range`;
      }
      return null;
    }
    const num = Number(part);
    if (isNaN(num) || num < min || num > max) {
      return `Invalid ${name}: must be ${min}-${max}`;
    }
    return null;
  };

  const errors = [
    validatePart(minute, 0, 59, 'minute'),
    validatePart(hour, 0, 23, 'hour'),
    validatePart(day, 1, 31, 'day'),
    validatePart(month, 1, 12, 'month'),
    validatePart(weekday, 0, 6, 'weekday'),
  ].filter(Boolean);

  if (errors.length > 0) {
    return { valid: false, error: errors[0] || 'Invalid cron expression' };
  }
  return { valid: true };
};

// Generate cron from schedule config
const generateCronFromConfig = (
  scheduleType: string,
  hour: number,
  minute: number,
  selectedDays: number[],
  selectedMonthDays: number[],
  weeklyFrequency: number
): string => {
  switch (scheduleType) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      if (selectedDays.length === 0) return `${minute} ${hour} * * 1`; // Default Monday
      // For frequency > 1, we'd need external scheduling logic, but cron can represent the days
      return `${minute} ${hour} * * ${selectedDays.join(',')}`;
    case 'monthly':
      if (selectedMonthDays.length === 0) return `${minute} ${hour} 1 * *`; // Default 1st
      return `${minute} ${hour} ${selectedMonthDays.join(',')} * *`;
    default:
      return '0 0 * * *';
  }
};

const DEFAULT_CATEGORY_OPTIONS = [
  { id: 'general', label: 'General', icon: '📁' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'operations', label: 'Operations', icon: '⚙️' },
  { id: 'support', label: 'Support', icon: '🎧' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'development', label: 'Development', icon: '💻' },
  { id: 'hr', label: 'HR', icon: '👥' },
  { id: 'finance', label: 'Finance', icon: '💵' },
];

// Helper to generate snake_case ID from display name
const toSnakeCase = normalizeNameToId;

// Generate a simple UUID v4
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

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
  const [totalToolsCount, setTotalToolsCount] = useState(0); // Total tools from enabled connectors

  // Budget
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  // UI state
  const [view, setView] = useState<'list' | 'builder' | 'history' | 'code' | 'yaml' | 'logs'>('list');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [automationName, setAutomationName] = useState('');
  const [automationDisplayName, setAutomationDisplayName] = useState('');
  const [automationDescription, setAutomationDescription] = useState('');
  const [automationCategory, setAutomationCategory] = useState('general');
  const [selectedSchedule, setSelectedSchedule] = useState('manual');
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]); // Monday default
  const [scheduleMonthDays, setScheduleMonthDays] = useState<number[]>([1]); // 1st default
  const [weeklyFrequency, setWeeklyFrequency] = useState(1);
  const [cronExpression, setCronExpression] = useState('0 9 * * 1');
  const [cronError, setCronError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedCode, setExportedCode] = useState('');
  const [exportedYaml, setExportedYaml] = useState('');
  const [workflowDef, setWorkflowDef] = useState<WorkflowDefinition | null>(null);
  const [lastTokenUsage, setLastTokenUsage] = useState<{ input: number; output: number } | null>(null);
  const [toolInfoModal, setToolInfoModal] = useState<{ server: string; tools: MCPTool[] } | null>(null);

  // Builder UI state
  const [tempAutomationId, setTempAutomationId] = useState<string | null>(null);
  const [showYamlPanel, setShowYamlPanel] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; label: string; icon: string; isSystem?: boolean }>>([...DEFAULT_CATEGORY_OPTIONS]);
  // Version history for mermaid diagrams (from AI responses)
  const [diagramVersions, setDiagramVersions] = useState<Array<{ diagram: string; yaml: string; timestamp: number; prompt: string }>>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(-1);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📦');

  // Execution state
  const [currentExecution, setCurrentExecution] = useState<AutomationExecution | null>(null);
  const [executionLogs, setExecutionLogs] = useState<AutomationLog[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runInputs, setRunInputs] = useState<Record<string, unknown>>({});
  const executionSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const logsSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Running instances state (for list view)
  const [runningExecutions, setRunningExecutions] = useState<Record<string, AutomationExecution[]>>({});

  // No connectors error modal state
  const [showNoConnectorsModal, setShowNoConnectorsModal] = useState(false);

  // Workflow rules state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [workflowRules, setWorkflowRules] = useState<string>('');
  const [isLoadingRules, setIsLoadingRules] = useState(false);

  // Manual paste areas state
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteYaml, setPasteYaml] = useState('');
  const [pasteMermaid, setPasteMermaid] = useState('');

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

  // Group automations into folders by category
  const automationFolders = useMemo(() => {
    const folders: Record<string, Automation[]> = {};
    automations.forEach(auto => {
      const category = auto.category || 'general';
      const categoryOption = categories.find(c => c.id === category);
      const folderName = categoryOption ? `${categoryOption.icon} ${categoryOption.label}` : '📁 General';
      if (!folders[folderName]) folders[folderName] = [];
      folders[folderName].push(auto);
    });
    return Object.entries(folders).map(([name, autos]) => ({ name, automations: autos }));
  }, [automations, categories]);

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

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        if (response.ok) {
          const data = await response.json();
          const fetchedCategories = (data.categories || []).map((c: { id?: string; name: string; icon: string; is_system?: boolean }) => ({
            id: c.id || c.name.toLowerCase().replace(/\s+/g, '_'),
            label: c.name,
            icon: c.icon,
            isSystem: c.is_system,
          }));
          // Merge with defaults, avoiding duplicates
          const merged = [...DEFAULT_CATEGORY_OPTIONS];
          fetchedCategories.forEach((fc: { id: string; label: string; icon: string; isSystem?: boolean }) => {
            if (!merged.find(m => m.id === fc.id)) {
              merged.push(fc);
            }
          });
          setCategories(merged);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, []);

  // Auto-generate snake_case name from display name
  const handleDisplayNameChange = (value: string) => {
    setAutomationDisplayName(value);
    // Only auto-generate if name hasn't been manually edited or is empty
    if (!automationName || automationName === toSnakeCase(automationDisplayName)) {
      setAutomationName(toSnakeCase(value));
    }
  };

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
        // Also fetch running executions
        fetchRunningExecutions(data.automations || []);
      }
    } catch (error) {
      console.error('Failed to fetch automations:', error);
    }
  };

  const fetchRunningExecutions = async (autos: Automation[]) => {
    if (autos.length === 0) return;
    try {
      const response = await fetch('/api/ai/automations/executions?status=running,waiting_input,pending');
      if (response.ok) {
        const data = await response.json();
        const executions = data.executions || [];
        // Group by automation_id
        const grouped: Record<string, AutomationExecution[]> = {};
        for (const exec of executions) {
          if (!grouped[exec.automation_id]) grouped[exec.automation_id] = [];
          grouped[exec.automation_id].push(exec);
        }
        setRunningExecutions(grouped);
      }
    } catch (error) {
      console.error('Failed to fetch running executions:', error);
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

  // Fetch connectors for automation (with tool counts)
  const fetchConnectors = async () => {
    try {
      const response = await fetch('/api/ai/connectors?context=automation&include_tool_count=true');
      if (response.ok) {
        const data = await response.json();
        // Filter out external agents for automation mode
        const mcpConnectors = (data.connectors || []).filter((c: Connector) =>
          c.connector_type !== 'external_agent' && c.connector_type !== 'internal_agent'
        );
        setConnectors(mcpConnectors);
        // Update total tools count
        if (data.totalToolCount !== undefined) {
          setTotalToolsCount(data.totalToolCount);
        }
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
    // Don't save until initial settings are loaded and user is authenticated
    if (!settingsLoadedRef.current || !canAccessPro) return;

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
        if (data.mermaid) {
          setMermaidDiagram(data.mermaid);
          // Add to version history
          const newVersion = {
            diagram: data.mermaid,
            yaml: '', // Will be generated when user clicks generate
            timestamp: Date.now(),
            prompt: prompt,
          };
          setDiagramVersions(prev => [...prev, newVersion]);
          setCurrentVersionIndex(prev => prev + 1);
        }
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

    // Build schedule config
    const scheduleConfig = {
      hour: scheduleHour,
      minute: scheduleMinute,
      days: scheduleDays,
      monthDays: scheduleMonthDays,
      weeklyFrequency: weeklyFrequency,
    };

    // Generate cron expression based on schedule type
    let generatedCron: string | null = null;
    switch (selectedSchedule) {
      case 'daily':
        generatedCron = `${scheduleMinute} ${scheduleHour} * * *`;
        break;
      case 'weekly':
        generatedCron = `${scheduleMinute} ${scheduleHour} * * ${scheduleDays.length > 0 ? scheduleDays.join(',') : '1'}`;
        break;
      case 'monthly':
        generatedCron = `${scheduleMinute} ${scheduleHour} ${scheduleMonthDays.length > 0 ? scheduleMonthDays.join(',') : '1'} * *`;
        break;
      case 'cron':
        generatedCron = cronExpression;
        break;
    }

    // Ensure YAML has the correct id (snake_case) and name
    let finalYaml = exportedYaml;
    const normalizedId = normalizeNameToId(automationName);
    if (exportedYaml) {
      try {
        const parsed = yaml.parse(exportedYaml);
        // Update id (snake_case) and name (display name) in the parsed YAML
        parsed.id = normalizedId;
        parsed.name = automationDisplayName || automationName;
        if (automationDescription) {
          parsed.description = automationDescription;
        }
        if (automationCategory) {
          parsed.category = automationCategory;
        }
        finalYaml = yaml.stringify(parsed);
      } catch {
        // If parsing fails, prepend id to the YAML
        if (!exportedYaml.startsWith('id:')) {
          finalYaml = `id: ${normalizedId}\nname: "${automationDisplayName || automationName}"\n${exportedYaml}`;
        }
      }
    }

    try {
      const method = currentAutomation ? 'PUT' : 'POST';
      const body = currentAutomation
        ? {
            id: currentAutomation.id,
            name: normalizedId, // snake_case id for database
            display_name: automationDisplayName || automationName,
            description: automationDescription,
            category: automationCategory,
            mermaid_diagram: mermaidDiagram,
            yaml_definition: finalYaml || null,
            model_id: selectedModel,
            personality_ids: activePersonalityIds,
            schedule_type: selectedSchedule,
            schedule_config: scheduleConfig,
            cron_expression: generatedCron,
            workflow_version: 1,
          }
        : {
            name: normalizedId, // snake_case id for database
            display_name: automationDisplayName || automationName,
            description: automationDescription,
            category: automationCategory,
            mermaid_diagram: mermaidDiagram,
            yaml_definition: finalYaml || null,
            model_id: selectedModel,
            personality_ids: activePersonalityIds,
            schedule_type: selectedSchedule,
            schedule_config: scheduleConfig,
            cron_expression: generatedCron,
          };

      const response = await fetch('/api/ai/automations', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentAutomation(data.automation);
        setShowSaveModal(false);
        // Update URL with the new automation ID
        window.history.pushState({}, '', `/automation?id=${data.automation.id}`);
        fetchAutomations();
      }
    } catch (error) {
      console.error('Failed to save automation:', error);
    }
  };

  // Run automation
  const runAutomation = async (automation: Automation, inputs?: Record<string, unknown>) => {
    if (!automation.yaml_definition) {
      alert('Please save the automation with a YAML definition first');
      return;
    }

    setIsExecuting(true);
    setExecutionLogs([]);
    setCurrentExecution(null);

    try {
      // Start execution via API
      const response = await fetch('/api/ai/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: automation.id,
          inputs: inputs || runInputs,
          triggerType: 'manual',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start execution');
      }

      const data = await response.json();
      setCurrentExecution(data.execution);
      setView('logs');

      // Subscribe to realtime updates
      subscribeToExecution(data.execution.id, automation.id);
    } catch (error) {
      console.error('Failed to run automation:', error);
      alert(error instanceof Error ? error.message : 'Failed to run automation');
      setIsExecuting(false);
    }
  };

  // Subscribe to execution updates via Supabase Realtime
  const subscribeToExecution = (executionId: string, automationId: string) => {
    if (!supabase) {
      console.warn('Supabase client not available for realtime');
      return;
    }

    // Unsubscribe from previous subscriptions
    executionSubscriptionRef.current?.unsubscribe();
    logsSubscriptionRef.current?.unsubscribe();

    // Subscribe to execution status changes
    const executionChannel = supabase
      .channel(`execution-${executionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'automation_executions',
          filter: `id=eq.${executionId}`,
        },
        (payload) => {
          const updated = payload.new as AutomationExecution;
          setCurrentExecution(updated);

          // Stop polling when execution completes
          if (['completed', 'failed'].includes(updated.status)) {
            setIsExecuting(false);
            fetchAutomations(); // Refresh to get updated last_run_status
          }
        }
      )
      .subscribe();

    executionSubscriptionRef.current = executionChannel;

    // Subscribe to new log entries
    const logsChannel = supabase
      .channel(`logs-${executionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'automation_logs',
          filter: `execution_id=eq.${executionId}`,
        },
        (payload) => {
          const newLog = payload.new as AutomationLog;
          setExecutionLogs((prev) => [...prev, newLog]);
        }
      )
      .subscribe();

    logsSubscriptionRef.current = logsChannel;
  };

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      executionSubscriptionRef.current?.unsubscribe();
      logsSubscriptionRef.current?.unsubscribe();
    };
  }, []);

  // Fetch logs for an automation (most recent execution)
  const fetchLogs = async (automationId: string) => {
    try {
      const response = await fetch(`/api/ai/automations/${automationId}/logs`);
      if (response.ok) {
        const data = await response.json();
        setExecutionLogs(data.logs || []);
        setCurrentExecution(data.execution || null);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  // Fetch workflow rules documentation
  const fetchWorkflowRules = async () => {
    setIsLoadingRules(true);
    try {
      const response = await fetch('/api/ai/automations/rules');
      if (response.ok) {
        const data = await response.json();
        setWorkflowRules(data.rules || '');
        setShowRulesModal(true);
      } else {
        console.error('Failed to fetch rules');
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setIsLoadingRules(false);
    }
  };

  // Apply pasted YAML and Mermaid content
  const applyPastedContent = () => {
    let mermaidGenerated = false;

    if (pasteYaml.trim()) {
      const yamlContent = pasteYaml.trim();

      // Parse YAML and generate Mermaid diagram
      try {
        const workflow = yaml.parse(yamlContent) as WorkflowDefinition;
        if (workflow && typeof workflow === 'object') {
          // Ensure required fields
          if (!workflow.trigger) {
            workflow.trigger = { type: 'manual' };
          }
          if (!workflow.steps) {
            workflow.steps = [];
          }

          // Normalize id to snake_case
          const displayName = workflow.name || workflow.id || 'Untitled Workflow';
          const normalizedId = normalizeNameToId(workflow.id || displayName);

          // Update workflow with normalized id
          workflow.id = normalizedId;
          if (!workflow.name) {
            workflow.name = displayName;
          }

          // Generate updated YAML with normalized id
          const updatedYaml = yaml.stringify(workflow);
          setExportedYaml(updatedYaml);

          // Generate Mermaid from workflow
          const mermaid = workflowToMermaid(workflow);
          setMermaidDiagram(mermaid);
          mermaidGenerated = true;

          // Update workflow definition
          setWorkflowDef(workflow);

          // Update automation name/description from YAML
          // automationName is the snake_case id, displayName is human-readable
          setAutomationName(normalizedId);
          setAutomationDisplayName(displayName);
          if (workflow.description) {
            setAutomationDescription(workflow.description);
          }

          // Extract category from YAML if present
          if ((workflow as unknown as { category?: string }).category) {
            setAutomationCategory((workflow as unknown as { category: string }).category);
          }
        }
      } catch (error) {
        console.error('Failed to parse YAML:', error);
        // Still set the YAML even if parsing fails
        setExportedYaml(yamlContent);
      }
    }

    // Only apply pasted Mermaid if we didn't generate one from YAML
    if (pasteMermaid.trim() && !mermaidGenerated) {
      setMermaidDiagram(pasteMermaid.trim());
    }

    setShowPasteModal(false);
    setPasteYaml('');
    setPasteMermaid('');
    // Switch to builder view to see the changes
    setView('builder');
  };

  // Get status icon for last run
  const getStatusIcon = (status: 'success' | 'warning' | 'error' | null) => {
    switch (status) {
      case 'success':
        return <span style={{ color: '#10b981' }}>●</span>;
      case 'warning':
        return <span style={{ color: '#f59e0b' }}>●</span>;
      case 'error':
        return <span style={{ color: '#ef4444' }}>●</span>;
      default:
        return <span style={{ color: '#6b7280' }}>○</span>;
    }
  };

  // Get log level color
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return '#ef4444';
      case 'warn':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      case 'debug':
        return '#6b7280';
      default:
        return '#9ca3af';
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

  // Export to YAML (local, no API call needed)
  const exportToYaml = useCallback(() => {
    try {
      // Parse the current mermaid diagram
      const parsed = parseMermaid(mermaidDiagram);

      // Build schedule config
      const scheduleConfig: ScheduleConfig = {
        scheduleType: selectedSchedule,
        hour: scheduleHour,
        minute: scheduleMinute,
        days: scheduleDays,
        monthDays: scheduleMonthDays,
        weeklyFrequency: weeklyFrequency,
        cronExpression: cronExpression,
      };

      // Convert to workflow definition with schedule config
      const workflow = mermaidToWorkflow(parsed, {
        name: automationName || currentAutomation?.name || 'Untitled Workflow',
        description: automationDescription || currentAutomation?.description,
      }, scheduleConfig);

      // Store the workflow definition
      setWorkflowDef(workflow);

      // Convert to YAML string
      const yamlString = workflowToYamlString(workflow);
      setExportedYaml(yamlString);

      // Open YAML panel in builder view (don't switch away)
      if (view === 'builder') {
        setShowYamlPanel(true);
      } else {
        // Switch to YAML view only if not in builder
        setView('yaml');
      }
    } catch (error) {
      console.error('Failed to export to YAML:', error);
    }
  }, [mermaidDiagram, automationName, automationDescription, currentAutomation, selectedSchedule, scheduleHour, scheduleMinute, scheduleDays, scheduleMonthDays, weeklyFrequency, cronExpression]);

  // Regenerate Mermaid diagram from YAML
  const regenerateMermaidFromYaml = useCallback(() => {
    try {
      if (!exportedYaml.trim()) return;

      // Parse YAML using proper YAML parser
      const workflow = yaml.parse(exportedYaml) as WorkflowDefinition;
      if (!workflow || typeof workflow !== 'object') {
        console.error('Invalid YAML: must be an object');
        return;
      }

      // Ensure required fields
      if (!workflow.trigger) {
        workflow.trigger = { type: 'manual' };
      }
      if (!workflow.steps) {
        workflow.steps = [];
      }

      // Update schedule settings from parsed trigger
      const trigger = workflow.trigger;
      if (trigger.type === 'manual') {
        setSelectedSchedule('manual');
      } else if (trigger.type === 'webhook') {
        setSelectedSchedule('webhook');
      } else if (trigger.type === 'cron' && trigger.schedule) {
        // Parse cron expression to determine schedule type
        const cronParts = trigger.schedule.split(/\s+/);
        if (cronParts.length === 5) {
          const [minute, hour, day, month, weekday] = cronParts;

          // Set hour and minute
          if (hour !== '*') setScheduleHour(parseInt(hour) || 9);
          if (minute !== '*') setScheduleMinute(parseInt(minute) || 0);

          // Determine schedule type
          if (day === '*' && month === '*' && weekday === '*') {
            setSelectedSchedule('daily');
          } else if (day === '*' && month === '*' && weekday !== '*') {
            setSelectedSchedule('weekly');
            const days = weekday.split(',').map(d => parseInt(d)).filter(d => !isNaN(d));
            if (days.length > 0) setScheduleDays(days);
          } else if (day !== '*' && month === '*' && weekday === '*') {
            setSelectedSchedule('monthly');
            const monthDays = day.split(',').map(d => parseInt(d)).filter(d => !isNaN(d));
            if (monthDays.length > 0) setScheduleMonthDays(monthDays);
          } else {
            setSelectedSchedule('cron');
            setCronExpression(trigger.schedule);
          }
        } else {
          setSelectedSchedule('cron');
          setCronExpression(trigger.schedule);
        }
      }

      // Generate Mermaid from workflow using proper converter
      const mermaid = workflowToMermaid(workflow);
      setMermaidDiagram(mermaid);

      // Update workflow definition
      setWorkflowDef(workflow);

      // Update name and description
      // automationName should be snake_case id, displayName is human-readable
      if (workflow.id) {
        setAutomationName(normalizeNameToId(workflow.id));
      } else if (workflow.name) {
        setAutomationName(normalizeNameToId(workflow.name));
      }
      if (workflow.name) {
        setAutomationDisplayName(workflow.name);
      }
      if (workflow.description) {
        setAutomationDescription(workflow.description);
      }
    } catch (error) {
      console.error('Failed to regenerate Mermaid from YAML:', error);
    }
  }, [exportedYaml]);

  // Auto-update YAML when schedule settings change (if YAML exists)
  useEffect(() => {
    if (!exportedYaml || !showYamlPanel) return;

    // Update the trigger section in the YAML
    const lines = exportedYaml.split('\n');
    const newLines: string[] = [];
    let inTrigger = false;
    let triggerUpdated = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === 'trigger:') {
        inTrigger = true;
        newLines.push(line);

        // Generate new trigger content based on schedule settings
        let triggerType = selectedSchedule;
        let schedule = '';

        switch (selectedSchedule) {
          case 'daily':
            triggerType = 'cron';
            schedule = `${scheduleMinute} ${scheduleHour} * * *`;
            break;
          case 'weekly':
            triggerType = 'cron';
            schedule = `${scheduleMinute} ${scheduleHour} * * ${scheduleDays.length > 0 ? scheduleDays.join(',') : '1'}`;
            break;
          case 'monthly':
            triggerType = 'cron';
            schedule = `${scheduleMinute} ${scheduleHour} ${scheduleMonthDays.length > 0 ? scheduleMonthDays.join(',') : '1'} * *`;
            break;
          case 'cron':
            triggerType = 'cron';
            schedule = cronExpression;
            break;
          case 'webhook':
            triggerType = 'webhook';
            break;
          default:
            triggerType = 'manual';
        }

        newLines.push(`  type: ${triggerType}`);
        if (schedule) {
          newLines.push(`  schedule: "${schedule}"`);
        }
        if (triggerType === 'webhook') {
          newLines.push(`  method: POST`);
        }

        triggerUpdated = true;
        continue;
      }

      if (inTrigger) {
        // Skip old trigger content until we hit a new section
        if (trimmed.startsWith('type:') || trimmed.startsWith('schedule:') || trimmed.startsWith('method:') || trimmed.startsWith('timezone:') || trimmed.startsWith('#')) {
          continue;
        }
        // Check if we've hit a new section
        if (!trimmed.startsWith(' ') && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
          inTrigger = false;
          newLines.push('');
          newLines.push(line);
          continue;
        }
        if (trimmed === '' || trimmed.startsWith('#')) {
          continue;
        }
        inTrigger = false;
      }

      newLines.push(line);
    }

    if (triggerUpdated) {
      const newYaml = newLines.join('\n');
      if (newYaml !== exportedYaml) {
        setExportedYaml(newYaml);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchedule, scheduleHour, scheduleMinute, scheduleDays, scheduleMonthDays, cronExpression, showYamlPanel]);

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
    const newId = generateUUID();
    const timestamp = Date.now();
    const defaultDisplayName = `Automation ${timestamp}`;
    const defaultName = `automation_${timestamp}`;

    setTempAutomationId(newId);
    setCurrentAutomation(null);
    setMermaidDiagram('flowchart TD\n  start([Start]) --> end_node([End])');
    setPromptHistory([]);
    setExportHistory([]);
    setExportedCode('');
    setExportedYaml('');
    setWorkflowDef(null);
    setAutomationName(defaultName);
    setAutomationDisplayName(defaultDisplayName);
    setAutomationDescription('');
    setAutomationCategory('general');
    setShowYamlPanel(false);
    setDiagramVersions([]);
    setCurrentVersionIndex(-1);
    setIsEditingName(false);
    setView('builder');

    // Update URL with temp ID (without page reload)
    window.history.pushState({}, '', `/automation?id=${newId}`);
  };

  // Load automation
  const loadAutomation = (auto: Automation) => {
    setTempAutomationId(null); // Clear temp ID when loading existing
    setCurrentAutomation(auto);
    setMermaidDiagram(auto.mermaid_diagram || 'flowchart TD\n  start([Start]) --> end_node([End])');
    setAutomationName(auto.name);
    setAutomationDisplayName(auto.display_name || auto.name);
    setAutomationDescription(auto.description || '');
    setAutomationCategory(auto.category || 'general');
    setSelectedModel(auto.model_id);
    setActivePersonalityIds(auto.personality_ids || []);
    setSelectedSchedule(auto.schedule_type || 'manual');

    // Load schedule config if available
    if (auto.schedule_config) {
      const config = auto.schedule_config;
      if (typeof config.hour === 'number') setScheduleHour(config.hour);
      if (typeof config.minute === 'number') setScheduleMinute(config.minute);
      if (Array.isArray(config.days)) setScheduleDays(config.days as number[]);
      if (Array.isArray(config.monthDays)) setScheduleMonthDays(config.monthDays as number[]);
      if (typeof config.weeklyFrequency === 'number') setWeeklyFrequency(config.weeklyFrequency);
    }
    if (auto.cron_expression) {
      setCronExpression(auto.cron_expression);
    }

    setExportedCode(auto.typescript_code || '');
    setExportedYaml(auto.yaml_definition || '');
    setShowYamlPanel(false);
    // Parse YAML to workflow definition if available
    if (auto.yaml_definition) {
      try {
        const parsed = parseMermaid(auto.mermaid_diagram || '');
        const scheduleConfig: ScheduleConfig = {
          scheduleType: auto.schedule_type || 'manual',
          hour: (auto.schedule_config?.hour as number) || 9,
          minute: (auto.schedule_config?.minute as number) || 0,
          days: (auto.schedule_config?.days as number[]) || [1],
          monthDays: (auto.schedule_config?.monthDays as number[]) || [1],
          cronExpression: auto.cron_expression || undefined,
        };
        const workflow = mermaidToWorkflow(parsed, { name: auto.name, description: auto.description }, scheduleConfig);
        setWorkflowDef(workflow);
      } catch {
        setWorkflowDef(null);
      }
    } else {
      setWorkflowDef(null);
    }
    setView('builder');
    // Update URL with automation ID
    window.history.pushState({}, '', `/automation?id=${auto.id}`);
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
      {/* Show main explorer UI when NOT in builder view */}
      {view !== 'builder' && (
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
          <button onClick={startNew} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>🔧 New Automation</button>
          {currentAutomation && <button onClick={() => setView('history')} style={{ background: view === 'history' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>📜 Prompt History</button>}
          {exportedCode && <button onClick={() => setView('code')} style={{ background: view === 'code' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>💻 Code</button>}
          {currentAutomation && (
            <button
              onClick={() => { fetchLogs(currentAutomation.id); setView('logs'); }}
              style={{
                background: view === 'logs' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)',
                border: view === 'logs' ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: view === 'logs' ? '#3b82f6' : '#fff',
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              📋 Logs {currentAutomation.last_run_status && getStatusIcon(currentAutomation.last_run_status)}
            </button>
          )}

          {/* Run Button */}
          {currentAutomation && currentAutomation.yaml_definition && (
            <button
              onClick={() => {
                // If there are required inputs with human_input flag, show modal
                const hasHumanInputs = currentAutomation.required_inputs &&
                  Object.values(currentAutomation.required_inputs).some(config => config.human_input);
                if (hasHumanInputs) {
                  setShowRunModal(true);
                } else {
                  runAutomation(currentAutomation);
                }
              }}
              disabled={isExecuting}
              style={{
                background: isExecuting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: '#fff',
                cursor: isExecuting ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem',
                opacity: isExecuting ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              {isExecuting ? '⏳ Running...' : '▶️ Run'}
            </button>
          )}

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

          {/* Get Rules Button */}
          <button
            onClick={fetchWorkflowRules}
            disabled={isLoadingRules}
            title="View workflow YAML rules and available tools"
            style={{
              background: 'rgba(139, 92, 246, 0.2)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              color: '#a78bfa',
              cursor: isLoadingRules ? 'wait' : 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {isLoadingRules ? '⏳' : '📖'} Rules
          </button>

          {/* Paste YAML/Mermaid Button */}
          <button
            onClick={() => setShowPasteModal(true)}
            title="Paste existing YAML or Mermaid diagram"
            style={{
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              color: '#f59e0b',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            📥 Import
          </button>

          <button onClick={startNew} style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', marginLeft: 'auto' }}>+ New Automation</button>
        </div>

        {/* LIST VIEW - File Manager Style */}
        {view === 'list' && (
          <AutomationFinder
            automations={automations.map(auto => ({
              id: auto.id,
              name: auto.name,
              display_name: auto.display_name || undefined,
              description: auto.description,
              category: auto.category,
              status: auto.status as 'draft' | 'active' | 'paused' | 'archived',
              schedule_type: auto.schedule_type,
              cron_expression: auto.cron_expression || undefined,
              yaml_definition: auto.yaml_definition || undefined,
              total_runs: auto.total_runs,
              created_at: auto.created_at,
              updated_at: auto.updated_at,
            }))}
            categories={categories}
            onSelectAutomation={(auto) => {
              const fullAuto = automations.find(a => a.id === auto.id);
              if (fullAuto) setCurrentAutomation(fullAuto);
            }}
            onRunAutomation={(auto) => {
              const fullAuto = automations.find(a => a.id === auto.id);
              if (fullAuto) {
                const hasInputs = fullAuto.yaml_definition && fullAuto.yaml_definition.includes('inputs:');
                if (hasInputs) {
                  setCurrentAutomation(fullAuto);
                  setShowRunModal(true);
                } else {
                  runAutomation(fullAuto);
                }
              }
            }}
            onEditAutomation={(auto) => {
              const fullAuto = automations.find(a => a.id === auto.id);
              if (fullAuto) loadAutomation(fullAuto);
            }}
            onDeleteAutomation={(auto) => deleteAutomation(auto.id)}
            onViewExecution={(exec, auto) => {
              const fullAuto = automations.find(a => a.id === auto.id);
              if (fullAuto) {
                setCurrentAutomation(fullAuto);
                fetchLogs(fullAuto.id);
                setView('logs');
              }
            }}
            onViewLogs={(exec) => {
              const auto = automations.find(a => a.id === exec.automation_id);
              if (auto) {
                setCurrentAutomation(auto);
                fetchLogs(auto.id);
                setView('logs');
              }
            }}
            onProvideInput={(exec) => {
              window.open(`/automation/${exec.automation_id}/running/${exec.id}/input`, '_blank');
            }}
            onStopExecution={async (exec) => {
              try {
                await fetch(`/api/ai/automations/${exec.automation_id}/executions/${exec.id}`, {
                  method: 'DELETE',
                });
                fetchAutomations();
              } catch (err) {
                console.error('Failed to stop execution:', err);
              }
            }}
            onDeleteExecution={async (exec) => {
              try {
                await fetch(`/api/ai/automations/${exec.automation_id}/executions/${exec.id}`, {
                  method: 'DELETE',
                });
                fetchAutomations();
              } catch (err) {
                console.error('Failed to delete execution:', err);
              }
            }}
            selectedAutomationId={currentAutomation?.id}
            onCreateNew={startNew}
            onRefresh={fetchAutomations}
          />
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

        {/* YAML VIEW */}
        {view === 'yaml' && exportedYaml && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ color: '#10b981', fontSize: '1.1rem', margin: 0 }}>📄 Workflow YAML</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    const blob = new Blob([exportedYaml], { type: 'text/yaml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${workflowDef?.name || 'workflow'}.yaml`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  💾 Download
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(exportedYaml)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  📋 Copy
                </button>
              </div>
            </div>

            {/* Workflow Info */}
            {workflowDef && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Name: </span>
                    <span style={{ color: '#10b981' }}>{workflowDef.name}</span>
                  </div>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Trigger: </span>
                    <span style={{ color: '#f59e0b' }}>{workflowDef.trigger.type}</span>
                  </div>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Steps: </span>
                    <span style={{ color: '#3b82f6' }}>{workflowDef.steps.length}</span>
                  </div>
                </div>
              </div>
            )}

            {/* YAML Editor */}
            <textarea
              value={exportedYaml}
              onChange={(e) => setExportedYaml(e.target.value)}
              style={{
                width: '100%',
                minHeight: '400px',
                background: 'rgba(0,0,0,0.4)',
                borderRadius: '10px',
                padding: '1rem',
                fontSize: '0.8rem',
                color: '#a5b4fc',
                fontFamily: 'monospace',
                border: '1px solid rgba(255,255,255,0.1)',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />

            {/* Sync back to Mermaid button */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setView('builder')}
                style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                ← Back to Builder
              </button>
            </div>
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

        {/* LOGS VIEW */}
        {view === 'logs' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📋 Execution Logs
                {isExecuting && <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>⏳ Running...</span>}
                {currentExecution?.status === 'completed' && <span style={{ fontSize: '0.8rem', color: '#10b981' }}>✓ Completed</span>}
                {currentExecution?.status === 'failed' && <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>✗ Failed</span>}
                {currentExecution?.status === 'waiting_input' && <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>⏸ Waiting for input</span>}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {currentAutomation && (
                  <button
                    onClick={() => runAutomation(currentAutomation)}
                    disabled={isExecuting}
                    style={{
                      background: isExecuting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.4rem 0.75rem',
                      color: '#fff',
                      cursor: isExecuting ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      opacity: isExecuting ? 0.5 : 1,
                    }}
                  >
                    ▶️ Run Again
                  </button>
                )}
                <button
                  onClick={() => setView('builder')}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  ← Back
                </button>
              </div>
            </div>

            {/* Execution Info */}
            {currentExecution && (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Status: </span>
                    <span style={{ color: currentExecution.status === 'completed' ? '#10b981' : currentExecution.status === 'failed' ? '#ef4444' : '#f59e0b' }}>
                      {currentExecution.status}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Started: </span>
                    <span style={{ color: '#fff' }}>{new Date(currentExecution.started_at).toLocaleTimeString()}</span>
                  </div>
                  {currentExecution.completed_at && (
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Completed: </span>
                      <span style={{ color: '#fff' }}>{new Date(currentExecution.completed_at).toLocaleTimeString()}</span>
                    </div>
                  )}
                  {currentExecution.current_step && (
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Current Step: </span>
                      <span style={{ color: '#3b82f6' }}>{currentExecution.current_step}</span>
                    </div>
                  )}
                </div>
                {currentExecution.error && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>Error: {currentExecution.error}</span>
                  </div>
                )}
              </div>
            )}

            {/* Log Entries */}
            <div style={{
              background: 'rgba(0,0,0,0.5)',
              borderRadius: '10px',
              padding: '1rem',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              maxHeight: '400px',
              overflowY: 'auto',
            }}>
              {executionLogs.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '2rem' }}>
                  {isExecuting ? 'Waiting for logs...' : 'No logs available'}
                </div>
              ) : (
                executionLogs.map((log, i) => (
                  <div key={log.id || i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: '70px' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{ color: getLogLevelColor(log.level), minWidth: '50px' }}>
                      [{log.level}]
                    </span>
                    {log.step_name && (
                      <span style={{ color: '#3b82f6', minWidth: '100px' }}>
                        [{log.step_name}]
                      </span>
                    )}
                    <span style={{ color: '#fff', flex: 1 }}>
                      {log.message}
                      {log.status === 'completed' && log.duration_ms && (
                        <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '0.5rem' }}>
                          ({log.duration_ms}ms)
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
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

        {/* Run Modal - Input Collection */}
        {showRunModal && currentAutomation && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowRunModal(false)}>
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '500px', width: '100%', border: '1px solid rgba(16, 185, 129, 0.3)', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '1.5rem' }}>▶️</div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>Run Automation</h3>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>{currentAutomation.display_name || currentAutomation.name}</p>
                </div>
              </div>

              {/* Required Inputs */}
              {currentAutomation.required_inputs && Object.keys(currentAutomation.required_inputs).length > 0 ? (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    📝 Fill in the required inputs:
                  </p>
                  {Object.entries(currentAutomation.required_inputs).map(([key, config]) => (
                    <div key={key} style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        {key} {config.human_input && <span style={{ color: '#f59e0b' }}>*</span>}
                        {config.description && <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.5rem' }}>({config.description})</span>}
                      </label>
                      {config.type === 'boolean' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!runInputs[key]}
                            onChange={(e) => setRunInputs({ ...runInputs, [key]: e.target.checked })}
                            style={{ width: '18px', height: '18px' }}
                          />
                          <span style={{ color: '#fff', fontSize: '0.85rem' }}>{runInputs[key] ? 'Yes' : 'No'}</span>
                        </label>
                      ) : config.type === 'number' ? (
                        <input
                          type="number"
                          value={(runInputs[key] as number) || ''}
                          onChange={(e) => setRunInputs({ ...runInputs, [key]: parseFloat(e.target.value) || 0 })}
                          placeholder={`Enter ${key}...`}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                      ) : (
                        <input
                          type={config.sensitive ? 'password' : 'text'}
                          value={(runInputs[key] as string) || ''}
                          onChange={(e) => setRunInputs({ ...runInputs, [key]: e.target.value })}
                          placeholder={`Enter ${key}...`}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <p style={{ color: '#10b981', fontSize: '0.85rem', margin: 0, textAlign: 'center' }}>
                    ✅ No inputs required. Ready to run!
                  </p>
                </div>
              )}

              {/* Execution Info */}
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1.25rem' }}>
                <p style={{ color: '#3b82f6', fontSize: '0.8rem', margin: 0 }}>
                  ℹ️ The automation will run in the background. You can view progress in the Logs tab.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowRunModal(false); setRunInputs({}); }}
                  style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowRunModal(false); runAutomation(currentAutomation, runInputs); }}
                  disabled={isExecuting}
                  style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', opacity: isExecuting ? 0.5 : 1 }}
                >
                  {isExecuting ? '⏳ Running...' : '▶️ Run Now'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paste YAML/Mermaid Modal */}
        {showPasteModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowPasteModal(false)}>
            <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '700px', width: '100%', border: '1px solid rgba(245, 158, 11, 0.3)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ fontSize: '1.5rem' }}>📋</div>
                  <div>
                    <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>Paste Workflow</h3>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Import existing YAML or Mermaid diagram</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPasteModal(false)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* YAML Paste Area */}
                <div>
                  <label style={{ display: 'block', color: '#10b981', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    📄 YAML Definition (optional)
                  </label>
                  <textarea
                    value={pasteYaml}
                    onChange={(e) => setPasteYaml(e.target.value)}
                    placeholder={`name: my_workflow\ndescription: What this workflow does\nversion: 1\n\ninputs:\n  query:\n    type: string\n    required: true\n\nsteps:\n  - id: step_1\n    action: connector.tool\n    inputs:\n      param: "{{inputs.query}}"`}
                    style={{
                      width: '100%',
                      minHeight: '150px',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      background: 'rgba(0,0,0,0.3)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      resize: 'vertical',
                    }}
                  />
                </div>

                {/* Mermaid Paste Area */}
                <div>
                  <label style={{ display: 'block', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    📊 Mermaid Diagram (optional)
                  </label>
                  <textarea
                    value={pasteMermaid}
                    onChange={(e) => setPasteMermaid(e.target.value)}
                    placeholder={`flowchart TD\n  start([Start]) --> step1[Step 1]\n  step1 --> step2[Step 2]\n  step2 --> end_node([End])`}
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      background: 'rgba(0,0,0,0.3)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  onClick={() => { setShowPasteModal(false); setPasteYaml(''); setPasteMermaid(''); }}
                  style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  onClick={applyPastedContent}
                  disabled={!pasteYaml.trim() && !pasteMermaid.trim()}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: (!pasteYaml.trim() && !pasteMermaid.trim()) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #f59e0b, #ea580c)',
                    color: '#fff',
                    cursor: (!pasteYaml.trim() && !pasteMermaid.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: (!pasteYaml.trim() && !pasteMermaid.trim()) ? 0.5 : 1,
                  }}
                >
                  ✅ Apply
                </button>
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
      )}

      {/* BUILDER VIEW - Inline with fixed input at bottom */}
      {view === 'builder' && (
        <View maxWidth="100%" marginX="auto" UNSAFE_style={{ paddingBottom: '180px' }}>
          {/* Top Bar: Back + Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}>
            {/* Left: Back button + ID */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setView('list');
                  window.history.pushState({}, '', '/automation');
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ← Back to Automation Explorer
              </button>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                ID: {automationName || 'auto-generated'}
              </span>
            </div>

            {/* Right: Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Play button - only show if we have YAML */}
              {(currentAutomation?.yaml_definition || exportedYaml) && (
                <button
                  onClick={() => {
                    if (currentAutomation) {
                      // Check if automation has human inputs
                      const hasInputs = currentAutomation.yaml_definition?.includes('inputs:') || exportedYaml.includes('inputs:');
                      if (hasInputs) {
                        setShowRunModal(true);
                      } else {
                        runAutomation(currentAutomation);
                      }
                    } else {
                      alert('Please save the automation first');
                    }
                  }}
                  disabled={isExecuting || !currentAutomation}
                  style={{
                    background: isExecuting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.5rem 1rem',
                    color: '#fff',
                    cursor: isExecuting || !currentAutomation ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: isExecuting || !currentAutomation ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title={currentAutomation ? 'Run automation' : 'Save automation first'}
                >
                  {isExecuting ? '⏳' : '▶️'} Run
                </button>
              )}
              <button
                onClick={fetchWorkflowRules}
                style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: '#a78bfa',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                📋 Rules
              </button>
              <button
                onClick={() => setShowSaveModal(true)}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 1.5rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                💾 Save
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div style={{
            display: 'flex',
            flexDirection: showYamlPanel && isLargeScreen ? 'row' : 'column',
            gap: '1rem',
            marginBottom: '1rem',
          }}>
            {/* Mermaid Diagram Panel */}
            <div style={{
              flex: showYamlPanel && isLargeScreen ? '1 1 50%' : '1 1 100%',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
              minHeight: '300px',
            }}>
              {/* Diagram Header with Name */}
              <div style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                {/* Editable Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
                  {isEditingName ? (
                    <input
                      type="text"
                      value={automationDisplayName}
                      onChange={(e) => handleDisplayNameChange(e.target.value)}
                      onBlur={() => setIsEditingName(false)}
                      onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                      autoFocus
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.5)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '1rem',
                        fontWeight: 600,
                        padding: '0.35rem 0.5rem',
                        outline: 'none',
                        width: '100%',
                        maxWidth: '300px',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setIsEditingName(true)}
                      style={{
                        color: '#f59e0b',
                        fontWeight: 600,
                        fontSize: '1rem',
                        cursor: 'pointer',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid transparent',
                      }}
                      title="Click to edit name"
                    >
                      📊 {automationDisplayName || 'Click to name...'}
                    </span>
                  )}
                </div>

                {/* Version Selector */}
                {diagramVersions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button
                      onClick={() => {
                        if (currentVersionIndex > 0) {
                          setCurrentVersionIndex(currentVersionIndex - 1);
                          setMermaidDiagram(diagramVersions[currentVersionIndex - 1].diagram);
                        }
                      }}
                      disabled={currentVersionIndex <= 0}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        color: currentVersionIndex <= 0 ? 'rgba(255,255,255,0.3)' : '#fff',
                        cursor: currentVersionIndex <= 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      ◀
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', padding: '0 0.25rem' }}>
                      v{currentVersionIndex + 1}/{diagramVersions.length}
                    </span>
                    <button
                      onClick={() => {
                        if (currentVersionIndex < diagramVersions.length - 1) {
                          setCurrentVersionIndex(currentVersionIndex + 1);
                          setMermaidDiagram(diagramVersions[currentVersionIndex + 1].diagram);
                        }
                      }}
                      disabled={currentVersionIndex >= diagramVersions.length - 1}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        color: currentVersionIndex >= diagramVersions.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff',
                        cursor: currentVersionIndex >= diagramVersions.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      ▶
                    </button>
                  </div>
                )}

                {/* Diagram Actions */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mermaidDiagram);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.5rem',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                    }}
                    title="Copy Mermaid"
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={exportToYaml}
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.5rem',
                      color: '#10b981',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                    }}
                    title="Generate YAML from diagram"
                  >
                    → YAML
                  </button>
                  <button
                    onClick={() => setShowYamlPanel(!showYamlPanel)}
                    style={{
                      background: showYamlPanel ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)',
                      border: showYamlPanel ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.5rem',
                      color: showYamlPanel ? '#10b981' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                    }}
                  >
                    {showYamlPanel ? '✕ Hide YAML' : '📄 Show YAML'}
                  </button>
                </div>
              </div>

              {/* Mermaid Diagram */}
              <div style={{ padding: '0.5rem' }}>
                <MermaidDiagram
                  definition={mermaidDiagram}
                  title=""
                  editable={true}
                  onDefinitionChange={setMermaidDiagram}
                  minHeight="300px"
                  maxHeight="500px"
                />
              </div>
            </div>

            {/* YAML Panel */}
            {showYamlPanel && (
              <div style={{
                flex: isLargeScreen ? '1 1 50%' : '1 1 100%',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '300px',
                maxHeight: isLargeScreen ? '600px' : '400px',
              }}>
                {/* YAML Header */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}>
                  <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>📄 YAML Definition</span>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(exportedYaml);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '6px',
                        padding: '0.35rem 0.5rem',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                      }}
                      title="Copy YAML"
                    >
                      📋 Copy
                    </button>
                    <button
                      onClick={regenerateMermaidFromYaml}
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '6px',
                        padding: '0.35rem 0.5rem',
                        color: '#f59e0b',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                      }}
                      title="Regenerate diagram from YAML"
                    >
                      ← Diagram
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([exportedYaml], { type: 'text/yaml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${automationName || 'workflow'}.yaml`;
                        a.click();
                      }}
                      style={{
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '6px',
                        padding: '0.35rem 0.5rem',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                      }}
                    >
                      ⬇️ Download
                    </button>
                  </div>
                </div>

                {/* YAML Editor */}
                <textarea
                  value={exportedYaml}
                  onChange={(e) => setExportedYaml(e.target.value)}
                  placeholder="Click '→ YAML' on the diagram to generate, or paste your YAML here..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#e2e8f0',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    padding: '1rem',
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            )}
          </div>

          {/* AI Messages Area - Shows generation feedback */}
          <div style={{
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '1rem',
            minHeight: '80px',
            marginBottom: '1rem',
          }}>
            {/* Retrieval events during generation */}
            {isGenerating && (retrievalEvents.isSearching || retrievalEvents.ragEvents || retrievalEvents.isSending) && (
              <div style={{ marginBottom: '0.5rem' }}>
                <RetrievalEventsDisplay data={retrievalEvents} />
              </div>
            )}

            {/* Generation in progress indicator */}
            {isGenerating && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem',
                background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: '8px',
                marginBottom: '0.5rem',
              }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>⚡</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Generating workflow...</span>
              </div>
            )}

            {/* Last generation stats and explanation */}
            {!isGenerating && (lastTokenUsage || lastExplanation) && (
              <div>
                {lastExplanation && (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: 'rgba(255,255,255,0.8)',
                    marginBottom: lastTokenUsage ? '0.5rem' : 0,
                    lineHeight: 1.5,
                  }}>
                    <span style={{ color: '#f59e0b', marginRight: '0.5rem' }}>🤖</span>
                    {lastExplanation}
                  </div>
                )}
                {lastTokenUsage && (
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Tokens used:</span>
                    <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>↑ {lastTokenUsage.input}</span>
                    <span style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#60a5fa' }}>↓ {lastTokenUsage.output}</span>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!isGenerating && !lastExplanation && !lastTokenUsage && (
              <div style={{
                textAlign: 'center',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '0.85rem',
                padding: '1rem',
              }}>
                Describe your workflow below to get started
              </div>
            )}
          </div>
        </View>
      )}

      {/* Fixed Chat Input at Bottom */}
      {view === 'builder' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, rgba(15,15,26,0.98) 0%, rgba(15,15,26,0.95) 80%, transparent 100%)',
          padding: '1rem',
          paddingTop: '1.5rem',
          zIndex: 100,
        }}>
          <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
            <ChatInputArea
              message={prompt}
              setMessage={setPrompt}
              onSend={generateFlow}
              onStop={stopRequest}
              isLoading={isGenerating}
              placeholder="Describe your workflow changes..."
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
        totalToolsCount={totalToolsCount}
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
        scheduleHour={scheduleHour}
        setScheduleHour={setScheduleHour}
        scheduleMinute={scheduleMinute}
        setScheduleMinute={setScheduleMinute}
        scheduleDays={scheduleDays}
        setScheduleDays={setScheduleDays}
        scheduleMonthDays={scheduleMonthDays}
        setScheduleMonthDays={setScheduleMonthDays}
        weeklyFrequency={weeklyFrequency}
        setWeeklyFrequency={setWeeklyFrequency}
        cronExpression={cronExpression}
        setCronExpression={setCronExpression}
        cronError={cronError}
        setCronError={setCronError}
        automationId={currentAutomation?.id}
        webhookInputs={workflowDef?.inputs ? Object.entries(workflowDef.inputs).map(([name, def]) => ({
          name,
          type: (def as { type?: string }).type || 'string',
          required: (def as { required?: boolean }).required || false,
        })) : []}
      />

      {/* Workflow Rules Modal - Global so it works from both list and builder views */}
      {showRulesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowRulesModal(false)}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', padding: '1.5rem', maxWidth: '800px', width: '100%', border: '1px solid rgba(139, 92, 246, 0.3)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem' }}>📖</div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>Workflow YAML Rules</h3>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Reference for building automations</p>
                </div>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '1rem' }}>
              <pre style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.8rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                {workflowRules}
              </pre>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '0.75rem', marginTop: '1rem' }}>
              <p style={{ color: '#3b82f6', fontSize: '0.8rem', margin: 0 }}>
                💡 <strong>Tip:</strong> Download these rules to use with AI coding assistants like Claude, Augment, or Cursor.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(workflowRules);
                  alert('Rules copied to clipboard!');
                }}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                📋 Copy
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([workflowRules], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'claude.md';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title="Download as claude.md for Claude Projects"
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                ⬇️ claude.md
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([workflowRules], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = '.augment-guidelines';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title="Download as .augment-guidelines for Augment Code"
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                ⬇️ .augment-guidelines
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([workflowRules], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = '.cursorrules';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title="Download as .cursorrules for Cursor"
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                ⬇️ .cursorrules
              </button>
              <button
                onClick={() => setShowRulesModal(false)}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Close
              </button>
            </div>
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
              <Link href="/dashboard" onClick={() => setViewingPersona(null)} style={{ color: '#f59e0b', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>✏️</span> Edit in Dashboard
              </Link>
            </div>

            <button onClick={() => setViewingPersona(null)} style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Close</button>
          </div>
        </div>
      )}

      {/* Save Modal - Global so it works from both list and builder views */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '1.5rem', maxWidth: '450px', width: '90%' }}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>💾 Save Automation</h3>

            {/* Display Name */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Display Name</label>
              <input
                type="text"
                value={automationDisplayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="My Awesome Automation"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
              />
            </div>

            {/* ID (auto-generated from display name) */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>ID (snake_case)</label>
              <input
                type="text"
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                placeholder="my_awesome_automation"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontFamily: 'monospace' }}
              />
            </div>

            {/* Category with create new option */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Category</label>
              {!showNewCategoryInput ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    value={automationCategory}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setShowNewCategoryInput(true);
                      } else {
                        setAutomationCategory(e.target.value);
                      }
                    }}
                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'white\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                    ))}
                    <option value="__new__">➕ Create New Category...</option>
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={newCategoryIcon}
                    onChange={(e) => setNewCategoryIcon(e.target.value)}
                    style={{ width: '50px', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', textAlign: 'center', fontSize: '1.1rem' }}
                    placeholder="📦"
                  />
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name..."
                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
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
                          const newCat = { id: data.category.name.toLowerCase().replace(/\s+/g, '_'), label: data.category.name, icon: data.category.icon };
                          setCategories(prev => [...prev, newCat]);
                          setAutomationCategory(newCat.id);
                          setShowNewCategoryInput(false);
                          setNewCategoryName('');
                          setNewCategoryIcon('📦');
                        }
                      } catch (err) {
                        console.error('Failed to create category:', err);
                      }
                    }}
                    style={{ padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                      setNewCategoryIcon('📦');
                    }}
                    style={{ padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Description (optional)</label>
              <textarea
                value={automationDescription}
                onChange={(e) => setAutomationDescription(e.target.value)}
                placeholder="What does this automation do?"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', minHeight: '80px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSaveModal(false)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveAutomation} disabled={!automationName.trim()} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', opacity: !automationName.trim() ? 0.5 : 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </View>
  );
};
