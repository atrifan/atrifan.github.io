'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';

// Types
interface A2AAgent {
  id: string;
  agent_name: string;
  display_name: string;
  agent_url: string;
  import_url: string | null;
  environment_name: string;
  agent_card: Record<string, unknown>;
  version: string | null;
  protocol_version: string | null;
  description: string | null;
  icon_url: string | null;
  tags: string[];
  category: string;
  auth_type: string;
  has_widget: boolean;
  created_at: string;
  updated_at: string;
  tool?: {
    id: string;
    name: string;
    description: string;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
  };
}

interface AgentToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void;
  onHasTools?: (hasTools: boolean) => void;
}

export function AgentToolsSection({ onToolSelect, selectedTools = [], onDataChange, onHasTools }: AgentToolsSectionProps) {
  const [agents, setAgents] = useState<A2AAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null);
  const [editDisplayNameValue, setEditDisplayNameValue] = useState('');
  const [editingEnv, setEditingEnv] = useState<string | null>(null);
  const [editEnvValue, setEditEnvValue] = useState('');

  // Action states
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);
  const [refreshingAgent, setRefreshingAgent] = useState<string | null>(null);

  // Modals
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<{ agentId: string; agentName: string } | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState<A2AAgent | null>(null);
  const [viewingToolDocs, setViewingToolDocs] = useState<A2AAgent | null>(null);

  // Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  // Fetch agents
  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents/list');
      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Error fetching agents:', err);
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (onHasTools) {
      onHasTools(agents.length > 0);
    }
  }, [agents.length, onHasTools]);

  // Toggle agent expansion
  const toggleAgent = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  // Delete agent
  const handleDeleteAgent = async (agentId: string) => {
    setDeletingAgent(agentId);
    setConfirmDeleteAgent(null);
    try {
      const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (response.ok) {
        showNotification('success', 'Agent deleted successfully');
        await fetchAgents();
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete agent');
      }
    } catch {
      showNotification('error', 'Failed to delete agent');
    } finally {
      setDeletingAgent(null);
    }
  };

  // Refresh agent from URL
  const handleRefreshAgent = async (agent: A2AAgent) => {
    setRefreshingAgent(agent.id);
    setConfirmRefresh(null);
    try {
      const response = await fetch(`/api/agents/${agent.id}/reimport`, { method: 'POST' });
      if (response.ok) {
        showNotification('success', 'Agent refreshed successfully');
        await fetchAgents();
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to refresh agent');
      }
    } catch {
      showNotification('error', 'Failed to refresh agent');
    } finally {
      setRefreshingAgent(null);
    }
  };

  // Edit display name
  const startEditDisplayName = (agent: A2AAgent) => {
    setEditingDisplayName(agent.id);
    setEditDisplayNameValue(agent.display_name);
  };

  const saveEditDisplayName = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: editDisplayNameValue }),
      });
      if (response.ok) {
        showNotification('success', 'Display name updated');
        setEditingDisplayName(null);
        await fetchAgents();
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch {
      showNotification('error', 'Failed to update');
    }
  };

  // Edit environment
  const startEditEnv = (agent: A2AAgent) => {
    setEditingEnv(agent.id);
    setEditEnvValue(agent.environment_name);
  };

  const saveEditEnv = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentName: editEnvValue }),
      });
      if (response.ok) {
        showNotification('success', 'Environment updated');
        setEditingEnv(null);
        await fetchAgents();
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch {
      showNotification('error', 'Failed to update');
    }
  };

  // Get tool name for an agent
  const getToolName = (agent: A2AAgent) => {
    if (agent.tool?.name) return agent.tool.name;
    const envNorm = (agent.environment_name || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const agentNorm = agent.agent_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `a2a_${envNorm}-${agentNorm}`;
  };

  // Handle tool selection toggle
  const handleToolToggle = (toolName: string) => {
    const isSelected = selectedTools.includes(toolName);
    onToolSelect?.(toolName, !isSelected);
  };

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.08))',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading agents...</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.08))',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🤖</div>
        <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '0.5rem' }}>No A2A Agents Imported</h3>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Import an A2A agent to communicate with other AI agents.
        </p>
        <Link
          href="/dashboard/agent-import"
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.85rem',
          }}
        >
          Import A2A Agent →
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(217, 119, 6, 0.08))',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      borderRadius: '16px',
      padding: 'clamp(1rem, 3vw, 1.5rem)',
      position: 'relative',
    }}>
      {/* Notification Toast */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: notification.type === 'success'
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
            border: `1px solid ${notification.type === 'success' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 500,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: 'pointer',
          }}
          onClick={() => setNotification(null)}
        >
          {notification.type === 'success' ? '✓' : '✕'} {notification.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ color: '#f59e0b', margin: 0, fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🤖 A2A Agents
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0.25rem 0 0', fontSize: 'clamp(0.8rem, 2vw, 0.85rem)' }}>
            Agent-to-Agent protocol agents
          </p>
        </div>
        <Link
          href="/dashboard/agent-import"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.2)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            color: '#f59e0b',
            fontWeight: 600,
            fontSize: '0.85rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>+</span> Import More
        </Link>
      </div>

      {/* Agents List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {agents.map(agent => {
          const isExpanded = expandedAgents.has(agent.id);
          const toolName = getToolName(agent);
          const isSelected = selectedTools.includes(toolName);

          return (
            <div
              key={agent.id}
              style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              {/* Agent Header */}
              <button
                onClick={() => toggleAgent(agent.id)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <FaviconImage
                  iconUrl={agent.icon_url}
                  baseUrl={agent.agent_url}
                  alt={agent.display_name}
                  size={32}
                  borderRadius={6}
                  fallbackEmoji="🤖"
                  fallbackBgColor="rgba(245, 158, 11, 0.2)"
                />
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', marginBottom: '0.25rem' }}>
                    {agent.display_name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontWeight: 600 }}>
                      {agent.environment_name || 'default'}
                    </span>
                    <span>•</span>
                    <span>1 tool</span>
                    <span>•</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {agent.agent_url}
                    </span>
                  </div>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.25rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▼
                </span>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(245, 158, 11, 0.15)', padding: '1rem' }}>
                  {/* Quick Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <Link
                      href={`/dashboard/a2a-agent/${agent.id}`}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        color: '#f59e0b',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      ✏️ Edit Full
                    </Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRefresh(agent); }}
                      disabled={refreshingAgent === agent.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#10b981',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: refreshingAgent === agent.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      🔄 {refreshingAgent === agent.id ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteAgent({ agentId: agent.id, agentName: agent.display_name }); }}
                      disabled={deletingAgent === agent.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: deletingAgent === agent.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      🗑️ {deletingAgent === agent.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>

                  {/* Display Name Edit */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Display Name
                    </div>
                    {editingDisplayName === agent.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editDisplayNameValue}
                          onChange={(e) => setEditDisplayNameValue(e.target.value)}
                          style={{ flex: 1, minWidth: '150px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                        <button onClick={() => saveEditDisplayName(agent.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingDisplayName(null)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem' }}>{agent.display_name}</span>
                        <button onClick={() => startEditDisplayName(agent)} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit display name">✏️</button>
                      </div>
                    )}
                  </div>

                  {/* Environment Edit */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Environment
                    </div>
                    {editingEnv === agent.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editEnvValue}
                          onChange={(e) => setEditEnvValue(e.target.value)}
                          style={{ flex: 1, minWidth: '150px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                        <button onClick={() => saveEditEnv(agent.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingEnv(null)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>{agent.environment_name}</span>
                        <button onClick={() => startEditEnv(agent)} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit environment">✏️</button>
                      </div>
                    )}
                  </div>

                  {/* URLs */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      URLs
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#10b981', fontSize: '0.8rem', minWidth: '60px' }}>🔗 A2A:</span>
                        <code style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{agent.agent_url}</code>
                      </div>
                      {agent.import_url && agent.import_url !== agent.agent_url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#f59e0b', fontSize: '0.8rem', minWidth: '60px' }}>📥 Import:</span>
                          <code style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{agent.import_url}</code>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tool */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Tool
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'clamp(0.4rem, 2vw, 0.75rem)',
                        padding: 'clamp(0.5rem, 2vw, 0.6rem) clamp(0.5rem, 2vw, 0.75rem)',
                        background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: '8px',
                        cursor: onToolSelect ? 'pointer' : 'default',
                        flexWrap: 'wrap',
                      }}
                      onClick={() => { if (onToolSelect) handleToolToggle(toolName); }}
                    >
                      {/* Checkbox */}
                      {onToolSelect && (
                        <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,0.3)'}`, background: isSelected ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                      )}

                      {/* Tool Icon */}
                      <FaviconImage
                        iconUrl={agent.icon_url}
                        baseUrl={agent.agent_url}
                        alt={agent.display_name}
                        size={24}
                        borderRadius={4}
                        fallbackEmoji="🤖"
                        fallbackBgColor="rgba(245, 158, 11, 0.2)"
                      />

                      {/* Tool Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {toolName}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {agent.description || 'A2A Agent tool'}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); setViewingToolDocs(agent); }} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }} title="View tool docs">📖</button>
                        <Link href={`/dashboard/a2a-agent/${agent.id}`} onClick={(e) => e.stopPropagation()} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'none' }} title="Edit tool">✏️</Link>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteAgent({ agentId: agent.id, agentName: agent.display_name }); }} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer' }} title="Delete agent">🗑️</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation Modals */}
      {confirmDeleteAgent && (
        <ConfirmModal
          title="Delete A2A Agent"
          message={`Are you sure you want to delete "${confirmDeleteAgent.agentName}"? This will remove the agent and its associated tool.`}
          onConfirm={() => handleDeleteAgent(confirmDeleteAgent.agentId)}
          onCancel={() => setConfirmDeleteAgent(null)}
          confirmText="Delete"
          confirmColor="#ef4444"
        />
      )}

      {confirmRefresh && (
        <ConfirmModal
          title="Refresh Agent"
          message={`Refresh agent from ${confirmRefresh.import_url || confirmRefresh.agent_url}? This will update the agent with the latest data from the source.`}
          onConfirm={() => handleRefreshAgent(confirmRefresh)}
          onCancel={() => setConfirmRefresh(null)}
          confirmText="Refresh"
          confirmColor="#10b981"
        />
      )}

      {/* Tool Docs Modal */}
      {viewingToolDocs && (
        <ToolDocsModal agent={viewingToolDocs} onClose={() => setViewingToolDocs(null)} />
      )}
    </div>
  );
}

