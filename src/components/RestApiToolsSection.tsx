'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Types
interface RestApiTool {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
}

interface RestApiEndpoint {
  id: string;
  tool_id: string;
  operation_id: string;
  http_method: string;
  path: string;
  tool?: RestApiTool;
}

interface RestApiEnvironment {
  id: string;
  name: string;
  host: string;
  tools?: RestApiTool[];
}

interface RestApiSpec {
  id: string;
  server_name: string;
  api_title: string;
  api_description: string;
  api_version: string;
  openapi_version: string;
  created_at: string;
  updated_at: string;
  endpoint_count?: number;
  endpoints?: RestApiEndpoint[];
  environments?: RestApiEnvironment[];
  source_url?: string;
  import_method?: 'paste' | 'url';
}

// Method color mapping
const methodColors: Record<string, string> = {
  GET: '#10b981',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  PATCH: '#8b5cf6',
  DELETE: '#ef4444',
};

interface RestApiToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void; // Called when environments/tools are added/edited/deleted
}

export function RestApiToolsSection({ onToolSelect, selectedTools = [], onDataChange }: RestApiToolsSectionProps) {
  const [specs, setSpecs] = useState<RestApiSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set());
  const [deletingSpec, setDeletingSpec] = useState<string | null>(null);
  const [deletingTool, setDeletingTool] = useState<string | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editToolName, setEditToolName] = useState('');
  const [editToolWidget, setEditToolWidget] = useState(false);
  const [editingSpec, setEditingSpec] = useState<string | null>(null);
  const [editSpecServerName, setEditSpecServerName] = useState('');
  const [editingEnv, setEditingEnv] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editEnvHost, setEditEnvHost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reimportingSpec, setReimportingSpec] = useState<string | null>(null);
  const [viewingToolDocs, setViewingToolDocs] = useState<{ tool: RestApiTool; endpoint: RestApiEndpoint } | null>(null);
  const [confirmDeleteEnv, setConfirmDeleteEnv] = useState<{ envId: string; specId: string; envName: string } | null>(null);
  const [confirmDeleteSpec, setConfirmDeleteSpec] = useState<{ specId: string; specName: string } | null>(null);
  const [confirmDeleteTool, setConfirmDeleteTool] = useState<{ toolId: string; specId: string; toolName: string } | null>(null);
  const [confirmReimport, setConfirmReimport] = useState<RestApiSpec | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss notifications after 4 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  const refreshSpecs = async () => {
    try {
      const response = await fetch('/api/swagger/list');
      if (response.ok) {
        const data = await response.json();
        setSpecs(data.specs || []);
      } else {
        setError('Failed to load REST API specs');
      }
    } catch (err) {
      console.error('Error fetching REST API specs:', err);
      setError('Failed to load REST API specs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSpecs();
  }, []);

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

  const handleDeleteSpec = async (specId: string) => {
    setDeletingSpec(specId);
    try {
      const response = await fetch(`/api/swagger/${specId}`, { method: 'DELETE' });
      if (response.ok) {
        setSpecs(prev => prev.filter(s => s.id !== specId));
        showNotification('success', 'API deleted successfully');
        onDataChange?.(); // Notify parent of data change
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete API');
      }
    } catch (err) {
      console.error('Error deleting spec:', err);
      showNotification('error', 'Failed to delete API');
    } finally {
      setDeletingSpec(null);
      setConfirmDeleteSpec(null);
    }
  };

  const handleDeleteTool = async (toolId: string, specId: string) => {
    setDeletingTool(toolId);
    try {
      const response = await fetch(`/api/swagger/tools/${toolId}`, { method: 'DELETE' });
      if (response.ok) {
        // Refresh to get updated state
        await refreshSpecs();
        showNotification('success', 'Tool deleted successfully');
        onDataChange?.(); // Notify parent of data change
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete tool');
      }
    } catch (err) {
      console.error('Error deleting tool:', err);
      showNotification('error', 'Failed to delete tool');
    } finally {
      setDeletingTool(null);
      setConfirmDeleteTool(null);
    }
  };

  const startEditTool = (tool: RestApiTool) => {
    setEditingTool(tool.id);
    setEditToolName(tool.name);
    setEditToolWidget(tool.has_widget);
  };

  const cancelEditTool = () => {
    setEditingTool(null);
    setEditToolName('');
    setEditToolWidget(false);
  };

  const saveEditTool = async (toolId: string, specId: string) => {
    try {
      const response = await fetch(`/api/swagger/tools/${toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editToolName, hasWidget: editToolWidget }),
      });

      if (response.ok) {
        // Update local state
        setSpecs(prev => prev.map(spec => {
          if (spec.id !== specId) return spec;
          return {
            ...spec,
            endpoints: spec.endpoints?.map(e => {
              if (e.tool_id !== toolId) return e;
              return {
                ...e,
                tool: e.tool ? { ...e.tool, name: editToolName, has_widget: editToolWidget } : undefined,
              };
            }),
          };
        }));
        cancelEditTool();
        showNotification('success', 'Tool updated successfully');
        onDataChange?.(); // Notify parent of data change
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update tool');
      }
    } catch (err) {
      console.error('Error updating tool:', err);
      showNotification('error', 'Failed to update tool');
    }
  };

  // Server name editing
  const startEditSpec = (spec: RestApiSpec) => {
    setEditingSpec(spec.id);
    setEditSpecServerName(spec.server_name);
  };

  const cancelEditSpec = () => {
    setEditingSpec(null);
    setEditSpecServerName('');
  };

  const saveEditSpec = async (specId: string) => {
    try {
      const response = await fetch(`/api/swagger/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName: editSpecServerName }),
      });

      if (response.ok) {
        setSpecs(prev => prev.map(spec =>
          spec.id === specId ? { ...spec, server_name: editSpecServerName } : spec
        ));
        cancelEditSpec();
        showNotification('success', 'Server name updated successfully');
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update server name');
      }
    } catch (err) {
      console.error('Error updating spec:', err);
      showNotification('error', 'Failed to update server name');
    }
  };

  // Environment editing
  const startEditEnv = (env: RestApiEnvironment) => {
    setEditingEnv(env.id);
    setEditEnvName(env.name);
    setEditEnvHost(env.host);
  };

  const cancelEditEnv = () => {
    setEditingEnv(null);
    setEditEnvName('');
    setEditEnvHost('');
  };

  const saveEditEnv = async (envId: string, specId: string) => {
    try {
      const response = await fetch(`/api/swagger/environments/${envId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editEnvName, host: editEnvHost }),
      });

      if (response.ok) {
        cancelEditEnv();
        // Refresh from server to get updated tool names
        await refreshSpecs();
        showNotification('success', 'Environment updated successfully');
        onDataChange?.(); // Notify parent of data change
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update environment');
      }
    } catch (err) {
      console.error('Error updating environment:', err);
      showNotification('error', 'Failed to update environment');
    }
  };

  const handleDeleteEnv = async (envId: string, specId: string) => {
    setDeletingEnv(envId);
    try {
      const response = await fetch(`/api/swagger/environments/${envId}`, { method: 'DELETE' });
      if (response.ok) {
        // Refresh to get updated tool list
        await refreshSpecs();
        showNotification('success', 'Environment deleted successfully');
        onDataChange?.(); // Notify parent of data change
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete environment');
      }
    } catch (err) {
      console.error('Error deleting environment:', err);
      showNotification('error', 'Failed to delete environment');
    } finally {
      setDeletingEnv(null);
      setConfirmDeleteEnv(null);
    }
  };

  const handleReimportFromUrl = async (spec: RestApiSpec) => {
    if (!spec.source_url) return;

    setReimportingSpec(spec.id);
    try {
      const response = await fetch('/api/swagger/reimport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId: spec.id }),
      });

      if (response.ok) {
        // Refresh the specs list
        await refreshSpecs();
        showNotification('success', 'Successfully refreshed from source URL');
        onDataChange?.(); // Notify parent of data change
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to reimport');
      }
    } catch (err) {
      console.error('Error reimporting:', err);
      showNotification('error', 'Failed to reimport');
    } finally {
      setReimportingSpec(null);
      setConfirmReimport(null);
    }
  };

  if (loading) {
    return (
      <div style={{
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
          Loading REST API tools...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ color: '#ef4444' }}>⚠️ {error}</div>
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.08))',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
        marginBottom: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
          No REST API tools imported yet
        </div>
        <Link
          href="/dashboard/swagger-import"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
            fontWeight: 600,
            fontSize: '0.9rem',
            textDecoration: 'none',
          }}
        >
          ➕ Import Swagger/OpenAPI
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.08))',
      border: '1px solid rgba(16, 185, 129, 0.25)',
      borderRadius: '16px',
      padding: 'clamp(1rem, 3vw, 1.5rem)',
      marginBottom: '1.5rem',
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
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
            border: `1px solid ${notification.type === 'success' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 500,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'slideIn 0.3s ease-out',
          }}
          onClick={() => setNotification(null)}
        >
          {notification.type === 'success' ? '✓' : '✕'} {notification.message}
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
            color: '#10b981', 
            fontSize: 'clamp(1rem, 3vw, 1.25rem)', 
            fontWeight: 700, 
            margin: '0 0 0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            🔌 REST API Tools
          </h2>
          <p style={{ 
            color: 'rgba(255,255,255,0.6)', 
            fontSize: 'clamp(0.8rem, 2vw, 0.85rem)', 
            margin: 0 
          }}>
            Imported from Swagger/OpenAPI specifications
          </p>
        </div>
        <Link
          href="/dashboard/swagger-import"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
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
          const endpoints = spec.endpoints || [];
          const environments = spec.environments || [];

          return (
            <div key={spec.id} style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
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
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                    marginBottom: '0.25rem',
                  }}>
                    {spec.api_title || spec.server_name}
                  </div>
                  <div style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 'clamp(0.75rem, 2vw, 0.8rem)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      fontWeight: 600,
                    }}>
                      {spec.server_name}
                    </span>
                    <span>•</span>
                    <span>{endpoints.length} tool{endpoints.length !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{spec.environments?.length || 0} env{(spec.environments?.length || 0) !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>OpenAPI {spec.openapi_version}</span>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexShrink: 0,
                }}>
                  <span style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '1.25rem',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}>
                    ▼
                  </span>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{
                  borderTop: '1px solid rgba(16, 185, 129, 0.15)',
                  padding: '1rem',
                }}>
                  {/* Quick Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <Link
                      href={`/dashboard/rest-api/${spec.id}`}
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
                    {spec.source_url && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmReimport(spec); }}
                        disabled={reimportingSpec === spec.id}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          color: '#10b981',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: reimportingSpec === spec.id ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        🔄 {reimportingSpec === spec.id ? 'Refreshing...' : 'Refresh from URL'}
                      </button>
                    )}
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
                    <div style={{
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      marginBottom: '0.5rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Server Name
                    </div>
                    {editingSpec === spec.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editSpecServerName}
                          onChange={(e) => setEditSpecServerName(e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: '150px',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '6px',
                            border: '1px solid rgba(16, 185, 129, 0.5)',
                            background: 'rgba(0,0,0,0.3)',
                            color: '#fff',
                            fontSize: '0.85rem',
                          }}
                        />
                        <button onClick={() => saveEditSpec(spec.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelEditSpec} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>{spec.server_name}</span>
                        <button onClick={() => startEditSpec(spec)} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit server name">✏️</button>
                      </div>
                    )}
                  </div>

                  {/* Environments */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      marginBottom: '0.5rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Environments
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(spec.environments || []).map(env => (
                        <div key={env.id} style={{
                          padding: '0.5rem 0.6rem',
                          borderRadius: '6px',
                          background: 'rgba(102, 126, 234, 0.15)',
                          border: '1px solid rgba(102, 126, 234, 0.3)',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}>
                          {editingEnv === env.id ? (
                            <>
                              <input type="text" value={editEnvName} onChange={(e) => setEditEnvName(e.target.value)} placeholder="Name" style={{ width: '80px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }} />
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
                              <input type="text" value={editEnvHost} onChange={(e) => setEditEnvHost(e.target.value)} placeholder="Host URL" style={{ flex: 1, minWidth: '150px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }} />
                              <button onClick={() => saveEditEnv(env.id, spec.id)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }}>Save</button>
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
                      {/* Add Environment inline */}
                      <AddEnvironmentInline specId={spec.id} onAdd={() => { refreshSpecs(); onDataChange?.(); }} />
                    </div>
                  </div>

                  {/* Endpoints/Tools */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}>
                    <div style={{
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Tools
                    </div>
                    {onToolSelect && endpoints.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            endpoints.forEach(ep => {
                              if (ep.tool && !selectedTools.includes(ep.tool.name)) {
                                onToolSelect(ep.tool.name, true);
                              }
                            });
                          }}
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            background: 'transparent',
                            color: '#10b981',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                          }}
                        >
                          Select All
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            endpoints.forEach(ep => {
                              if (ep.tool && selectedTools.includes(ep.tool.name)) {
                                onToolSelect(ep.tool.name, false);
                              }
                            });
                          }}
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'transparent',
                            color: '#ef4444',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                          }}
                        >
                          Deselect All
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {endpoints.map(endpoint => {
                      const tool = endpoint.tool;
                      const isSelected = tool ? selectedTools.includes(tool.name) : false;

                      return (
                        <div
                          key={endpoint.id}
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
                          onClick={() => {
                            if (onToolSelect && tool) {
                              onToolSelect(tool.name, !isSelected);
                            }
                          }}
                        >
                          {/* Checkbox */}
                          {onToolSelect && (
                            <div style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: `2px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,0.3)'}`,
                              background: isSelected ? '#10b981' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                          )}

                          {/* Method Badge */}
                          <span style={{
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                            background: `${methodColors[endpoint.http_method] || '#666'}22`,
                            color: methodColors[endpoint.http_method] || '#666',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            flexShrink: 0,
                          }}>
                            {endpoint.http_method}
                          </span>

                          {/* Tool Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {editingTool === tool?.id ? (
                              <input
                                type="text"
                                value={editToolName}
                                onChange={(e) => setEditToolName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: '100%',
                                  padding: '0.3rem 0.5rem',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(102, 126, 234, 0.5)',
                                  background: 'rgba(0,0,0,0.3)',
                                  color: '#fff',
                                  fontSize: '0.85rem',
                                }}
                              />
                            ) : (
                              <>
                                <div style={{
                                  color: '#fff',
                                  fontSize: '0.85rem',
                                  fontWeight: 500,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}>
                                  {tool?.name || endpoint.operation_id}
                                </div>
                                <div style={{
                                  color: 'rgba(255,255,255,0.5)',
                                  fontSize: '0.75rem',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}>
                                  {endpoint.path}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Widget Badge / Toggle */}
                          {editingTool === tool?.id ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditToolWidget(!editToolWidget); }}
                              style={{
                                padding: '0.2rem 0.4rem',
                                borderRadius: '4px',
                                border: `1px solid ${editToolWidget ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255,255,255,0.2)'}`,
                                background: editToolWidget ? 'rgba(167, 139, 250, 0.2)' : 'transparent',
                                color: editToolWidget ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              Widget {editToolWidget ? '✓' : '○'}
                            </button>
                          ) : tool?.has_widget ? (
                            <span style={{
                              padding: '0.15rem 0.35rem',
                              borderRadius: '4px',
                              background: 'rgba(167, 139, 250, 0.2)',
                              color: '#a78bfa',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              Widget
                            </span>
                          ) : null}

                          {/* Edit/Delete/Save buttons */}
                          {tool && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                              {editingTool === tool.id ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); saveEditTool(tool.id, spec.id); }}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'rgba(16, 185, 129, 0.3)',
                                      color: '#10b981',
                                      fontSize: '0.7rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); cancelEditTool(); }}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'rgba(255,255,255,0.1)',
                                      color: 'rgba(255,255,255,0.6)',
                                      fontSize: '0.7rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setViewingToolDocs({ tool, endpoint }); }}
                                    style={{
                                      padding: '0.25rem 0.4rem',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'rgba(16, 185, 129, 0.2)',
                                      color: '#10b981',
                                      fontSize: '0.7rem',
                                      cursor: 'pointer',
                                    }}
                                    title="View tool definition"
                                  >
                                    📖
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); startEditTool(tool); }}
                                    style={{
                                      padding: '0.25rem 0.4rem',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'rgba(102, 126, 234, 0.2)',
                                      color: '#667eea',
                                      fontSize: '0.7rem',
                                      cursor: 'pointer',
                                    }}
                                    title="Edit tool"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteTool({ toolId: tool.id, specId: spec.id, toolName: tool.name }); }}
                                    disabled={deletingTool === tool.id}
                                    style={{
                                      padding: '0.25rem 0.4rem',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'rgba(239, 68, 68, 0.2)',
                                      color: '#ef4444',
                                      fontSize: '0.7rem',
                                      cursor: deletingTool === tool.id ? 'wait' : 'pointer',
                                      opacity: deletingTool === tool.id ? 0.5 : 1,
                                    }}
                                    title="Delete tool"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Environment-specific Tools */}
                  {environments.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <div style={{
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        marginBottom: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        Environment Tools
                      </div>
                      {environments.map(env => {
                        const envTools = env.tools || [];
                        if (envTools.length === 0) return null;

                        return (
                          <div key={env.id} style={{ marginBottom: '1rem' }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.5rem',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                              }}>
                                <span style={{
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  background: 'rgba(59, 130, 246, 0.2)',
                                  color: '#3b82f6',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                }}>
                                  🌐 {env.name}
                                </span>
                                <span style={{
                                  color: 'rgba(255,255,255,0.4)',
                                  fontSize: '0.7rem',
                                }}>
                                  {env.host}
                                </span>
                                <span style={{
                                  color: 'rgba(255,255,255,0.5)',
                                  fontSize: '0.7rem',
                                }}>
                                  ({envTools.length} tools)
                                </span>
                              </div>
                              {onToolSelect && envTools.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      envTools.forEach(tool => {
                                        if (!selectedTools.includes(tool.name)) {
                                          onToolSelect(tool.name, true);
                                        }
                                      });
                                    }}
                                    style={{
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(59, 130, 246, 0.4)',
                                      background: 'transparent',
                                      color: '#3b82f6',
                                      fontSize: '0.7rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Select All
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      envTools.forEach(tool => {
                                        if (selectedTools.includes(tool.name)) {
                                          onToolSelect(tool.name, false);
                                        }
                                      });
                                    }}
                                    style={{
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(239, 68, 68, 0.4)',
                                      background: 'transparent',
                                      color: '#ef4444',
                                      fontSize: '0.7rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Deselect All
                                  </button>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {envTools.map(tool => {
                                const isSelected = selectedTools.includes(tool.name);
                                return (
                                  <div
                                    key={tool.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 'clamp(0.4rem, 2vw, 0.75rem)',
                                      padding: 'clamp(0.4rem, 2vw, 0.5rem) clamp(0.5rem, 2vw, 0.75rem)',
                                      background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                                      border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                                      borderRadius: '6px',
                                      cursor: onToolSelect ? 'pointer' : 'default',
                                      flexWrap: 'wrap',
                                    }}
                                    onClick={() => {
                                      if (onToolSelect) {
                                        onToolSelect(tool.name, !isSelected);
                                      }
                                    }}
                                  >
                                    {/* Checkbox */}
                                    {onToolSelect && (
                                      <div style={{
                                        width: '16px',
                                        height: '16px',
                                        borderRadius: '4px',
                                        border: `2px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.3)'}`,
                                        background: isSelected ? '#3b82f6' : 'transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                      }}>
                                        {isSelected && (
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                        )}
                                      </div>
                                    )}
                                    {/* Tool Name */}
                                    <span style={{
                                      color: '#fff',
                                      fontSize: '0.8rem',
                                      fontWeight: 500,
                                      fontFamily: 'monospace',
                                      flex: 1,
                                      minWidth: '150px',
                                    }}>
                                      {tool.name}
                                    </span>
                                    {/* Widget Badge */}
                                    {tool.has_widget && (
                                      <span style={{
                                        padding: '0.1rem 0.35rem',
                                        borderRadius: '4px',
                                        background: 'rgba(139, 92, 246, 0.2)',
                                        color: '#8b5cf6',
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                      }}>
                                        🎨 Widget
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginTop: '1rem',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Refresh from URL button - only show if imported from URL */}
                      {spec.source_url && (
                        <button
                          onClick={() => setConfirmReimport(spec)}
                          disabled={reimportingSpec === spec.id}
                          title={`Refresh from ${spec.source_url}`}
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#10b981',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: reimportingSpec === spec.id ? 'wait' : 'pointer',
                            opacity: reimportingSpec === spec.id ? 0.5 : 1,
                          }}
                        >
                          {reimportingSpec === spec.id ? '🔄 Refreshing...' : '🔄 Refresh from URL'}
                        </button>
                      )}
                      <Link
                        href={`/dashboard/swagger-import?edit=${spec.id}`}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(102, 126, 234, 0.15)',
                          border: '1px solid rgba(102, 126, 234, 0.3)',
                          color: '#667eea',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        ✏️ Re-import
                      </Link>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteSpec({ specId: spec.id, specName: spec.api_title || spec.server_name })}
                      disabled={deletingSpec === spec.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: deletingSpec === spec.id ? 'wait' : 'pointer',
                        opacity: deletingSpec === spec.id ? 0.5 : 1,
                      }}
                    >
                      {deletingSpec === spec.id ? 'Deleting...' : '🗑️ Delete API'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tool Docs Modal */}
      {viewingToolDocs && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setViewingToolDocs(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>{viewingToolDocs.tool.name}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background: `${methodColors[viewingToolDocs.endpoint.http_method] || '#666'}22`,
                    color: methodColors[viewingToolDocs.endpoint.http_method] || '#666',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}>
                    {viewingToolDocs.endpoint.http_method}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    {viewingToolDocs.endpoint.path}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingToolDocs(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                }}
              >
                ×
              </button>
            </div>

            {viewingToolDocs.tool.description && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                  Description
                </div>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                  {viewingToolDocs.tool.description}
                </p>
              </div>
            )}

            <ToolDocsDetails toolId={viewingToolDocs.tool.id} endpointId={viewingToolDocs.endpoint.id} />
          </div>
        </div>
      )}

      {/* Delete Environment Confirmation Modal */}
      {confirmDeleteEnv && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setConfirmDeleteEnv(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗑️</div>
              <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Delete Environment?</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '0.9rem' }}>
                Are you sure you want to delete <strong style={{ color: '#ef4444' }}>{confirmDeleteEnv.envName}</strong>?
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                This will also delete all tools associated with this environment.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmDeleteEnv(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEnv(confirmDeleteEnv.envId, confirmDeleteEnv.specId)}
                disabled={deletingEnv === confirmDeleteEnv.envId}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: deletingEnv === confirmDeleteEnv.envId ? 'wait' : 'pointer',
                  opacity: deletingEnv === confirmDeleteEnv.envId ? 0.7 : 1,
                }}
              >
                {deletingEnv === confirmDeleteEnv.envId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Spec Confirmation Modal */}
      {confirmDeleteSpec && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setConfirmDeleteSpec(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚠️</div>
              <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Delete API?</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '0.9rem' }}>
                Are you sure you want to delete <strong style={{ color: '#ef4444' }}>{confirmDeleteSpec.specName}</strong>?
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                This will delete all tools and environments associated with this API.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmDeleteSpec(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSpec(confirmDeleteSpec.specId)}
                disabled={deletingSpec === confirmDeleteSpec.specId}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: deletingSpec === confirmDeleteSpec.specId ? 'wait' : 'pointer',
                  opacity: deletingSpec === confirmDeleteSpec.specId ? 0.7 : 1,
                }}
              >
                {deletingSpec === confirmDeleteSpec.specId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tool Confirmation Modal */}
      {confirmDeleteTool && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setConfirmDeleteTool(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗑️</div>
              <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Delete Tool?</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '0.9rem', wordBreak: 'break-all' }}>
                Are you sure you want to delete <strong style={{ color: '#ef4444' }}>{confirmDeleteTool.toolName}</strong>?
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmDeleteTool(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTool(confirmDeleteTool.toolId, confirmDeleteTool.specId)}
                disabled={deletingTool === confirmDeleteTool.toolId}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: deletingTool === confirmDeleteTool.toolId ? 'wait' : 'pointer',
                  opacity: deletingTool === confirmDeleteTool.toolId ? 0.7 : 1,
                }}
              >
                {deletingTool === confirmDeleteTool.toolId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reimport Confirmation Modal */}
      {confirmReimport && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setConfirmReimport(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '450px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔄</div>
              <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Refresh from URL?</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '0.9rem' }}>
                This will refresh <strong style={{ color: '#10b981' }}>{confirmReimport.api_title || confirmReimport.server_name}</strong> from:
              </p>
              <p style={{ color: '#3b82f6', margin: '0.5rem 0 0', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {confirmReimport.source_url}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                All tools will be updated to match the source.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmReimport(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleReimportFromUrl(confirmReimport)}
                disabled={reimportingSpec === confirmReimport.id}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: reimportingSpec === confirmReimport.id ? 'wait' : 'pointer',
                  opacity: reimportingSpec === confirmReimport.id ? 0.7 : 1,
                }}
              >
                {reimportingSpec === confirmReimport.id ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolDocsDetails({ toolId, endpointId }: { toolId: string; endpointId: string }) {
  const [loading, setLoading] = useState(true);
  const [toolData, setToolData] = useState<{
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
  } | null>(null);
  const [endpointData, setEndpointData] = useState<{
    headers?: Record<string, string>;
    path_params?: Record<string, unknown>[];
    query_params?: Record<string, unknown>[];
    header_params?: Record<string, unknown>[];
    request_content_type?: string;
    response_content_type?: string;
  } | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const [toolRes, endpointRes] = await Promise.all([
          fetch(`/api/tools/${toolId}`),
          fetch(`/api/swagger/endpoints/${endpointId}`),
        ]);

        if (toolRes.ok) {
          const data = await toolRes.json();
          setToolData(data.tool || data);
        }
        if (endpointRes.ok) {
          const data = await endpointRes.json();
          setEndpointData(data.endpoint || data);
        }
      } catch (err) {
        console.error('Error fetching tool details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [toolId, endpointId]);

  if (loading) {
    return <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '1rem' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Input Schema */}
      {toolData?.input_schema && Object.keys(toolData.input_schema).length > 0 && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Input Schema
          </div>
          <pre style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            padding: '0.75rem',
            margin: 0,
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.8)',
            overflow: 'auto',
            maxHeight: '200px',
          }}>
            {JSON.stringify(toolData.input_schema, null, 2)}
          </pre>
        </div>
      )}

      {/* Parameters */}
      {endpointData?.path_params && endpointData.path_params.length > 0 && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Path Parameters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {endpointData.path_params.map((param, i) => (
              <div key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                <code style={{ color: '#10b981' }}>{(param as { name: string }).name}</code>
                {(param as { required: boolean }).required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
                {(param as { description: string }).description && <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.5rem' }}>- {(param as { description: string }).description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {endpointData?.query_params && endpointData.query_params.length > 0 && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Query Parameters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {endpointData.query_params.map((param, i) => (
              <div key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                <code style={{ color: '#3b82f6' }}>{(param as { name: string }).name}</code>
                {(param as { required: boolean }).required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
                {(param as { description: string }).description && <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.5rem' }}>- {(param as { description: string }).description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Types */}
      {(endpointData?.request_content_type || endpointData?.response_content_type) && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Content Types
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
            {endpointData.request_content_type && <div>Request: <code style={{ color: '#a78bfa' }}>{endpointData.request_content_type}</code></div>}
            {endpointData.response_content_type && <div>Response: <code style={{ color: '#a78bfa' }}>{endpointData.response_content_type}</code></div>}
          </div>
        </div>
      )}
    </div>
  );
}

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
      const response = await fetch('/api/swagger/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, name: name.trim(), host: host.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create environment');
      }

      // Show brief success state
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
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: '0.5rem 0.6rem',
          borderRadius: '6px',
          border: '1px dashed rgba(16, 185, 129, 0.4)',
          background: 'transparent',
          color: '#10b981',
          fontSize: '0.8rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        + Add Environment
      </button>
    );
  }

  return (
    <div style={{
      padding: '0.5rem 0.6rem',
      borderRadius: '6px',
      background: 'rgba(16, 185, 129, 0.1)',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      fontSize: '0.8rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'wrap',
    }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g., Staging)"
        style={{ width: '100px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }}
      />
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
      <input
        type="text"
        value={host}
        onChange={(e) => setHost(e.target.value)}
        placeholder="Host URL"
        style={{ flex: 1, minWidth: '150px', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.8rem' }}
      />
      {error && <span style={{ color: '#ef4444', fontSize: '0.7rem', width: '100%' }}>{error}</span>}
      {success && <span style={{ color: '#10b981', fontSize: '0.7rem', width: '100%' }}>✓ Environment created!</span>}
      <button
        onClick={handleSubmit}
        disabled={saving || success}
        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: success ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.7rem', cursor: saving || success ? 'wait' : 'pointer' }}
      >
        {success ? '✓' : saving ? '...' : 'Create'}
      </button>
      <button
        onClick={() => { setIsOpen(false); setName(''); setHost(''); setError(null); }}
        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', cursor: 'pointer' }}
      >
        Cancel
      </button>
    </div>
  );
}
