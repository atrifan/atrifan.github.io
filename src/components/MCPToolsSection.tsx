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
  output_schema?: Record<string, unknown>;
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
  const [error, setError] = useState<string | null>(null);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Edit states
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [editServerName, setEditServerName] = useState('');
  const [editingEnv, setEditingEnv] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState('');
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editToolName, setEditToolName] = useState('');
  const [editToolWidget, setEditToolWidget] = useState(false);

  // Action states
  const [deletingServer, setDeletingServer] = useState<string | null>(null);
  const [deletingTool, setDeletingTool] = useState<string | null>(null);
  const [refreshingServer, setRefreshingServer] = useState<string | null>(null);

  // Confirmation modals
  const [confirmDeleteServer, setConfirmDeleteServer] = useState<{ serverId: string; serverName: string } | null>(null);
  const [confirmDeleteTool, setConfirmDeleteTool] = useState<{ toolId: string; serverId: string; toolName: string } | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState<MCPServer | null>(null);

  // Tool docs modal
  const [viewingToolDocs, setViewingToolDocs] = useState<{ tool: MCPTool; serverTool: MCPServerTool } | null>(null);

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
    fetchServers();
  }, []);

  useEffect(() => {
    if (onHasTools) {
      onHasTools(servers.length > 0);
    }
  }, [servers.length, onHasTools]);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/mcp-servers/list');
      if (!response.ok) throw new Error('Failed to fetch MCP servers');
      const data = await response.json();
      // Only show truly imported external MCP servers (not native/api_key servers)
      const importedServers = (data.servers || []).filter(
        (s: { source_type?: string }) => s.source_type === 'mcp_import'
      );
      setServers(importedServers);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshServers = async () => {
    try {
      const response = await fetch('/api/mcp-servers/list');
      if (response.ok) {
        const data = await response.json();
        const importedServers = (data.servers || []).filter(
          (s: { source_type?: string }) => s.source_type === 'mcp_import'
        );
        setServers(importedServers);
      }
    } catch (err) {
      console.error('Error refreshing servers:', err);
    }
  };

  const toggleServerExpanded = (serverId: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
        // Fetch server details with tools if not already loaded
        const server = servers.find(s => s.id === serverId);
        if (server && !server.tools) {
          fetchServerDetails(serverId);
        }
      }
      return next;
    });
  };

  const fetchServerDetails = async (serverId: string) => {
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
  };

  const handleToolToggle = (toolName: string) => {
    if (onToolSelect) {
      onToolSelect(toolName, !selectedTools.includes(toolName));
    }
  };

  // Server actions
  const startEditServer = (server: MCPServer) => {
    setEditingServer(server.id);
    setEditServerName(server.display_name);
  };

  const cancelEditServer = () => {
    setEditingServer(null);
    setEditServerName('');
  };

  const saveEditServer = async (serverId: string) => {
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: editServerName }),
      });
      if (response.ok) {
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, display_name: editServerName } : s));
        cancelEditServer();
        showNotification('success', 'Server name updated');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating server:', err);
      showNotification('error', 'Failed to update server name');
    }
  };

  // Environment editing
  const startEditEnv = (server: MCPServer) => {
    setEditingEnv(server.id);
    setEditEnvName(server.environment_name);
  };

  const cancelEditEnv = () => {
    setEditingEnv(null);
    setEditEnvName('');
  };

  const saveEditEnv = async (serverId: string) => {
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentName: editEnvName }),
      });
      if (response.ok) {
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, environment_name: editEnvName } : s));
        cancelEditEnv();
        showNotification('success', 'Environment name updated');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to update');
      }
    } catch (err) {
      console.error('Error updating environment:', err);
      showNotification('error', 'Failed to update environment name');
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    setDeletingServer(serverId);
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}`, { method: 'DELETE' });
      if (response.ok) {
        setServers(prev => prev.filter(s => s.id !== serverId));
        showNotification('success', 'MCP server deleted successfully');
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

  const handleRefreshServer = async (server: MCPServer) => {
    setRefreshingServer(server.id);
    try {
      const response = await fetch(`/api/mcp-servers/${server.id}/refresh`, { method: 'POST' });
      if (response.ok) {
        await refreshServers();
        await fetchServerDetails(server.id);
        showNotification('success', 'Server refreshed successfully');
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to refresh');
      }
    } catch (err) {
      console.error('Error refreshing server:', err);
      showNotification('error', 'Failed to refresh server');
    } finally {
      setRefreshingServer(null);
      setConfirmRefresh(null);
    }
  };

  // Tool actions
  const startEditTool = (tool: MCPTool) => {
    setEditingTool(tool.id);
    setEditToolName(tool.name);
    setEditToolWidget(tool.has_widget);
  };

  const cancelEditTool = () => {
    setEditingTool(null);
    setEditToolName('');
    setEditToolWidget(false);
  };

  const saveEditTool = async (toolId: string, serverId: string) => {
    try {
      const response = await fetch(`/api/mcp-servers/tools/${toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editToolName, hasWidget: editToolWidget }),
      });
      if (response.ok) {
        await fetchServerDetails(serverId);
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

  const handleDeleteTool = async (toolId: string, serverId: string) => {
    setDeletingTool(toolId);
    try {
      const response = await fetch(`/api/mcp-servers/tools/${toolId}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchServerDetails(serverId);
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
        Loading MCP servers...
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

  if (servers.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(37, 99, 235, 0.08))',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔌</div>
        <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>No MCP Servers Imported</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 1rem' }}>
          Import tools from external MCP servers to use them in your compositions.
        </p>
        <Link
          href="/dashboard/mcp-import"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Import MCP Server
        </Link>
      </div>
    );
  }

  const getServerTools = (server: MCPServer) => server.tools || [];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(37, 99, 235, 0.08))',
      border: '1px solid rgba(59, 130, 246, 0.25)',
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
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
            border: `1px solid ${notification.type === 'success' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
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
          <h2 style={{ color: '#3b82f6', margin: 0, fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔌 MCP Tools
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0.25rem 0 0', fontSize: 'clamp(0.8rem, 2vw, 0.85rem)' }}>
            Imported from MCP servers
          </p>
        </div>
        <Link
          href="/dashboard/mcp-import"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            color: '#3b82f6',
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

      {/* Servers List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {servers.map(server => {
          const isExpanded = expandedServers.has(server.id);
          const tools = getServerTools(server);

          return (
            <div
              key={server.id}
              style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              {/* Server Header */}
              <button
                onClick={() => toggleServerExpanded(server.id)}
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
                  baseUrl={server.source_url}
                  alt={server.display_name}
                  size={32}
                  borderRadius={6}
                  fallbackEmoji="🔌"
                  fallbackBgColor="rgba(59, 130, 246, 0.2)"
                />
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', marginBottom: '0.25rem' }}>
                    {server.display_name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(0.75rem, 2vw, 0.8rem)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontWeight: 600 }}>
                      {server.environment_name || server.server_name}
                    </span>
                    <span>•</span>
                    <span>{server.toolCount || tools.length} tool{(server.toolCount || tools.length) !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {server.source_url}
                    </span>
                  </div>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.25rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▼
                </span>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(59, 130, 246, 0.15)', padding: '1rem' }}>
                  {/* Quick Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <Link
                      href={`/dashboard/mcp-server/${server.id}`}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        color: '#3b82f6',
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
                      onClick={(e) => { e.stopPropagation(); setConfirmRefresh(server); }}
                      disabled={refreshingServer === server.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#10b981',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: refreshingServer === server.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      🔄 {refreshingServer === server.id ? 'Refreshing...' : 'Refresh Tools'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteServer({ serverId: server.id, serverName: server.display_name }); }}
                      disabled={deletingServer === server.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: deletingServer === server.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      🗑️ {deletingServer === server.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>

                  {/* Server Name Edit */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Display Name
                    </div>
                    {editingServer === server.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editServerName}
                          onChange={(e) => setEditServerName(e.target.value)}
                          style={{ flex: 1, minWidth: '150px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                        <button onClick={() => saveEditServer(server.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelEditServer} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: '0.9rem' }}>{server.display_name}</span>
                        <button onClick={() => startEditServer(server)} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit display name">✏️</button>
                      </div>
                    )}
                  </div>

                  {/* Environment Name Edit */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Environment
                    </div>
                    {editingEnv === server.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editEnvName}
                          onChange={(e) => setEditEnvName(e.target.value)}
                          style={{ flex: 1, minWidth: '150px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                        />
                        <button onClick={() => saveEditEnv(server.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelEditEnv} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#3b82f6', fontWeight: 600, fontSize: '0.85rem' }}>{server.environment_name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{server.source_url}</span>
                        <button onClick={() => startEditEnv(server)} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit environment name">✏️</button>
                      </div>
                    )}
                  </div>

                  {/* Tools */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Tools
                    </div>
                    {onToolSelect && tools.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            tools.forEach(st => {
                              if (st.tool && !selectedTools.includes(st.tool.name)) {
                                onToolSelect(st.tool.name, true);
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
                            tools.forEach(st => {
                              if (st.tool && selectedTools.includes(st.tool.name)) {
                                onToolSelect(st.tool.name, false);
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
                    {tools.length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No tools found. Try refreshing.</p>
                    ) : tools.map(st => {
                      const tool = st.tool;
                      const isSelected = tool ? selectedTools.includes(tool.name) : false;

                      return (
                        <div
                          key={st.id}
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
                          onClick={() => { if (onToolSelect && tool) handleToolToggle(tool.name); }}
                        >
                          {/* Checkbox */}
                          {onToolSelect && (
                            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,0.3)'}`, background: isSelected ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                            </div>
                          )}

                          {/* Tool Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {editingTool === tool?.id ? (
                              <input type="text" value={editToolName} onChange={(e) => setEditToolName(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: '100%', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
                            ) : (
                              <>
                                <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {tool?.name || st.original_name}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {st.original_name}
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
                                  <button onClick={(e) => { e.stopPropagation(); saveEditTool(tool.id, server.id); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }}>Save</button>
                                  <button onClick={(e) => { e.stopPropagation(); cancelEditTool(); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', cursor: 'pointer' }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); setViewingToolDocs({ tool, serverTool: st }); }} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.7rem', cursor: 'pointer' }} title="View tool definition">📖</button>
                                  <button onClick={(e) => { e.stopPropagation(); startEditTool(tool); }} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '0.7rem', cursor: 'pointer' }} title="Edit tool">✏️</button>
                                  <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteTool({ toolId: tool.id, serverId: server.id, toolName: tool.name }); }} disabled={deletingTool === tool.id} style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.7rem', cursor: deletingTool === tool.id ? 'wait' : 'pointer', opacity: deletingTool === tool.id ? 0.5 : 1 }} title="Delete tool">🗑️</button>
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
      {confirmDeleteServer && (
        <ConfirmModal
          title="Delete MCP Server"
          message={`Are you sure you want to delete "${confirmDeleteServer.serverName}"? This will remove all associated tools.`}
          onConfirm={() => handleDeleteServer(confirmDeleteServer.serverId)}
          onCancel={() => setConfirmDeleteServer(null)}
          confirmText="Delete"
          confirmColor="#ef4444"
        />
      )}

      {confirmDeleteTool && (
        <ConfirmModal
          title="Delete Tool"
          message={`Are you sure you want to delete the tool "${confirmDeleteTool.toolName}"?`}
          onConfirm={() => handleDeleteTool(confirmDeleteTool.toolId, confirmDeleteTool.serverId)}
          onCancel={() => setConfirmDeleteTool(null)}
          confirmText="Delete"
          confirmColor="#ef4444"
        />
      )}

      {confirmRefresh && (
        <ConfirmModal
          title="Refresh Server"
          message={`Refresh tools from ${confirmRefresh.source_url}? This will update existing tools and add any new ones.`}
          onConfirm={() => handleRefreshServer(confirmRefresh)}
          onCancel={() => setConfirmRefresh(null)}
          confirmText="Refresh"
          confirmColor="#10b981"
        />
      )}

      {/* Tool Docs Modal */}
      {viewingToolDocs && (
        <ToolDocsModal
          tool={viewingToolDocs.tool}
          serverTool={viewingToolDocs.serverTool}
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
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
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
function ToolDocsModal({ tool, serverTool, onClose }: { tool: MCPTool; serverTool: MCPServerTool; onClose: () => void }) {
  const hasInputSchema = tool.input_schema && Object.keys(tool.input_schema).length > 0;
  const hasOutputSchema = tool.output_schema && Object.keys(tool.output_schema).length > 0;
  const hasDescription = tool.description || serverTool.original_description;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ color: '#fff', margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{tool.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '0.7rem', fontWeight: 600 }}>
                MCP
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{serverTool.original_name}</span>
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
              {tool.description || serverTool.original_description}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Input Schema */}
          <div>
            <div style={{ color: '#3b82f6', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📥 Input Schema
            </div>
            {hasInputSchema ? (
              <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '6px', padding: '0.75rem', margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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