// Confirmation Modal Component
function ConfirmModal({ title, message, onConfirm, onCancel, confirmText, confirmColor }: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText: string;
  confirmColor: string;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onCancel}>
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>{title}</h3>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: confirmColor, color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

// Tool Docs Modal Component
function ToolDocsModal({ agent, onClose }: { agent: A2AAgent; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '16px', padding: '1.5rem', maxWidth: '700px', width: '100%', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ color: '#f59e0b', margin: 0, fontSize: '1.25rem' }}>📖 {agent.display_name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Description */}
        {agent.description && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</h3>
            <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>{agent.description}</p>
          </div>
        )}

        {/* Tool Name */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tool Name</h3>
          <code style={{ color: '#f59e0b', fontSize: '0.9rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
            {agent.tool?.name || `a2a_${agent.environment_name}-${agent.agent_name}`}
          </code>
        </div>

        {/* Input Schema */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Input Schema</h3>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#fff', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {JSON.stringify(agent.tool?.input_schema || { type: 'object', properties: { message: { type: 'string', description: 'Message to send to the agent' } } }, null, 2)}
          </pre>
        </div>

        {/* Output Schema */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Output Schema</h3>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#fff', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {JSON.stringify(agent.tool?.output_schema || { type: 'object', properties: { response: { type: 'string' } } }, null, 2)}
          </pre>
        </div>

        {/* Agent Card */}
        <div>
          <h3 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent Card</h3>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#fff', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {JSON.stringify(agent.agent_card, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
