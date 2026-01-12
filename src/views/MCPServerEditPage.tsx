'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { FaviconImage } from '../components/FaviconImage';
import { ADS_CONFIG } from '../config/ads.config';

interface MCPServerTool {
  id: string;
  toolId: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
  hasWidget?: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

interface MCPServer {
  id: string;
  server_name: string;
  display_name: string;
  source_url: string;
  environment_name: string;
  auth_type: string;
  auth_config: Record<string, unknown>;
  default_headers: Record<string, string>;
  category: string;
  server_info: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  tools: MCPServerTool[];
}

type TabType = 'overview' | 'tools';

interface Props {
  serverId: string;
  isPro: boolean;
  isPlus: boolean;
}

export function MCPServerEditPage({ serverId, isPro, isPlus }: Props) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const [server, setServer] = useState<MCPServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Field editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (canAccessPro) {
      fetchServer();
    }
  }, [serverId, canAccessPro]);

  const fetchServer = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/mcp-servers/${serverId}`);
      if (!response.ok) throw new Error('Failed to fetch server');
      const data = await response.json();
      setServer(data.server);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      router.push('/dashboard/mcp-composer');
    } catch (err) {
      setError((err as Error).message);
      setShowDeleteModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/mcp-servers/${serverId}/refresh`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh tools');
      const data = await response.json();
      setSuccess(`Refreshed: ${data.added} added, ${data.updated} updated`);
      setTimeout(() => setSuccess(null), 3000);
      fetchServer();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveField = async (field: string, value: string) => {
    if (!server) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (field === 'display_name') body.displayName = value;
      if (field === 'environment_name') body.environmentName = value;

      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      setServer({ ...server, [field]: value });
      setEditingField(null);
      setSuccess('Saved successfully');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filteredTools = (server?.tools || []).filter(tool =>
    !filter || tool.name.toLowerCase().includes(filter.toLowerCase()) ||
    tool.description?.toLowerCase().includes(filter.toLowerCase())
  );

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'tools', label: 'Tools', icon: '🔧' },
  ];

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          title="MCP Server Editor - Pro Feature"
          featureName="MCP server editing"
          showCloseButton={false}
        />
        <div style={{ maxWidth: '56rem', margin: '0 auto', filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 4rem)', fontWeight: 900, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              MCP SERVER EDITOR
            </h1>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 4vw, 2rem)' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>Loading...</div>
      </div>
    );
  }

  if (!server) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 4vw, 2rem)' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>
          <h1>Server not found</h1>
          <Link href="/dashboard/mcp-composer" style={{ color: '#667eea' }}>← Back to Composer</Link>
        </div>
      </div>
    );
  }

  const renderOverviewTab = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Server Information</h3>

        {/* Display Name - Editable */}
        <EditableField
          label="Display Name"
          value={server.display_name}
          field="display_name"
          editingField={editingField}
          editValue={editValue}
          onStartEdit={startEdit}
          onSave={saveField}
          onCancel={cancelEdit}
          onChange={setEditValue}
          saving={saving}
        />

        {/* Environment Name - Editable */}
        <EditableField
          label="Environment"
          value={server.environment_name}
          field="environment_name"
          editingField={editingField}
          editValue={editValue}
          onStartEdit={startEdit}
          onSave={saveField}
          onCancel={cancelEdit}
          onChange={setEditValue}
          saving={saving}
        />

        {/* Read-only fields */}
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Source URL</div>
              <div style={{ color: '#3b82f6', fontSize: '0.85rem', wordBreak: 'break-all' }}>{server.source_url}</div>
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Server Name</div>
              <div style={{ color: '#fff' }}>{server.server_name}</div>
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Auth Type</div>
              <div style={{ color: '#fff', textTransform: 'capitalize' }}>{server.auth_type || 'None'}</div>
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Created</div>
              <div style={{ color: '#fff' }}>{new Date(server.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <StatCard icon="🔧" label="Total Tools" value={server.tools.length} />
        <StatCard icon="✅" label="Enabled" value={server.tools.filter(t => t.isEnabled).length} />
        <StatCard icon="🏷️" label="Category" value={server.category || 'Utilities'} />
        <StatCard icon="📅" label="Updated" value={new Date(server.updated_at).toLocaleDateString()} />
      </div>

      {/* Authentication */}
      <AuthenticationEditor
        serverId={server.id}
        authType={server.auth_type}
        authConfig={server.auth_config || {}}
        serverUrl={server.source_url}
        onUpdate={fetchServer}
      />

      {/* Default Headers */}
      <DefaultHeadersEditor
        serverId={server.id}
        headers={server.default_headers || {}}
        onUpdate={fetchServer}
      />

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          🔄 {refreshing ? 'Refreshing...' : 'Refresh Tools'}
        </button>
        <button onClick={() => setShowDeleteModal(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}>
          Delete Server
        </button>
      </div>
    </div>
  );


  const renderToolsTab = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Search */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search tools..."
        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
      />

      {/* Tools List */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {filteredTools.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>No tools found</div>
        ) : (
          filteredTools.map(tool => (
            <ToolCard key={tool.id} tool={tool} serverId={serverId} onUpdate={fetchServer} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)' }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      {/* Header */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '1rem clamp(1rem, 4vw, 2rem)', position: 'relative', zIndex: 101 }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard/mcp-composer" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>← Back</Link>
            <FaviconImage baseUrl={server.source_url} alt={server.display_name} size={32} borderRadius={6} fallbackEmoji="🔌" />
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>{server.display_name}</h1>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 600 }}>MCP</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ maxWidth: '56rem', margin: '1rem auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#ef4444' }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}
      {success && (
        <div style={{ maxWidth: '56rem', margin: '1rem auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', color: '#10b981' }}>{success}</div>
        </div>
      )}

      {/* Top Ad */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1rem clamp(1rem, 4vw, 2rem) 0' }}>
        <AdBanner slot={ADS_CONFIG.slots.mcpImportTop} />
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 1rem) 0' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '0.6rem 0.75rem', background: activeTab === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 2rem) 3rem' }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'tools' && renderToolsTab()}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '2rem', maxWidth: '400px', width: '100%', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>Delete MCP Server?</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem' }}>
              This will permanently delete <strong>{server.display_name}</strong> and all its tools. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={saving} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}


