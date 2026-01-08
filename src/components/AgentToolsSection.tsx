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
  };
}

interface AgentToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void;
}

export function AgentToolsSection({ onToolSelect, selectedTools = [], onDataChange }: AgentToolsSectionProps) {
  const [agents, setAgents] = useState<A2AAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewingAgentCard, setViewingAgentCard] = useState<A2AAgent | null>(null);

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

  // Toggle agent expansion
  const toggleAgent = (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  // Delete agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    setDeletingAgent(agentId);
    try {
      const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchAgents();
        onDataChange?.();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete agent');
      }
    } catch (err) {
      setError('Failed to delete agent');
    } finally {
      setDeletingAgent(null);
    }
  };

  // Start editing agent
  const startEditAgent = (agent: A2AAgent) => {
    setEditingAgent(agent.id);
    setEditDisplayName(agent.display_name);
    setEditDescription(agent.description || '');
  };

  // Save agent edit
  const handleSaveAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName,
          description: editDescription,
        }),
      });

      if (response.ok) {
        setEditingAgent(null);
        await fetchAgents();
        onDataChange?.();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update agent');
      }
    } catch (err) {
      setError('Failed to update agent');
    }
  };

  // Handle tool selection
  const handleToolSelect = (toolName: string) => {
    const isSelected = selectedTools.includes(toolName);
    onToolSelect?.(toolName, !isSelected);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading agents...</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '2rem',
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
    <div>
      {/* Error Display */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '0.75rem',
          marginBottom: '1rem',
          color: '#ef4444',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div>
          <h2 style={{
            color: '#f59e0b',
            fontSize: 'clamp(1rem, 3vw, 1.25rem)',
            fontWeight: 700,
            margin: '0 0 0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            🤖 A2A Agents
          </h2>
          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 'clamp(0.8rem, 2vw, 0.85rem)',
            margin: 0
          }}>
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
          }}
        >
          + Import Agent
        </Link>
      </div>

      {/* Agents List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {agents.map(agent => {
          const isExpanded = expandedAgents.has(agent.id);
          const isEditing = editingAgent === agent.id;
          const toolName = agent.tool?.name || `${agent.environment_name}-${agent.agent_name}`;
          const isSelected = selectedTools.includes(toolName);

          return (
            <div
              key={agent.id}
              style={{
                background: 'rgba(245, 158, 11, 0.05)',
                border: `1px solid ${isSelected ? 'rgba(245, 158, 11, 0.6)' : 'rgba(245, 158, 11, 0.2)'}`,
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              {/* Agent Header */}
              <div
                onClick={() => toggleAgent(agent.id)}
                style={{
                  padding: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                {/* Icon with favicon fallback */}
                <FaviconImage
                  iconUrl={agent.icon_url}
                  baseUrl={agent.agent_url}
                  alt={agent.display_name}
                  size={32}
                  borderRadius={6}
                  fallbackEmoji="🤖"
                  fallbackBgColor="rgba(245, 158, 11, 0.2)"
                />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>
                      {agent.display_name}
                    </span>
                    {agent.version && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                        v{agent.version}
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.description || agent.agent_url}
                  </p>
                </div>

                {/* Selection Checkbox */}
                {onToolSelect && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); handleToolSelect(toolName); }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                )}

                {/* Expand Arrow */}
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(245, 158, 11, 0.15)', padding: '1rem' }}>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewingAgentCard(agent); }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        color: '#f59e0b',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      📋 View Agent Card
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditAgent(agent); }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(102, 126, 234, 0.2)',
                        border: '1px solid rgba(102, 126, 234, 0.4)',
                        color: '#667eea',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAgent(agent.id); }}
                      disabled={deletingAgent === agent.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {deletingAgent === agent.id ? '...' : '🗑️ Delete'}
                    </button>
                  </div>

                  {/* Edit Form */}
                  {isEditing && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Display Name</label>
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Description</label>
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={2}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem', resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleSaveAgent(agent.id)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', background: '#10b981', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingAgent(null)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Agent Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Tool Name</span>
                      <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0', fontFamily: 'monospace' }}>{toolName}</p>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>URL</span>
                      <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0', wordBreak: 'break-all' }}>{agent.agent_url}</p>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Environment</span>
                      <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{agent.environment_name}</p>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Auth</span>
                      <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{agent.auth_type || 'none'}</p>
                    </div>
                  </div>

                  {/* Tags */}
                  {agent.tags && agent.tags.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Tags</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                        {agent.tags.map(tag => (
                          <span key={tag} style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Agent Card Modal */}
      {viewingAgentCard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a3e, #0f0f23)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.2)', padding: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: '#f59e0b', margin: 0 }}>Agent Card: {viewingAgentCard.display_name}</h2>
              <button onClick={() => setViewingAgentCard(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            </div>
            <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflow: 'auto', color: '#fff', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(viewingAgentCard.agent_card, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
