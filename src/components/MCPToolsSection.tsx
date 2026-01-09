'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';

// Types
interface MCPTool {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
  input_schema?: Record<string, unknown>;
}

interface MCPServerTool {
  id: string;
  original_name: string;
  original_description: string | null;
  has_widget: boolean;
  is_enabled: boolean;
  tool?: MCPTool;
}

interface MCPServer {
  id: string;
  server_name: string;
  display_name: string;
  source_url: string;
  environment_name: string;
  auth_type: string;
  category: string;
  created_at: string;
  updated_at: string;
  toolCount?: number;
  tools?: MCPServerTool[];
}

interface MCPToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void;
  onHasTools?: (hasTools: boolean) => void;
}

export function MCPToolsSection({ onToolSelect, selectedTools = [], onDataChange, onHasTools }: MCPToolsSectionProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [deletingServer, setDeletingServer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteServer, setConfirmDeleteServer] = useState<{ serverId: string; serverName: string } | null>(null);
  const [viewingTool, setViewingTool] = useState<MCPServerTool | null>(null);

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

  const refreshServers = async () => {
    try {
      const response = await fetch('/api/mcp-servers/list');
      if (response.ok) {
        const data = await response.json();
        // Only show truly imported external MCP servers (not native/api_key servers)
        const importedServers = (data.servers || []).filter(
          (s: { source_type?: string }) => s.source_type === 'mcp_import'
        );
        setServers(importedServers);
        onHasTools?.(importedServers.length > 0);
      }
    } catch (err) {
      console.error('Error fetching MCP servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshServers();
  }, []);

  const toggleServer = async (serverId: string) => {
    if (expandedServers.has(serverId)) {
      setExpandedServers(prev => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    } else {
      // Fetch server details with tools
      try {
        const response = await fetch(`/api/mcp-servers/${serverId}`);
        if (response.ok) {
          const data = await response.json();
          setServers(prev => prev.map(s => 
            s.id === serverId ? { ...s, tools: data.tools } : s
          ));
        }
      } catch (err) {
        console.error('Error fetching server details:', err);
      }
      setExpandedServers(prev => new Set(prev).add(serverId));
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    setDeletingServer(serverId);
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}`, { method: 'DELETE' });
      if (response.ok) {
        showNotification('success', 'MCP server deleted successfully');
        await refreshServers();
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete server');
      }
    } catch (err) {
      showNotification('error', 'Failed to delete server');
    } finally {
      setDeletingServer(null);
      setConfirmDeleteServer(null);
    }
  };

  // Styles
  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '0.75rem',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        Loading MCP servers...
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔌</div>
        <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '0.5rem' }}>No MCP Servers Imported</h3>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Import tools from external MCP servers to use them in your compositions.
        </p>
        <Link href="/dashboard/mcp-import">
          <button style={{ ...buttonStyle, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff' }}>
            Import MCP Server →
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: notification.type === 'success' ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)',
          color: '#fff',
          fontSize: '0.85rem',
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {notification.type === 'success' ? '✓' : '⚠️'} {notification.message}
        </div>
      )}

      {/* Header with Import Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          🔌 Imported MCP Servers ({servers.length})
        </h3>
        <Link href="/dashboard/mcp-import">
          <button style={{ ...buttonStyle, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff' }}>
            + Import Server
          </button>
        </Link>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#ef4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Server List */}
      {servers.map(server => (
        <div key={server.id} style={cardStyle}>
          {/* Server Header */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            onClick={() => toggleServer(server.id)}
          >
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
              {expandedServers.has(server.id) ? '▼' : '▶'}
            </span>
            <FaviconImage
              baseUrl={server.source_url}
              alt={server.display_name}
              size={28}
              borderRadius={6}
              fallbackEmoji="🔌"
              fallbackBgColor="rgba(59, 130, 246, 0.2)"
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>{server.display_name}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>({server.server_name})</span>
                <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                  {server.toolCount || 0} tools
                </span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {server.source_url}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteServer({ serverId: server.id, serverName: server.display_name }); }}
              style={{ ...buttonStyle, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
              disabled={deletingServer === server.id}
            >
              {deletingServer === server.id ? '...' : '🗑️'}
            </button>
          </div>

          {/* Expanded Tools */}
          {expandedServers.has(server.id) && server.tools && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {server.tools.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'center' }}>No tools found</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {server.tools.map(st => (
                    <div
                      key={st.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '6px',
                      }}
                    >
                      {onToolSelect && (
                        <input
                          type="checkbox"
                          checked={selectedTools.includes(st.tool?.name || '')}
                          onChange={(e) => onToolSelect(st.tool?.name || '', e.target.checked)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{st.tool?.name || st.original_name}</span>
                          {st.has_widget && (
                            <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.65rem' }}>Widget</span>
                          )}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {st.tool?.description || st.original_description || 'No description'}
                        </p>
                      </div>
                      <button
                        onClick={() => setViewingTool(st)}
                        style={{ ...buttonStyle, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Delete Confirmation Modal */}
      {confirmDeleteServer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirmDeleteServer(null)}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '90%', border: '1px solid rgba(255,255,255,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.75rem' }}>Delete MCP Server?</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              This will delete <strong>{confirmDeleteServer.serverName}</strong> and all its imported tools. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteServer(null)} style={{ ...buttonStyle, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Cancel</button>
              <button onClick={() => handleDeleteServer(confirmDeleteServer.serverId)} style={{ ...buttonStyle, background: '#ef4444', color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Detail Modal */}
      {viewingTool && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setViewingTool(null)}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', borderRadius: '16px', padding: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflow: 'auto', border: '1px solid rgba(255,255,255,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0 }}>{viewingTool.tool?.name || viewingTool.original_name}</h3>
              <button onClick={() => setViewingTool(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', lineHeight: 1.5 }}>{viewingTool.tool?.description || viewingTool.original_description || 'No description'}</p>
            {viewingTool.has_widget && (
              <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '6px' }}>
                <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>✓ This tool supports widgets</span>
              </div>
            )}
            {viewingTool.tool?.input_schema && (
              <div>
                <h4 style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Input Schema</h4>
                <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px', overflow: 'auto', fontSize: '0.75rem', color: '#60a5fa' }}>
                  {JSON.stringify(viewingTool.tool.input_schema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