// Helper Components

function EditableField({ label, value, field, editingField, editValue, onStartEdit, onSave, onCancel, onChange, saving, multiline }: {
  label: string;
  value: string;
  field: string;
  editingField: string | null;
  editValue: string;
  onStartEdit: (field: string, value: string) => void;
  onSave: (field: string, value: string) => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  saving: boolean;
  multiline?: boolean;
}) {
  const isEditing = editingField === field;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{label}</div>
      {isEditing ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem', minHeight: '80px', resize: 'vertical' }}
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
            />
          )}
          <button onClick={() => onSave(field, editValue)} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
          <button onClick={onCancel} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#fff', fontSize: '0.9rem' }}>{value || '—'}</span>
          <button onClick={() => onStartEdit(field, value)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', cursor: 'pointer', fontSize: '0.7rem' }}>✏️ Edit</button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{icon}</div>
      <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{label}</div>
    </div>
  );
}

function DefaultHeadersEditor({ serverId, headers, onUpdate }: { serverId: string; headers: Record<string, string>; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [headerList, setHeaderList] = useState<Array<{ key: string; value: string; visible: boolean }>>(
    Object.entries(headers).map(([key, value]) => ({ key, value, visible: false }))
  );
  const [saving, setSaving] = useState(false);

  const sensitivePatterns = ['api-key', 'api_key', 'apikey', 'authorization', 'auth', 'token', 'secret', 'password', 'bearer'];
  const isSensitive = (key: string) => sensitivePatterns.some(p => key.toLowerCase().includes(p));

  const handleSave = async () => {
    setSaving(true);
    try {
      const newHeaders: Record<string, string> = {};
      headerList.forEach(h => { if (h.key.trim()) newHeaders[h.key.trim()] = h.value; });

      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultHeaders: newHeaders }),
      });
      if (!response.ok) throw new Error('Failed to save');
      setEditing(false);
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>Default Headers</h3>
        {!editing && <button onClick={() => setEditing(true)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem' }}>✏️ Edit</button>}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {headerList.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" value={h.key} onChange={(e) => { const list = [...headerList]; list[i].key = e.target.value; setHeaderList(list); }} placeholder="Header name" style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
              <input type={h.visible ? 'text' : 'password'} value={h.value} onChange={(e) => { const list = [...headerList]; list[i].value = e.target.value; setHeaderList(list); }} placeholder="Value" style={{ flex: 2, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
              <button onClick={() => { const list = [...headerList]; list[i].visible = !list[i].visible; setHeaderList(list); }} style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>{h.visible ? '🙈' : '👁️'}</button>
              <button onClick={() => setHeaderList(headerList.filter((_, j) => j !== i))} style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button onClick={() => setHeaderList([...headerList, { key: '', value: '', visible: false }])} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.85rem' }}>+ Add Header</button>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => { setEditing(false); setHeaderList(Object.entries(headers).map(([key, value]) => ({ key, value, visible: false }))); }} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {Object.entries(headers).length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>No default headers configured</div>
          ) : (
            Object.entries(headers).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: '#3b82f6', fontFamily: 'monospace', fontSize: '0.85rem' }}>{key}:</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: '0.85rem' }}>{isSensitive(key) ? '••••••••' : value}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, serverId, onUpdate }: { tool: MCPServerTool; serverId: string; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tool.name);
  const [editDesc, setEditDesc] = useState(tool.description);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/mcp-servers/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc }),
      });
      if (!response.ok) throw new Error('Failed to save');
      setEditing(false);
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete tool "${tool.name}"?`)) return;
    try {
      const response = await fetch(`/api/mcp-servers/tools/${tool.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', padding: '1rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}
      >
        <span style={{ color: 'rgba(255,255,255,0.5)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{tool.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{tool.description?.substring(0, 100)}{tool.description && tool.description.length > 100 ? '...' : ''}</div>
        </div>
        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: tool.isEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: tool.isEnabled ? '#10b981' : '#ef4444', fontSize: '0.7rem', fontWeight: 600 }}>
          {tool.isEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {editing ? (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Tool Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem', minHeight: '80px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => { setEditing(false); setEditName(tool.name); setEditDesc(tool.description); }} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Category</div>
                <div style={{ color: '#fff', fontSize: '0.85rem' }}>{tool.category}</div>
              </div>

              {tool.inputSchema && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Input Schema</div>
                  <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', overflow: 'auto', maxHeight: '150px', margin: 0 }}>
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setEditing(true)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem' }}>✏️ Edit</button>
                <button onClick={handleDelete} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️ Delete</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// AuthenticationEditor Component for MCP Servers
function AuthenticationEditor({ serverId, authType, authConfig, serverUrl, onUpdate }: {
  serverId: string;
  authType: string;
  authConfig: Record<string, unknown>;
  serverUrl: string;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentAuthType, setCurrentAuthType] = useState(authType);

  // Auth values
  const [apiKey, setApiKey] = useState((authConfig.api_key as string) || '');
  const [bearerToken, setBearerToken] = useState((authConfig.bearer_token as string) || '');
  const [basicCredentials, setBasicCredentials] = useState((authConfig.credentials as string) || '');

  // OAuth2 values
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState((authConfig.authorization_endpoint as string) || '');
  const [tokenEndpoint, setTokenEndpoint] = useState((authConfig.token_endpoint as string) || '');
  const [scopes, setScopes] = useState((authConfig.scopes as string) || '');
  const [useDcr, setUseDcr] = useState((authConfig.use_dcr as boolean) || false);
  const [clientId, setClientId] = useState((authConfig.client_id as string) || '');
  const [clientSecret, setClientSecret] = useState((authConfig.client_secret as string) || '');
  const [registrationEndpoint, setRegistrationEndpoint] = useState((authConfig.registration_endpoint as string) || '');

  // Visibility toggles
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);

  const maskValue = (value: string): string => {
    if (!value) return '—';
    if (value.length <= 4) return '••••••••';
    return '••••••••' + value.slice(-4);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let newAuthConfig: Record<string, unknown> = {};

      if (currentAuthType === 'api_key') {
        newAuthConfig = { api_key: apiKey };
      } else if (currentAuthType === 'bearer') {
        newAuthConfig = { bearer_token: bearerToken };
      } else if (currentAuthType === 'basic') {
        newAuthConfig = { credentials: basicCredentials };
      } else if (currentAuthType === 'oauth2') {
        newAuthConfig = {
          authorization_endpoint: authorizationEndpoint,
          token_endpoint: tokenEndpoint,
          scopes,
          use_dcr: useDcr,
          client_id: clientId,
          client_secret: clientSecret,
          registration_endpoint: registrationEndpoint,
        };
      }

      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authType: currentAuthType, authConfig: newAuthConfig }),
      });

      if (response.ok) {
        setEditing(false);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setCurrentAuthType(authType);
    setApiKey((authConfig.api_key as string) || '');
    setBearerToken((authConfig.bearer_token as string) || '');
    setBasicCredentials((authConfig.credentials as string) || '');
    setAuthorizationEndpoint((authConfig.authorization_endpoint as string) || '');
    setTokenEndpoint((authConfig.token_endpoint as string) || '');
    setScopes((authConfig.scopes as string) || '');
    setUseDcr((authConfig.use_dcr as boolean) || false);
    setClientId((authConfig.client_id as string) || '');
    setClientSecret((authConfig.client_secret as string) || '');
    setRegistrationEndpoint((authConfig.registration_endpoint as string) || '');
  };

  const authTypeLabels: Record<string, string> = {
    none: 'None',
    api_key: 'API Key',
    bearer: 'Bearer Token',
    basic: 'Basic Auth',
    oauth2: 'OAuth 2.0',
  };

  const inputStyle = { width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>🔐 Authentication</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '0.8rem', cursor: 'pointer' }}>
            ✏️ Edit Auth
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        Authentication credentials for this MCP server.
      </p>

      {editing ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Auth Type Selector */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Authentication Type</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['none', 'api_key', 'bearer', 'basic', 'oauth2'].map((type) => (
                <button
                  key={type}
                  onClick={() => setCurrentAuthType(type)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: currentAuthType === type ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)',
                    background: currentAuthType === type ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.2)',
                    color: currentAuthType === type ? '#3b82f6' : 'rgba(255,255,255,0.7)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {authTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          {currentAuthType === 'api_key' && (
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>API Key</label>
              <div style={{ position: 'relative' }}>
                <input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API key" style={{ ...inputStyle, paddingRight: '2.5rem' }} />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>{showApiKey ? '👁️' : '👁️‍🗨️'}</button>
              </div>
            </div>
          )}

          {/* Bearer Token */}
          {currentAuthType === 'bearer' && (
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Bearer Token</label>
              <div style={{ position: 'relative' }}>
                <input type={showBearerToken ? 'text' : 'password'} value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="Enter bearer token" style={{ ...inputStyle, paddingRight: '2.5rem' }} />
                <button type="button" onClick={() => setShowBearerToken(!showBearerToken)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>{showBearerToken ? '👁️' : '👁️‍🗨️'}</button>
              </div>
            </div>
          )}

          {/* Basic Auth */}
          {currentAuthType === 'basic' && (
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Credentials (base64 encoded username:password)</label>
              <div style={{ position: 'relative' }}>
                <input type={showBasicCredentials ? 'text' : 'password'} value={basicCredentials} onChange={(e) => setBasicCredentials(e.target.value)} placeholder="Enter base64 encoded credentials" style={{ ...inputStyle, paddingRight: '2.5rem' }} />
                <button type="button" onClick={() => setShowBasicCredentials(!showBasicCredentials)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>{showBasicCredentials ? '👁️' : '👁️‍🗨️'}</button>
              </div>
            </div>
          )}

          {/* OAuth2 */}
          {currentAuthType === 'oauth2' && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Authorization Endpoint</label>
                <input type="text" value={authorizationEndpoint} onChange={(e) => setAuthorizationEndpoint(e.target.value)} placeholder="https://..." style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Token Endpoint</label>
                <input type="text" value={tokenEndpoint} onChange={(e) => setTokenEndpoint(e.target.value)} placeholder="https://..." style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Scopes (space-separated)</label>
                <input type="text" value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="openid profile email" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="useDcrMcp" checked={useDcr} onChange={(e) => setUseDcr(e.target.checked)} />
                <label htmlFor="useDcrMcp" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Use Dynamic Client Registration (DCR)</label>
              </div>
              {!useDcr && (
                <>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Client ID</label>
                    <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Client Secret</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showClientSecret ? 'text' : 'password'} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client Secret" style={{ ...inputStyle, paddingRight: '2.5rem' }} />
                      <button type="button" onClick={() => setShowClientSecret(!showClientSecret)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>{showClientSecret ? '👁️' : '👁️‍🗨️'}</button>
                    </div>
                  </div>
                </>
              )}
              {useDcr && (
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Registration Endpoint</label>
                  <input type="text" value={registrationEndpoint} onChange={(e) => setRegistrationEndpoint(e.target.value)} placeholder="https://..." style={inputStyle} />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Type:</span>
            <span style={{ background: authType === 'none' ? 'rgba(255,255,255,0.1)' : 'rgba(59, 130, 246, 0.2)', color: authType === 'none' ? 'rgba(255,255,255,0.5)' : '#3b82f6', padding: '0.25rem 0.75rem', borderRadius: '50px', fontSize: '0.8rem', fontWeight: 600 }}>
              {authTypeLabels[authType] || authType}
            </span>
          </div>

          {authType === 'api_key' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>API Key:</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{showApiKey ? String(authConfig.api_key || '') : maskValue(String(authConfig.api_key || ''))}</span>
              {Boolean(authConfig.api_key) && (
                <button onClick={() => setShowApiKey(!showApiKey)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>{showApiKey ? '👁️' : '👁️‍🗨️'}</button>
              )}
            </div>
          )}

          {authType === 'bearer' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Token:</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{showBearerToken ? String(authConfig.bearer_token || '') : maskValue(String(authConfig.bearer_token || ''))}</span>
              {Boolean(authConfig.bearer_token) && (
                <button onClick={() => setShowBearerToken(!showBearerToken)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>{showBearerToken ? '👁️' : '👁️‍🗨️'}</button>
              )}
            </div>
          )}

          {authType === 'basic' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Credentials:</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{showBasicCredentials ? String(authConfig.credentials || '') : maskValue(String(authConfig.credentials || ''))}</span>
              {Boolean(authConfig.credentials) && (
                <button onClick={() => setShowBasicCredentials(!showBasicCredentials)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>{showBasicCredentials ? '👁️' : '👁️‍🗨️'}</button>
              )}
            </div>
          )}

          {authType === 'oauth2' && (
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>Auth Endpoint:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(authConfig.authorization_endpoint || '') || '—'}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>Token Endpoint:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(authConfig.token_endpoint || '') || '—'}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>Scopes:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(authConfig.scopes || '') || '—'}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.6)' }}>DCR:</span> <span style={{ color: 'rgba(255,255,255,0.7)' }}>{authConfig.use_dcr ? 'Enabled' : 'Disabled'}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
