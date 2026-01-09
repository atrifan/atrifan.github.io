'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';

interface GraphQLTool {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

interface GraphQLOperation {
  id: string;
  tool_id: string;
  operation_name: string;
  operation_type: string;
  description: string | null;
  tool?: GraphQLTool;
}

interface GraphQLEnvironment {
  id: string;
  name: string;
  host: string;
  tools?: GraphQLTool[];
}

interface GraphQLSpec {
  id: string;
  server_name: string;
  api_title: string | null;
  api_description: string | null;
  source_url: string;
  created_at: string;
  updated_at: string;
  operation_count?: number;
  operations?: GraphQLOperation[];
  environments?: GraphQLEnvironment[];
}

interface GraphQLToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void;
  onHasTools?: (hasTools: boolean) => void;
}

export function GraphQLToolsSection({ onToolSelect, selectedTools = [], onDataChange, onHasTools }: GraphQLToolsSectionProps) {
  const [specs, setSpecs] = useState<GraphQLSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set());

  // Edit states
  const [editingSpec, setEditingSpec] = useState<string | null>(null);
  const [editSpecServerName, setEditSpecServerName] = useState('');
  const [editingEnv, setEditingEnv] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editEnvHost, setEditEnvHost] = useState('');
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editToolName, setEditToolName] = useState('');
  const [editToolWidget, setEditToolWidget] = useState(false);

  // Action states
  const [deletingSpec, setDeletingSpec] = useState<string | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<string | null>(null);
  const [deletingTool, setDeletingTool] = useState<string | null>(null);
  const [refreshingSpec, setRefreshingSpec] = useState<string | null>(null);

  // Confirmation modals
  const [confirmDeleteSpec, setConfirmDeleteSpec] = useState<{ specId: string; specName: string } | null>(null);
  const [confirmDeleteEnv, setConfirmDeleteEnv] = useState<{ envId: string; specId: string; envName: string } | null>(null);
  const [confirmDeleteTool, setConfirmDeleteTool] = useState<{ toolId: string; specId: string; toolName: string } | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState<GraphQLSpec | null>(null);

  // Tool docs modal
  const [viewingToolDocs, setViewingToolDocs] = useState<{ tool: GraphQLTool; operation: GraphQLOperation } | null>(null);

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

  useEffect(() => {
    fetchSpecs();
  }, []);

  useEffect(() => {
    if (onHasTools) {
      onHasTools(specs.length > 0);
    }
  }, [specs.length, onHasTools]);

  const fetchSpecs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/graphql/list');
      if (!response.ok) throw new Error('Failed to fetch GraphQL specs');
      const data = await response.json();
      setSpecs(data.specs || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshSpecs = async () => {
    try {
      const response = await fetch('/api/graphql/list');
      if (response.ok) {
        const data = await response.json();
        setSpecs(data.specs || []);
      }
    } catch (err) {
      console.error('Error refreshing specs:', err);
    }
  };

  const toggleSpecExpanded = (specId: string) => {
    setExpandedSpecs(prev => {
      const next = new Set(prev);
      if (next.has(specId)) {
        next.delete(specId);
      } else {
        next.add(specId);
      }
      return next;
    });
  };

  const handleToolToggle = (toolName: string) => {
    if (onToolSelect) {
      onToolSelect(toolName, !selectedTools.includes(toolName));
    }
  };

  // Spec actions
  const startEditSpec = (spec: GraphQLSpec) => {
    setEditingSpec(spec.id);
    setEditSpecServerName(spec.server_name);
  };

  const cancelEditSpec = () => {
    setEditingSpec(null);
    setEditSpecServerName('');
  };

  const saveEditSpec = async (specId: string) => {
    try {
      const response = await fetch(`/api/graphql/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_name: editSpecServerName }),
      });
      if (response.ok) {
        setSpecs(prev => prev.map(s => s.id === specId ? { ...s, server_name: editSpecServerName } : s));
        cancelEditSpec();
        showNotification('success', 'Server name updated');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating spec:', err);
      showNotification('error', 'Failed to update server name');
    }
  };

  const handleDeleteSpec = async (specId: string) => {
    setDeletingSpec(specId);
    try {
      const response = await fetch(`/api/graphql/${specId}`, { method: 'DELETE' });
      if (response.ok) {
        setSpecs(prev => prev.filter(s => s.id !== specId));
        showNotification('success', 'API deleted successfully');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Error deleting spec:', err);
      showNotification('error', 'Failed to delete API');
    } finally {
      setDeletingSpec(null);
      setConfirmDeleteSpec(null);
    }
  };

  const handleRefreshSpec = async (spec: GraphQLSpec) => {
    setRefreshingSpec(spec.id);
    try {
      const response = await fetch(`/api/graphql/${spec.id}/refresh`, { method: 'POST' });
      if (response.ok) {
        await refreshSpecs();
        showNotification('success', 'Schema refreshed successfully');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to refresh');
      }
    } catch (err) {
      console.error('Error refreshing spec:', err);
      showNotification('error', 'Failed to refresh schema');
    } finally {
      setRefreshingSpec(null);
      setConfirmRefresh(null);
    }
  };

  // Environment actions
  const startEditEnv = (env: GraphQLEnvironment) => {
    setEditingEnv(env.id);
    setEditEnvName(env.name);
    setEditEnvHost(env.host);
  };

  const cancelEditEnv = () => {
    setEditingEnv(null);
    setEditEnvName('');
    setEditEnvHost('');
  };

  const saveEditEnv = async (envId: string) => {
    try {
      const response = await fetch(`/api/graphql/environments/${envId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editEnvName, host: editEnvHost }),
      });
      if (response.ok) {
        await refreshSpecs();
        cancelEditEnv();
        showNotification('success', 'Environment updated');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating environment:', err);
      showNotification('error', 'Failed to update environment');
    }
  };

  const handleDeleteEnv = async (envId: string) => {
    setDeletingEnv(envId);
    try {
      const response = await fetch(`/api/graphql/environments/${envId}`, { method: 'DELETE' });
      if (response.ok) {
        await refreshSpecs();
        showNotification('success', 'Environment deleted');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Error deleting environment:', err);
      showNotification('error', 'Failed to delete environment');
    } finally {
      setDeletingEnv(null);
      setConfirmDeleteEnv(null);
    }
  };

  // Tool actions
  const startEditTool = (tool: GraphQLTool) => {
    setEditingTool(tool.id);
    setEditToolName(tool.name);
    setEditToolWidget(tool.has_widget);
  };

  const cancelEditTool = () => {
    setEditingTool(null);
    setEditToolName('');
    setEditToolWidget(false);
  };

  const saveEditTool = async (toolId: string) => {
    try {
      const response = await fetch(`/api/graphql/tools/${toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editToolName, hasWidget: editToolWidget }),
      });
      if (response.ok) {
        await refreshSpecs();
        cancelEditTool();
        showNotification('success', 'Tool updated');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating tool:', err);
      showNotification('error', 'Failed to update tool');
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    setDeletingTool(toolId);
    try {
      const response = await fetch(`/api/graphql/tools/${toolId}`, { method: 'DELETE' });
      if (response.ok) {
        await refreshSpecs();
        showNotification('success', 'Tool deleted');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Error deleting tool:', err);
      showNotification('error', 'Failed to delete tool');
    } finally {
      setDeletingTool(null);
      setConfirmDeleteTool(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        Loading GraphQL APIs...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))',
        border: '1px solid rgba(102, 126, 234, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>◈</div>
        <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>No GraphQL APIs Imported</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 1rem' }}>
          Import a GraphQL schema to create tools from queries and mutations.
        </p>
        <Link
          href="/dashboard/graphql-import"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Import GraphQL Schema
        </Link>
      </div>
    );
  }

  const operations = (spec: GraphQLSpec) => spec.operations || [];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))',
      border: '1px solid rgba(102, 126, 234, 0.25)',
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
              ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.95), rgba(118, 75, 162, 0.95))'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
            border: `1px solid ${notification.type === 'success' ? 'rgba(102, 126, 234, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 500,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
          onClick={() => setNotification(null)}
        >
          {notification.type === 'success' ? '✓' : '✕'} {notification.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ color: '#667eea', margin: 0, fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ◈ GraphQL Tools
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0.25rem 0 0', fontSize: 'clamp(0.8rem, 2vw, 0.85rem)' }}>
            Imported from GraphQL schemas
          </p>
        </div>
        <Link
          href="/dashboard/graphql-import"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            background: 'rgba(102, 126, 234, 0.2)',
            border: '1px solid rgba(102, 126, 234, 0.4)',
            color: '#667eea',
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

      {/* Specs List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {specs.map(spec => {
          const isExpanded = expandedSpecs.has(spec.id);
          const ops = operations(spec);
          const environments = spec.environments || [];

          return (
            <div
              key={spec.id}
              style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(102, 126, 234, 0.2)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              {/* Spec Header */}
              <button
                onClick={() => toggleSpecExpanded(spec.id)}
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
                  baseUrl={spec.source_url}
                  alt={spec.api_title || spec.server_name}
                  size={32}
                  borderRadius={6}
                  fallbackEmoji="◈"
                  fallbackBgColor="rgba(102, 126, 234, 0.2)"
                />
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', marginBottom: '0.25rem' }}>
                    {spec.api_title || spec.server_name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontWeight: 600 }}>
                      {spec.server_name}
                    </span>
                    <span>•</span>
                    <span>{ops.length} operation{ops.length !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{environments.length} env{environments.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.25rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▼
                </span>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(102, 126, 234, 0.15)', padding: '1rem' }}>
                  {/* Quick Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <Link
                      href={`/dashboard/graphql/${spec.id}`}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(102, 126, 234, 0.2)',
                        border: '1px solid rgba(102, 126, 234, 0.4)',
                        color: '#667eea',
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
                      onClick={(e) => { e.stopPropagation(); setConfirmRefresh(spec); }}
                      disabled={refreshingSpec === spec.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#10b981',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: refreshingSpec === spec.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      🔄 {refreshingSpec === spec.id ? 'Refreshing...' : 'Refresh Schema'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteSpec({ specId: spec.id, specName: spec.api_title || spec.server_name }); }}
                      disabled={deletingSpec === spec.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: deletingSpec === spec.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      🗑️ {deletingSpec === spec.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>

                  {/* Server Name Edit */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Server Name
                    </div>
                    {editingSpec === spec.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editSpecServerName}
                          onChange={(e) => setEditSpecServerName(e.target.value)}
                          style={{ flex: 1, minWidth: '150px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                        <button onClick={() => saveEditSpec(spec.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelEditSpec} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ color: '#667eea', fontWeight: 600, fontSize: '0.9rem' }}>{spec.server_name}</span>
                        <button onClick={() => startEditSpec(spec)} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit server name">✏️</button>
                      </div>
                    )}
                  </div>

                  {/* Environments */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Environments
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {environments.map(env => (
                        <div key={env.id} style={{ padding: '0.5rem 0.6rem', borderRadius: '6px', background: 'rgba(102, 126, 234, 0.15)', border: '1px solid rgba(102, 126, 234, 0.3)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {editingEnv === env.id ? (
                            <>
                              <input type="text" value={editEnvName} onChange={(e) => setEditEnvName(e.target.value)} placeholder="Name" style={{ width: '80px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }} />
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
                              <input type="text" value={editEnvHost} onChange={(e) => setEditEnvHost(e.target.value)} placeholder="Host URL" style={{ flex: 1, minWidth: '150px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }} />
                              <button onClick={() => saveEditEnv(env.id)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }}>Save</button>
                              <button onClick={cancelEditEnv} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', cursor: 'pointer' }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <span style={{ color: '#667eea', fontWeight: 600 }}>{env.name}</span>
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
                              <span style={{ color: 'rgba(255,255,255,0.6)', flex: 1 }}>{env.host}</span>
                              <button onClick={() => startEditEnv(env)} style={{ padding: '0.2rem 0.35rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.65rem', cursor: 'pointer' }} title="Edit">✏️</button>
                              <button onClick={() => setConfirmDeleteEnv({ envId: env.id, specId: spec.id, envName: env.name })} disabled={deletingEnv === env.id} style={{ padding: '0.2rem 0.35rem', borderRadius: '4px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.65rem', cursor: deletingEnv === env.id ? 'wait' : 'pointer', opacity: deletingEnv === env.id ? 0.5 : 1 }} title="Delete">🗑️</button>
                            </>
                          )}
                        </div>
                      ))}
                      <AddEnvironmentInline specId={spec.id} onAdd={() => { refreshSpecs(); onDataChange?.(); }} />
                    </div>
                  </div>

                  {/* Operations/Tools */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Operations
                    </div>
                    {onToolSelect && ops.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ops.forEach(op => {
                              if (op.tool && !selectedTools.includes(op.tool.name)) {
                                onToolSelect(op.tool.name, true);
                              }
                            });
                          }}
                          style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'transparent', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          Select All
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ops.forEach(op => {
                              if (op.tool && selectedTools.includes(op.tool.name)) {
                                onToolSelect(op.tool.name, false);
                              }
                            });
                          }}
                          style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'transparent', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          Deselect All
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ops.map(op => {
                      const tool = op.tool;
                      const isSelected = tool ? selectedTools.includes(tool.name) : false;
                      const opTypeColor = op.operation_type === 'query' ? '#667eea' : '#f59e0b';

                      return (
                        <div
                          key={op.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'clamp(0.4rem, 2vw, 0.75rem)',
                            padding: 'clamp(0.5rem, 2vw, 0.6rem) clamp(0.5rem, 2vw, 0.75rem)',
                            background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '8px',
                            cursor: onToolSelect && tool ? 'pointer' : 'default',
                            flexWrap: 'wrap',
                          }}
                          onClick={() => { if (onToolSelect && tool) onToolSelect(tool.name, !isSelected); }}
                        >
                          {/* Checkbox */}
                          {onToolSelect && (
                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,0.3)'}`, background: isSelected ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                            </div>
                          )}

                          {/* Type Badge */}
                          <span style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', background: `${opTypeColor}22`, color: opTypeColor, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                            {op.operation_type}
                          </span>

                          {/* Tool Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {editingTool === tool?.id ? (
                              <input type="text" value={editToolName} onChange={(e) => setEditToolName(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: '100%', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
                            ) : (
                              <>
                                <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {tool?.name || op.operation_name}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {op.operation_name}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Widget Badge / Toggle */}
                          {editingTool === tool?.id ? (
                            <button onClick={(e) => { e.stopPropagation(); setEditToolWidget(!editToolWidget); }} style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', border: `1px solid ${editToolWidget ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255,255,255,0.2)'}`, background: editToolWidget ? 'rgba(167, 139, 250, 0.2)' : 'transparent', color: editToolWidget ? '#a78bfa' : 'rgba(255,255,255,0.5)', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                              Widget {editToolWidget ? '✓' : '○'}
                            </button>
                          ) : tool?.has_widget ? (
                            <span style={{ padding: '0.15rem 0.35rem', borderRadius: '4px', background: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }}>Widget</span>
                          ) : null}

                          {/* Action buttons */}
                          {tool && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                              {editingTool === tool.id ? (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); saveEditTool(tool.id); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }}>Save</button>
                                  <button onClick={(e) => { e.stopPropagation(); cancelEditTool(); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', cursor: 'pointer' }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); setViewingToolDocs({ tool, operation: op }); }} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }} title="View tool definition">📖</button>
                                  <button onClick={(e) => { e.stopPropagation(); startEditTool(tool); }} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit tool">✏️</button>
                                  <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteTool({ toolId: tool.id, specId: spec.id, toolName: tool.name }); }} disabled={deletingTool === tool.id} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.7rem', cursor: deletingTool === tool.id ? 'wait' : 'pointer', opacity: deletingTool === tool.id ? 0.5 : 1 }} title="Delete tool">🗑️</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation Modals */}
      {confirmDeleteSpec && (
        <ConfirmModal
          title="Delete GraphQL API"
          message={`Are you sure you want to delete "${confirmDeleteSpec.specName}"? This will remove all associated tools and environments.`}
          onConfirm={() => handleDeleteSpec(confirmDeleteSpec.specId)}
          onCancel={() => setConfirmDeleteSpec(null)}
          confirmText="Delete"
          confirmColor="#ef4444"
        />
      )}

      {confirmDeleteEnv && (
        <ConfirmModal
          title="Delete Environment"
          message={`Are you sure you want to delete the "${confirmDeleteEnv.envName}" environment? This will remove all associated tools.`}
          onConfirm={() => handleDeleteEnv(confirmDeleteEnv.envId)}
          onCancel={() => setConfirmDeleteEnv(null)}
          confirmText="Delete"
          confirmColor="#ef4444"
        />
      )}

      {confirmDeleteTool && (
        <ConfirmModal
          title="Delete Tool"
          message={`Are you sure you want to delete the tool "${confirmDeleteTool.toolName}"?`}
          onConfirm={() => handleDeleteTool(confirmDeleteTool.toolId)}
          onCancel={() => setConfirmDeleteTool(null)}
          confirmText="Delete"
          confirmColor="#ef4444"
        />
      )}

      {confirmRefresh && (
        <ConfirmModal
          title="Refresh Schema"
          message={`Refresh the GraphQL schema from ${confirmRefresh.source_url}? This will update all operations and tools.`}
          onConfirm={() => handleRefreshSpec(confirmRefresh)}
          onCancel={() => setConfirmRefresh(null)}
          confirmText="Refresh"
          confirmColor="#10b981"
        />
      )}

      {/* Tool Docs Modal */}
      {viewingToolDocs && (
        <ToolDocsModal
          tool={viewingToolDocs.tool}
          operation={viewingToolDocs.operation}
          onClose={() => setViewingToolDocs(null)}
        />
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
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
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
function ToolDocsModal({ tool, operation, onClose }: { tool: GraphQLTool; operation: GraphQLOperation; onClose: () => void }) {
  const hasInputSchema = tool.input_schema && Object.keys(tool.input_schema).length > 0;
  const hasOutputSchema = tool.output_schema && Object.keys(tool.output_schema).length > 0;
  const hasDescription = tool.description || operation.description;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ color: '#fff', margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{tool.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: operation.operation_type === 'query' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: operation.operation_type === 'query' ? '#667eea' : '#f59e0b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {operation.operation_type}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{operation.operation_name}</span>
              {tool.has_widget && (
                <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 600 }}>Widget</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Description */}
        {hasDescription && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📝 Description
            </div>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5, background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px' }}>
              {tool.description || operation.description}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Input Schema */}
          <div>
            <div style={{ color: '#667eea', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📥 Input Schema
            </div>
            {hasInputSchema ? (
              <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '6px', padding: '0.75rem', margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(tool.input_schema, null, 2)}
              </pre>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px' }}>
                No input parameters
              </div>
            )}
          </div>

          {/* Output Schema */}
          <div>
            <div style={{ color: '#a78bfa', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📤 Output Schema
            </div>
            {hasOutputSchema ? (
              <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: '6px', padding: '0.75rem', margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(tool.output_schema, null, 2)}
              </pre>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px' }}>
                No output schema defined
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Add Environment Inline Component
function AddEnvironmentInline({ specId, onAdd }: { specId: string; onAdd: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !host.trim()) {
      setError('Name and host are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/graphql/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, name: name.trim(), host: host.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create environment');
      }

      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setName('');
        setHost('');
        setSuccess(false);
        onAdd();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create environment');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={{ padding: '0.5rem 0.6rem', borderRadius: '6px', border: '1px dashed rgba(102, 126, 234, 0.4)', background: 'transparent', color: '#667eea', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        + Add Environment
      </button>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0.6rem', borderRadius: '6px', background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.3)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g., Staging)" style={{ width: '100px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }} />
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
      <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host URL" style={{ flex: 1, minWidth: '150px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }} />
      {error && <span style={{ color: '#ef4444', fontSize: '0.7rem', width: '100%' }}>{error}</span>}
      {success && <span style={{ color: '#10b981', fontSize: '0.7rem', width: '100%' }}>✓ Environment created!</span>}
      <button onClick={handleSubmit} disabled={saving || success} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: success ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.7rem', cursor: saving || success ? 'wait' : 'pointer' }}>
        {success ? '✓' : saving ? '...' : 'Create'}
      </button>
      <button onClick={() => { setIsOpen(false); setName(''); setHost(''); setError(null); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', cursor: 'pointer' }}>
        Cancel
      </button>
    </div>
  );
}

