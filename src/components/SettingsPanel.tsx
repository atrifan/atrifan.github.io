'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';
import { AI_MODELS, formatCurrency, formatTokenCount } from '../config/ai-tokens.config';

// Types
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

interface Personality {
  id: string;
  name: string;
  icon: string;
  description?: string;
  system_prompt: string;
  prompt_token_count: number;
  is_default: boolean;
}

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

interface Conversation {
  id: string;
  title: string;
  message_count: number;
}

interface AutomationBase {
  id: string;
  name: string;
  description?: string;
  schedule_type: string;
  status: string;
}

interface AutomationFolder {
  name: string;
  automations: AutomationBase[];
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

interface ExternalAgent {
  id: string;
  agent_name: string;
  display_name: string;
  description?: string;
  agent_url: string;
  icon_url?: string;
}

interface BudgetData {
  budget: { monthlyBudgetUsd: number };
  usage: { totalCost: number; budgetUsedPercent: number; remainingBudget: number; totalTokens: number; byModel?: Record<string, { inputTokens: number; outputTokens: number }> };
  models: Array<{ modelId: string; usedCost: number; requestCount: number; usagePercent: number }>;
}

// Donut chart component
const UsageDonut: React.FC<{ percent: number; size?: number; strokeWidth?: number }> = ({ percent, size = 32, strokeWidth = 4 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent > 90 ? '#ef4444' : percent > 70 ? '#f59e0b' : '#10b981';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
};

export type SettingsPanelMode = 'main' | 'connectors' | 'personas' | 'rags' | 'run-settings' | 'history';

export interface SettingsPanelProps {
  // Mode: 'chat' or 'automation'
  mode: 'chat' | 'automation';
  
  // Visibility
  isOpen: boolean;
  onClose: () => void;
  isLargeScreen: boolean;
  
  // Panel mode
  panelMode: SettingsPanelMode;
  setPanelMode: (mode: SettingsPanelMode) => void;
  
  // Budget
  budgetData: BudgetData | null;
  tier: 'free' | 'pro' | 'plus';
  
  // Model selection (no external agents for automation)
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableModels: typeof AI_MODELS;
  
  // External agents (chat only)
  externalAgentConnectors?: Connector[];
  externalAgentUsage?: Record<string, { input: number; output: number; count: number }>;
  
  // Connectors
  connectors: Connector[];
  removeConnector: (id: string) => void;
  availableMcpServers: MCPServer[];
  addInternalMcpConnector: (server: MCPServer) => void;
  addExternalMcpConnector: (server: MCPServer) => void;
  totalToolsCount?: number; // Total number of tools available
  
  // External agents for adding (chat only)
  availableAgents?: ExternalAgent[];
  addExternalAgentConnector?: (agent: ExternalAgent) => void;
  
  // Personas
  personalities: Personality[];
  activePersonalityIds: string[];
  togglePersonality: (id: string) => void;
  setViewingPersona?: (p: Personality | null) => void;

  // RAGs (Knowledge Bases)
  rags?: RAG[];
  activeRagIds?: string[];
  toggleRag?: (id: string) => void;

  // Reasoning toggle (chat only, always enabled for automation)
  enableReasoning?: boolean;
  setEnableReasoning?: (enabled: boolean) => void;
  showReasoningToggle?: boolean;
  isExternalAgentSelected?: boolean;
  onShowReasoningInfo?: () => void;
  
  // History (chat mode)
  conversations?: Conversation[];
  currentConversationId?: string | null;
  loadConversation?: (id: string) => void;
  confirmDeleteConversation?: (id: string, e: React.MouseEvent) => void;
  confirmClearAllHistory?: () => void;

  // History memory toggle (embeds chat history to Upstash for semantic search)
  historyMemoryEnabled?: boolean;
  setHistoryMemoryEnabled?: (enabled: boolean) => void;

  // History search
  historySearchQuery?: string;
  setHistorySearchQuery?: (query: string) => void;
  historySearchResults?: Array<{ chatId: string; topScore: number; messages: Array<{ content: string; messageType: string }> }>;
  onHistorySearch?: () => void;
  isSearchingHistory?: boolean;
  
  // Automations (automation mode) - folder structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  automationFolders?: Array<{ name: string; automations: any[] }>;
  currentAutomationId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadAutomation?: (auto: any) => void;
  deleteAutomation?: (id: string) => void;
  
  // New item action
  onNewItem: () => void;
  newItemLabel: string;
  
  // Run settings (automation mode)
  scheduleOptions?: Array<{ id: string; label: string; icon: string; comingSoon?: boolean }>;
  selectedSchedule?: string;
  setSelectedSchedule?: (schedule: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = (props) => {
  const {
    mode,
    isOpen,
    onClose,
    isLargeScreen,
    panelMode,
    setPanelMode,
    budgetData,
    tier,
    selectedModel,
    setSelectedModel,
    availableModels,
    externalAgentConnectors = [],
    externalAgentUsage = {},
    connectors,
    removeConnector,
    availableMcpServers,
    addInternalMcpConnector,
    addExternalMcpConnector,
    totalToolsCount = 0,
    availableAgents = [],
    addExternalAgentConnector,
    personalities,
    activePersonalityIds,
    togglePersonality,
    setViewingPersona,
    rags = [],
    activeRagIds = [],
    toggleRag,
    enableReasoning = false,
    setEnableReasoning,
    showReasoningToggle = false,
    isExternalAgentSelected = false,
    onShowReasoningInfo,
    conversations = [],
    currentConversationId,
    loadConversation,
    confirmDeleteConversation,
    confirmClearAllHistory,
    historyMemoryEnabled = false,
    setHistoryMemoryEnabled,
    historySearchQuery = '',
    setHistorySearchQuery,
    historySearchResults = [],
    onHistorySearch,
    isSearchingHistory = false,
    automationFolders = [],
    currentAutomationId,
    loadAutomation,
    deleteAutomation,
    onNewItem,
    newItemLabel,
    scheduleOptions = [],
    selectedSchedule,
    setSelectedSchedule,
  } = props;

  // Model dropdown state
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [modelStatsExpanded, setModelStatsExpanded] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    if (showModelDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  if (!isOpen) return null;

  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);
  const selectedAgentConnector = externalAgentConnectors.find(c => selectedModel === `agent:${c.id}`);
  const isAgentSelected = selectedModel.startsWith('agent:');

  // Budget calculations
  const totalCostSpent = budgetData?.usage.totalCost || 0;
  const monthlyBudget = budgetData?.budget.monthlyBudgetUsd || 5;
  const budgetUsagePercent = budgetData?.usage.budgetUsedPercent || 0;

  const settingsTitle = mode === 'chat' ? 'Chat Settings' : 'Automation Settings';
  const gradientColors = mode === 'chat'
    ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
    : 'linear-gradient(135deg, #f59e0b, #ea580c)';

  return (
    <>
      {/* Backdrop for large screens */}
      {isLargeScreen && <div className="chat-sidebar-backdrop open" onClick={onClose} />}
      <div className={isLargeScreen ? 'chat-sidebar-panel open' : 'chat-mobile-overlay'}>
        {/* Header */}
        <div className={isLargeScreen ? 'chat-sidebar-header' : 'chat-mobile-overlay-header'}>
          {panelMode === 'main' ? (
            <>
              <button
                onClick={() => { onNewItem(); onClose(); }}
                style={{ padding: '0.4rem 0.75rem', background: gradientColors, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                ✨ {newItemLabel}
              </button>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 600, flex: 1, textAlign: 'center' }}>{settingsTitle}</h2>
            </>
          ) : (
            <>
              <button onClick={() => setPanelMode('main')} style={{ background: 'none', border: 'none', color: mode === 'chat' ? '#8b5cf6' : '#f59e0b', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>← Back</button>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 600, flex: 1, textAlign: 'center' }}>
                {panelMode === 'connectors' && '🔌 Connectors'}
                {panelMode === 'personas' && '🎭 Personas'}
                {panelMode === 'rags' && '📚 Knowledge Bases'}
                {panelMode === 'run-settings' && '⏰ Run Settings'}
                {panelMode === 'history' && '🧠 History Memory'}
              </h2>
            </>
          )}
          <button onClick={() => { onClose(); setPanelMode('main'); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>✕</button>
        </div>

        {/* Scrollable Content */}
        <div className={isLargeScreen ? 'chat-sidebar-scrollable' : 'chat-mobile-overlay-content'}>
          {/* MAIN MODE */}
          {panelMode === 'main' && (
            <>
              {/* Budget Indicator */}
              <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>💰 Budget</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{formatCurrency(totalCostSpent)} / {formatCurrency(monthlyBudget)}</span>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${budgetUsagePercent}%`, height: '100%', background: budgetUsagePercent > 90 ? '#ef4444' : budgetUsagePercent > 70 ? '#f59e0b' : '#10b981', borderRadius: '8px' }} />
                </div>
              </div>

              {/* Model Selection */}
              <div style={{ marginBottom: '1.5rem' }} ref={modelDropdownRef}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  {mode === 'chat' ? 'Model / Agent' : 'Model'}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.75rem', color: '#fff', fontSize: '1rem', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      {mode === 'chat' && isAgentSelected && selectedAgentConnector ? (
                        <>
                          <FaviconImage iconUrl={selectedAgentConnector.icon_url || undefined} baseUrl={selectedAgentConnector.external_url?.startsWith('http') ? selectedAgentConnector.external_url : undefined} size={20} fallbackEmoji="🤖" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedAgentConnector.display_name}</span>
                        </>
                      ) : (
                        <>
                          <span>{selectedModelData?.icon || '💬'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedModelData?.name || 'Select Model'}</span>
                        </>
                      )}
                    </div>
                    <span style={{ transform: showModelDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
                  </button>
                  {showModelDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', maxHeight: '300px', overflowY: 'auto', zIndex: 100 }}>
                      <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>AI Models</div>
                      {availableModels.map(m => (
                        <button key={m.id} onClick={() => { setSelectedModel(m.id); setShowModelDropdown(false); }} style={{ width: '100%', padding: '0.6rem 0.75rem', background: selectedModel === m.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textAlign: 'left' }}>
                          <span>{m.icon}</span>
                          <span>{m.name}</span>
                        </button>
                      ))}
                      {/* External Agents - Chat mode only */}
                      {mode === 'chat' && externalAgentConnectors.length > 0 && (
                        <>
                          <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>External Agents</div>
                          {externalAgentConnectors.map(agent => (
                            <button key={agent.id} onClick={() => { setSelectedModel(`agent:${agent.id}`); setShowModelDropdown(false); }} style={{ width: '100%', padding: '0.6rem 0.75rem', background: selectedModel === `agent:${agent.id}` ? 'rgba(16, 185, 129, 0.2)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textAlign: 'left' }}>
                              <FaviconImage iconUrl={agent.icon_url || undefined} baseUrl={agent.external_url?.startsWith('http') ? agent.external_url : undefined} size={20} fallbackEmoji="🤖" />
                              <span>{agent.display_name}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Usage Statistics Collapsible */}
              {budgetData && budgetData.models.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <button onClick={() => setModelStatsExpanded(!modelStatsExpanded)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <span>📊 Usage Statistics</span>
                    <span style={{ transform: modelStatsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                  </button>
                  {modelStatsExpanded && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                      {/* Token Summary */}
                      <div style={{ padding: '0.5rem', marginBottom: '0.5rem', background: mode === 'chat' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', border: `1px solid ${mode === 'chat' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem' }}>Total Tokens Used</span>
                          <span style={{ color: mode === 'chat' ? '#a78bfa' : '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>{formatTokenCount(budgetData.usage.totalTokens)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.6rem' }}>
                          <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                            ↑ {formatTokenCount(Object.values(budgetData.usage.byModel || {}).reduce((sum, m) => sum + m.inputTokens, 0))} in
                          </span>
                          <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                            ↓ {formatTokenCount(Object.values(budgetData.usage.byModel || {}).reduce((sum, m) => sum + m.outputTokens, 0))} out
                          </span>
                        </div>
                      </div>
                      {/* Model Stats */}
                      {availableModels.map(m => {
                        const modelBudget = budgetData.models.find(b => b.modelId === m.id);
                        const modelUsage = budgetData.usage.byModel?.[m.id];
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '1rem' }}>{m.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>
                                {modelBudget?.requestCount || 0} req • {formatCurrency(modelBudget?.usedCost || 0)}
                                {modelUsage ? <span> • ↑{formatTokenCount(modelUsage.inputTokens)} ↓{formatTokenCount(modelUsage.outputTokens)}</span> : <span> • ↑0 ↓0</span>}
                              </div>
                            </div>
                            <UsageDonut percent={modelBudget?.usagePercent || 0} size={24} strokeWidth={3} />
                          </div>
                        );
                      })}
                      {/* External Agent Stats - Chat mode only */}
                      {mode === 'chat' && externalAgentConnectors.map(agent => {
                        const agentUsage = externalAgentUsage[`agent:${agent.id}`];
                        return (
                          <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <FaviconImage iconUrl={agent.icon_url || undefined} baseUrl={agent.external_url?.startsWith('http') ? agent.external_url : undefined} size={20} fallbackEmoji="🤖" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.display_name}</div>
                              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>
                                {agentUsage?.count || 0} req • $0.00 • ↑{formatTokenCount(agentUsage?.input || 0)} ↓{formatTokenCount(agentUsage?.output || 0)} <span style={{ color: '#10b981' }}>(free)</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Reasoning Toggle - Chat mode only, when connectors exist */}
              {mode === 'chat' && showReasoningToggle && connectors.length > 0 && (
                <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                      <span style={{ fontSize: '1rem' }}>🧠</span>
                      <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>Enable reasoning</span>
                      {onShowReasoningInfo && (
                        <button onClick={onShowReasoningInfo} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.1rem 0.3rem' }} title="Learn more">ⓘ</button>
                      )}
                    </div>
                    <button
                      onClick={() => !isExternalAgentSelected && setEnableReasoning?.(!enableReasoning)}
                      disabled={isExternalAgentSelected}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: isExternalAgentSelected ? 'rgba(255,255,255,0.1)' : enableReasoning ? '#8b5cf6' : 'rgba(255,255,255,0.2)', cursor: isExternalAgentSelected ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: isExternalAgentSelected ? 0.5 : 1 }}
                    >
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: enableReasoning && !isExternalAgentSelected ? '23px' : '3px', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                  {isExternalAgentSelected && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>
                      <span>ⓘ</span>
                      <span>Cannot use external agents to reason through connectors</span>
                    </div>
                  )}
                </div>
              )}

              {/* Reasoning Always Enabled Notice - Automation mode */}
              {mode === 'automation' && connectors.length > 0 && (
                <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>🧠</span>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>Reasoning enabled</span>
                    <span style={{ background: '#10b981', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600 }}>Always ON</span>
                  </div>
                  <div style={{ marginTop: '0.35rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>
                    Automations always use reasoning for reliable tool execution
                  </div>
                </div>
              )}

              {/* Connectors Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔌 Connectors</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {totalToolsCount > 0 && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>🔧 {totalToolsCount} tools</span>}
                    {connectors.length > 0 && <span style={{ background: mode === 'chat' ? '#8b5cf6' : '#f59e0b', color: '#fff', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 600 }}>{connectors.length}</span>}
                  </div>
                </div>
                {connectors.length > 0 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    {connectors.map(c => {
                      // In automation mode, don't show external agents
                      if (mode === 'automation' && c.connector_type === 'external_agent') return null;
                      const typeConfig = c.connector_type === 'external_agent'
                        ? { bg: 'rgba(16, 185, 129, 0.1)', badge: 'Agent', badgeBg: '#10b981' }
                        : c.connector_type === 'external_mcp'
                        ? { bg: 'rgba(59, 130, 246, 0.1)', badge: 'Ext MCP', badgeBg: '#3b82f6' }
                        : { bg: 'rgba(139, 92, 246, 0.1)', badge: 'Native', badgeBg: '#8b5cf6' };
                      const fallbackUrl = c.external_url?.startsWith('http') ? c.external_url : undefined;
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: typeConfig.bg, borderRadius: '8px', marginBottom: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                            <FaviconImage iconUrl={c.icon_url || undefined} baseUrl={fallbackUrl} size={20} fallbackEmoji={c.icon || (c.connector_type === 'external_agent' ? '🤖' : c.connector_type === 'external_mcp' ? '🌐' : '🔧')} />
                            <span style={{ color: '#fff', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.display_name}</span>
                            <span style={{ background: typeConfig.badgeBg, color: '#fff', padding: '0.1rem 0.3rem', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 600, flexShrink: 0 }}>{typeConfig.badge}</span>
                          </div>
                          <button onClick={() => removeConnector(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setPanelMode('connectors')} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Connector</button>
              </div>

              {/* Personas Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎭 Personas</span>
                  {activePersonalityIds.length > 0 && <span style={{ background: '#f59e0b', color: '#000', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 600 }}>{activePersonalityIds.length}</span>}
                </div>
                {activePersonalityIds.length > 0 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    {activePersonalityIds.map(id => {
                      const p = personalities.find(p => p.id === id);
                      return p ? (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', marginBottom: '0.25rem' }}>
                          <span style={{ color: '#fff', fontSize: '0.85rem' }}>{p.icon} {p.name}</span>
                          <button onClick={() => togglePersonality(id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                <button onClick={() => setPanelMode('personas')} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Persona</button>
              </div>

              {/* Knowledge Bases (RAGs) Section */}
              {rags.length > 0 || toggleRag ? (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📚 Knowledge Bases</span>
                    {activeRagIds.length > 0 && <span style={{ background: mode === 'chat' ? '#8b5cf6' : '#f59e0b', color: '#fff', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 600 }}>{activeRagIds.length}</span>}
                  </div>
                  {activeRagIds.length > 0 && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      {rags.filter(r => activeRagIds.includes(r.id)).map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '1rem' }}>{r.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#fff', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>{r.document_count} docs • {r.total_tokens.toLocaleString()} tokens</div>
                          </div>
                          {toggleRag && (
                            <button onClick={() => toggleRag(r.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setPanelMode('rags')} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Knowledge Base</button>
                </div>
              ) : null}

              {/* Run Settings Button - Automation mode only */}
              {mode === 'automation' && scheduleOptions.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⏰ Run Settings</span>
                    {selectedSchedule && <span style={{ background: '#f59e0b', color: '#000', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 600 }}>{selectedSchedule}</span>}
                  </div>
                  <button onClick={() => setPanelMode('run-settings')} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>Configure Runtime</button>
                </div>
              )}

              {/* History Memory Section - Chat and Automation modes */}
              {(mode === 'chat' || mode === 'automation') && setHistoryMemoryEnabled && (
                <div style={{ marginBottom: '1.5rem' }}>
                  {/* History Memory Toggle */}
                  <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                        <span style={{ fontSize: '1rem' }}>🧠</span>
                        <div>
                          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>History Memory</span>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Auto-inject semantic context</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setHistoryMemoryEnabled(!historyMemoryEnabled)}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: historyMemoryEnabled ? '#10b981' : 'rgba(255,255,255,0.2)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                      >
                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: historyMemoryEnabled ? '23px' : '3px', transition: 'left 0.2s' }} />
                      </button>
                    </div>
                  </div>
                  {/* Search History Button */}
                  <button onClick={() => setPanelMode('history')} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>📜 Search History</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{mode === 'chat' ? `${conversations.length} chats` : `${automationFolders.reduce((sum, f) => sum + f.automations.length, 0)} automations`}</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* CONNECTORS MODE */}
          {panelMode === 'connectors' && (
            <div>
              {/* Internal MCP Servers - Pro/Plus only */}
              {tier !== 'free' && availableMcpServers.filter(s => s.source_type === 'native' || s.source_type === 'api_key').length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Internal MCP Servers</div>
                  {availableMcpServers.filter(s => s.source_type === 'native' || s.source_type === 'api_key').map(server => {
                    const isConnected = connectors.find(c => c.external_url === `api_key:${server.id}`);
                    return (
                      <div key={server.id} onClick={() => { if (!isConnected) { addInternalMcpConnector(server); } setPanelMode('main'); }} style={{ padding: '0.75rem', background: isConnected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer', border: isConnected ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent' }}>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{server.display_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{server.toolCount} tools</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* External MCP Servers - Pro/Plus only */}
              {tier !== 'free' && availableMcpServers.filter(s => s.source_type === 'mcp_import').length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>🌐 External MCP Servers</div>
                  {availableMcpServers.filter(s => s.source_type === 'mcp_import').map(server => (
                    <div key={server.id} onClick={() => { if (!connectors.find(c => c.mcp_server_id === server.id)) { addExternalMcpConnector(server); } setPanelMode('main'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: connectors.find(c => c.mcp_server_id === server.id) ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer', border: connectors.find(c => c.mcp_server_id === server.id) ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent' }}>
                      <FaviconImage baseUrl={server.source_url} size={28} fallbackEmoji="🌐" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{server.display_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{server.toolCount || 0} tools</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Free tier notice for MCP servers */}
              {tier === 'free' && (
                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '12px', border: '1px solid rgba(102, 126, 234, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>🔌</span>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>MCP Connectors</span>
                    <span style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600 }}>PRO</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', margin: 0 }}>
                    MCP server connectors are available for Pro and Plus subscribers. Free users can use external A2A agents.
                  </p>
                </div>
              )}

              {/* External Agents - Chat mode only */}
              {mode === 'chat' && availableAgents.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>🤖 External Agents</div>
                  {availableAgents.map(agent => (
                    <div key={agent.id} onClick={() => { if (!connectors.find(c => c.external_url === agent.agent_url) && addExternalAgentConnector) { addExternalAgentConnector(agent); } setPanelMode('main'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: connectors.find(c => c.external_url === agent.agent_url) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem', cursor: 'pointer', border: connectors.find(c => c.external_url === agent.agent_url) ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent' }}>
                      <FaviconImage iconUrl={agent.icon_url || undefined} baseUrl={agent.agent_url} size={28} fallbackEmoji="🤖" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{agent.display_name}</div>
                        {agent.description && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Manage in Dashboard Link */}
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                <Link href="/dashboard" style={{ color: mode === 'chat' ? '#a78bfa' : '#f59e0b', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>⚙️</span> Manage Connectors in Dashboard
                </Link>
              </div>
            </div>
          )}

          {/* PERSONAS MODE */}
          {panelMode === 'personas' && (
            <div>
              {personalities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🎭</span>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>No personas yet</p>
                  <Link href="/dashboard" style={{ color: mode === 'chat' ? '#a78bfa' : '#f59e0b', textDecoration: 'underline', fontSize: '0.85rem' }}>Create in Dashboard →</Link>
                </div>
              ) : (
                <>
                  {personalities.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: activePersonalityIds.includes(p.id) ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem', border: activePersonalityIds.includes(p.id) ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent' }}>
                      <div onClick={() => { togglePersonality(p.id); setPanelMode('main'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'pointer' }}>
                        <span style={{ fontSize: '1.25rem' }}>{p.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</div>
                          {p.description && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description}</div>}
                        </div>
                      </div>
                      {setViewingPersona && (
                        <button onClick={(e) => { e.stopPropagation(); setViewingPersona(p); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.5rem', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.75rem' }} title="View details">ℹ️</button>
                      )}
                    </div>
                  ))}
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                    <Link href="/dashboard" style={{ color: mode === 'chat' ? '#a78bfa' : '#f59e0b', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>✏️</span> Manage Personas in Dashboard
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}

          {/* RAGS MODE */}
          {panelMode === 'rags' && (
            <div>
              {rags.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📚</span>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>No knowledge bases yet</p>
                  <Link href="/dashboard/rag-import" style={{ color: mode === 'chat' ? '#a78bfa' : '#f59e0b', textDecoration: 'underline', fontSize: '0.85rem' }}>Create in Dashboard →</Link>
                </div>
              ) : (
                <>
                  {rags.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: activeRagIds.includes(r.id) ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem', border: activeRagIds.includes(r.id) ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent', cursor: 'pointer' }}
                      onClick={() => { toggleRag?.(r.id); setPanelMode('main'); }}
                    >
                      <span style={{ fontSize: '1.25rem' }}>{r.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{r.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{r.document_count} docs • {r.total_tokens.toLocaleString()} tokens</div>
                      </div>
                      {activeRagIds.includes(r.id) && <span style={{ color: mode === 'chat' ? '#8b5cf6' : '#f59e0b', fontSize: '1rem' }}>✓</span>}
                    </div>
                  ))}
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                    <Link href="/dashboard/rag-import" style={{ color: mode === 'chat' ? '#a78bfa' : '#f59e0b', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>➕</span> Create New Knowledge Base
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}

          {/* RUN SETTINGS MODE - Automation only */}
          {panelMode === 'run-settings' && mode === 'automation' && (
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Schedule Type</div>
                {scheduleOptions.map(opt => (
                  <div
                    key={opt.id}
                    onClick={() => { if (!opt.comingSoon && setSelectedSchedule) { setSelectedSchedule(opt.id); setPanelMode('main'); } }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      background: selectedSchedule === opt.id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      marginBottom: '0.5rem',
                      cursor: opt.comingSoon ? 'not-allowed' : 'pointer',
                      border: selectedSchedule === opt.id ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                      opacity: opt.comingSoon ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>{opt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{opt.label}</div>
                    </div>
                    {opt.comingSoon && (
                      <span style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem' }}>Coming Soon</span>
                    )}
                    {selectedSchedule === opt.id && !opt.comingSoon && (
                      <span style={{ color: '#f59e0b', fontSize: '1rem' }}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HISTORY MODE - Chat and Automation */}
          {panelMode === 'history' && (
            <div>
              {/* Semantic Search - always available */}
              {setHistorySearchQuery && onHistorySearch && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>🔍 Semantic Search</div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onHistorySearch(); }}
                      placeholder="Search past conversations..."
                      style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                    />
                    <button
                      onClick={onHistorySearch}
                      disabled={isSearchingHistory}
                      style={{ background: mode === 'chat' ? '#8b5cf6' : '#f59e0b', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#fff', cursor: isSearchingHistory ? 'wait' : 'pointer', fontSize: '0.85rem' }}
                    >
                      {isSearchingHistory ? '...' : '🔍'}
                    </button>
                  </div>

                  {/* Search Results */}
                  {historySearchResults.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.5rem' }}>Found {historySearchResults.length} related conversation{historySearchResults.length > 1 ? 's' : ''}</div>
                      {historySearchResults.map((result, idx) => (
                        <div
                          key={result.chatId || idx}
                          onClick={() => { loadConversation?.(result.chatId); onClose(); }}
                          style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ color: mode === 'chat' ? '#8b5cf6' : '#f59e0b', fontSize: '0.7rem', fontWeight: 600 }}>Score: {(result.topScore * 100).toFixed(0)}%</span>
                          </div>
                          {result.messages.slice(0, 2).map((msg, msgIdx) => (
                            <div key={msgIdx} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: msg.messageType === 'user' ? '#10b981' : '#8b5cf6', marginRight: '0.35rem' }}>{msg.messageType === 'user' ? '👤' : '🤖'}</span>
                              {msg.content.substring(0, 100)}{msg.content.length > 100 ? '...' : ''}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Conversation History List - Chat mode */}
              {mode === 'chat' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📜 All Conversations</span>
                    {conversations.length > 0 && confirmClearAllHistory && (
                      <button onClick={confirmClearAllHistory} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.2rem 0.4rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem' }}>
                        🗑️ Clear
                      </button>
                    )}
                  </div>
                  {conversations.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>No conversations yet</p>
                  ) : (
                    <div>
                      {conversations.map(conv => (
                        <div key={conv.id} onClick={() => { loadConversation?.(conv.id); onClose(); }} className={`chat-history-item-compact ${currentConversationId === conv.id ? 'active' : ''}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="chat-history-title" style={{ flex: 1 }}>{conv.title}</div>
                            {confirmDeleteConversation && (
                              <button onClick={(e) => confirmDeleteConversation(conv.id, e)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.7rem', padding: '0' }} title="Delete">✕</button>
                            )}
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{conv.message_count} messages</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Automation History List - Automation mode */}
              {mode === 'automation' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📁 All Automations</span>
                  </div>
                  {automationFolders.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>No automations yet</p>
                  ) : (
                    <div>
                      {automationFolders.map(folder => (
                        <div key={folder.name} style={{ marginBottom: '0.75rem' }}>
                          <div style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span>📂</span> {folder.name}
                          </div>
                          {folder.automations.map(auto => (
                            <div
                              key={auto.id}
                              onClick={() => { loadAutomation?.(auto); onClose(); }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                marginLeft: '1rem',
                                background: currentAutomationId === auto.id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                                borderRadius: '6px',
                                marginBottom: '0.25rem',
                                cursor: 'pointer',
                                border: currentAutomationId === auto.id ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#fff', fontSize: '0.8rem' }}>{auto.name}</span>
                                {deleteAutomation && (
                                  <button onClick={(e) => { e.stopPropagation(); deleteAutomation(auto.id); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.7rem', padding: '0' }} title="Delete">✕</button>
                                )}
                              </div>
                              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>{auto.schedule_type} • {auto.status}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
