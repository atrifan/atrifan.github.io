'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
import { MermaidDiagram } from '../components/MermaidDiagram';
import { ADS_CONFIG } from '../config/ads.config';
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

interface Personality {
  id: string;
  name: string;
  icon: string;
  prompt_token_count: number;
}

interface MCPTool {
  server: string;
  name: string;
  description: string;
}

interface BudgetData {
  budget: { monthlyBudgetUsd: number };
  usage: { totalCost: number; budgetUsedPercent: number; remainingBudget: number; totalTokens: number };
}

// Schedule options
const SCHEDULE_OPTIONS = [
  { id: 'manual', label: 'Manual', icon: '▶️' },
  { id: 'daily', label: 'Daily', icon: '📅' },
  { id: 'weekly', label: 'Weekly', icon: '📆' },
  { id: 'monthly', label: 'Monthly', icon: '🗓️' },
  { id: 'cron', label: 'Cron', icon: '⚙️' },
];

export const AutomationPage: React.FC<AutomationPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  // Core state
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [currentAutomation, setCurrentAutomation] = useState<Automation | null>(null);
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);

  // Builder state
  const [prompt, setPrompt] = useState('');
  const [mermaidDiagram, setMermaidDiagram] = useState('flowchart TD\n  start([Start]) --> end_node([End])');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastExplanation, setLastExplanation] = useState('');

  // Model & personality - default will be set based on tier in useEffect
  const [selectedModel, setSelectedModel] = useState('');
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activePersonalityIds, setActivePersonalityIds] = useState<string[]>([]);

  // MCP tools
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);

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

  // Fetch data on mount
  useEffect(() => {
    applySEO('automation');
    if (canAccessPro) {
      fetchAutomations();
      fetchBudget();
      fetchPersonalities();
      fetchMcpTools();
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
      const response = await fetch('/api/ai/personalities');
      if (response.ok) {
        const data = await response.json();
        setPersonalities(data.personalities || []);
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
            allTools.push({ server: 'default', name: tool.name, description: tool.description });
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
                allTools.push({ server: server.serverName, name: tool.name, description: tool.description });
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch server tools:', err);
      }

      // 3. Fetch MCP server tools
      try {
        const mcpResponse = await fetch('/api/mcp-servers/list');
        if (mcpResponse.ok) {
          const mcpData = await mcpResponse.json();
          // For each MCP server, we'd need to fetch its tools
          // For now, just note that they exist
          for (const server of mcpData.servers || []) {
            if (server.source_type === 'mcp_import' && server.toolCount > 0) {
              allTools.push({ server: server.server_name, name: `[${server.toolCount} tools]`, description: `MCP server with ${server.toolCount} tools` });
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

  // Generate flow from prompt
  const generateFlow = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setLastTokenUsage(null);

    try {
      const response = await fetch('/api/ai/automations/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: currentAutomation?.id,
          prompt,
          currentMermaid: mermaidDiagram,
          modelId: selectedModel,
          availableTools: mcpTools,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.mermaid) setMermaidDiagram(data.mermaid);
        if (data.explanation) setLastExplanation(data.explanation);
        if (data.usage) setLastTokenUsage(data.usage);
        setPrompt('');
        fetchBudget();
      }
    } catch (error) {
      console.error('Failed to generate flow:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, mermaidDiagram, selectedModel, mcpTools, currentAutomation, isGenerating]);

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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setExportedCode(data.typescriptCode);
        if (data.usage) setLastTokenUsage(data.usage);
        setShowExportModal(false);
        setView('code');
        fetchBudget();
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
      fetchAutomations();
      if (currentAutomation?.id === id) {
        setCurrentAutomation(null);
        setView('list');
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Start new automation
  const startNew = () => {
    setCurrentAutomation(null);
    setMermaidDiagram('flowchart TD\n  start([Start]) --> end_node([End])');
    setPromptHistory([]);
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
      <SideAds leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop} leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle} leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom} rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop} rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle} rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom} />

      <View maxWidth="72rem" marginX="auto">
        <div style={{ marginBottom: '1.5rem' }}><BackToTools /></div>
        <AdBanner slot={ADS_CONFIG.slots.automationTop} format="horizontal" />

        {/* Header */}
        <View UNSAFE_style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>⚡ AUTOMATION BUILDER</h1>
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

        {/* BUILDER VIEW */}
        {view === 'builder' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Settings Panel - horizontal scrollable on mobile */}
            <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {/* Model Selection */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', minWidth: '200px', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: 0 }}>🤖 Model</h3>
                  {tier === 'pro' && (
                    <Link href="/pricing" style={{ textDecoration: 'none' }}>
                      <span style={{ color: '#f59e0b', fontSize: '0.65rem' }}>⬆️ More models</span>
                    </Link>
                  )}
                </div>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}>
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
                  ))}
                </select>
                {selectedModelData && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                    ${selectedModelData.inputCostPer1M}/M in • ${selectedModelData.outputCostPer1M}/M out
                  </div>
                )}
              </div>

              {/* Personalities */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', minWidth: '180px', flexShrink: 0 }}>
                <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>🎭 Personalities</h3>
                {personalities.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>No personalities. <Link href="/chat" style={{ color: '#f59e0b' }}>Create one</Link></p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {personalities.map(p => (
                      <button key={p.id} onClick={() => setActivePersonalityIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: activePersonalityIds.includes(p.id) ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', border: activePersonalityIds.includes(p.id) ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
                        <span>{p.icon} {p.name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>~{p.prompt_token_count}t</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', minWidth: '160px', flexShrink: 0 }}>
                <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>⏰ Schedule</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {SCHEDULE_OPTIONS.map(opt => (
                    <button key={opt.id} onClick={() => setSelectedSchedule(opt.id)} style={{ background: selectedSchedule === opt.id ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>{opt.icon} {opt.label}</button>
                  ))}
                </div>
              </div>

              {/* MCP Tools */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', minWidth: '200px', flexShrink: 0 }}>
                <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>🔧 Tools ({mcpTools.length})</h3>
                {mcpTools.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>No MCP tools. <Link href="/dashboard" style={{ color: '#f59e0b' }}>Add servers</Link></p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {mcpTools.slice(0, 10).map((tool, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                        <div style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 500 }}>{tool.name}</div>
                      </div>
                    ))}
                    {mcpTools.length > 10 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textAlign: 'center' }}>+{mcpTools.length - 10} more</div>}
                  </div>
                )}
              </div>
            </div>

            {/* Builder Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Prompt Input */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>✨ Describe your workflow</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && generateFlow()} placeholder="e.g., When I get a new email, extract the sender and save to a spreadsheet..." disabled={isGenerating} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }} />
                  <button onClick={generateFlow} disabled={isGenerating || !prompt.trim()} style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '8px', padding: '0.75rem 1.25rem', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: isGenerating || !prompt.trim() ? 0.5 : 1 }}>{isGenerating ? '...' : '⚡ Generate'}</button>
                </div>
                {lastTokenUsage && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                    Last: ↑{lastTokenUsage.input} ↓{lastTokenUsage.output} tokens
                  </div>
                )}
                {lastExplanation && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>{lastExplanation}</div>
                )}
              </div>

              {/* Mermaid Diagram */}
              <div style={{ flex: 1 }}>
                <MermaidDiagram definition={mermaidDiagram} title={currentAutomation?.name || 'Workflow'} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowSaveModal(true)} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>💾 Save</button>
                {currentAutomation && (
                  <button onClick={() => setShowExportModal(true)} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>📤 Export to TypeScript</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && currentAutomation && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 1rem' }}>📜 Prompt History for "{currentAutomation.name}"</h2>
            {promptHistory.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '2rem' }}>No prompts yet. Start building in the Builder tab!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {promptHistory.map((ph, i) => (
                  <div key={ph.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>#{promptHistory.length - i}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{new Date(ph.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>{ph.prompt}</p>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>↑{ph.input_tokens} ↓{ph.output_tokens} tokens</div>
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

        <AdBanner slot={ADS_CONFIG.slots.automationBottom} format="horizontal" style={{ marginTop: '1.5rem' }} />
        <Footer />
      </View>
    </View>
  );
};
