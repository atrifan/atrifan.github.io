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

interface GraphQLTool {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
  category?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

interface GraphQLOperation {
  id: string;
  tool_id: string;
  operation_name: string;
  operation_type: 'query' | 'mutation' | 'subscription';
  description: string | null;
  arguments: Array<{ name: string; type: string; required: boolean }>;
  return_type: string | null;
  tools?: GraphQLTool;
}

interface GraphQLEnvironment {
  id: string;
  name: string;
  host: string;
}

interface GraphQLSpec {
  id: string;
  server_name: string;
  api_title: string | null;
  api_description: string | null;
  source_url: string;
  default_headers: Record<string, string>;
  auth_type: string;
  auth_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type TabType = 'overview' | 'environments' | 'operations' | 'docs';

interface Props {
  specId: string;
  isPro: boolean;
  isPlus: boolean;
}

export function GraphQLEditPage({ specId, isPro, isPlus }: Props) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const [spec, setSpec] = useState<GraphQLSpec | null>(null);
  const [operations, setOperations] = useState<GraphQLOperation[]>([]);
  const [environments, setEnvironments] = useState<GraphQLEnvironment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'query' | 'mutation'>('all');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Refresh schemas state
  const [refreshing, setRefreshing] = useState(false);

  // Field editing state (like REST API edit page)
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (canAccessPro) {
      fetchSpec();
    }
  }, [specId, canAccessPro]);

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          title="GraphQL Editor - Pro Feature"
          featureName="GraphQL specification editing"
          showCloseButton={false}
        />
        <div style={{ maxWidth: '56rem', margin: '0 auto', filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #e535ab 0%, #ff6b6b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              GRAPHQL EDITOR
            </h1>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const fetchSpec = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/graphql/${specId}`);
      if (!response.ok) throw new Error('Failed to fetch spec');
      const data = await response.json();
      setSpec(data.spec);
      setOperations(data.operations || []);
      setEnvironments(data.environments || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/graphql/${specId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      router.push('/dashboard/mcp-composer');
    } catch (err) {
      setError((err as Error).message);
      setShowDeleteModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshSchemas = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/graphql/specs/${specId}/refresh`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh schemas');
      const data = await response.json();
      setSuccess(`Refreshed ${data.updatedCount} of ${data.totalOperations} operations`);
      setTimeout(() => setSuccess(null), 3000);
      // Refetch to get updated data
      fetchSpec();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpdateSpec = async (updates: Partial<GraphQLSpec>) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/graphql/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update');
      setSuccess('Saved successfully');
      setTimeout(() => setSuccess(null), 2000);
      fetchSpec();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Field editing helpers (like REST API edit page)
  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveField = async (field: string, value: string) => {
    if (!spec) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (field === 'server_name') body.serverName = value;
      if (field === 'api_title') body.apiTitle = value;
      if (field === 'api_description') body.apiDescription = value;

      const response = await fetch(`/api/graphql/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      setSpec({ ...spec, [field]: value });
      setEditingField(null);
      setSuccess('Saved successfully');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWidget = async (opId: string, hasWidget: boolean) => {
    try {
      const response = await fetch(`/api/graphql/operations/${opId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasWidget }),
      });
      if (!response.ok) throw new Error('Failed to update');
      fetchSpec();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filteredOperations = operations.filter(op => {
    const matchesSearch = !filter || 
      op.operation_name.toLowerCase().includes(filter.toLowerCase()) ||
      (op.description?.toLowerCase().includes(filter.toLowerCase()));
    const matchesType = typeFilter === 'all' || op.operation_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'environments', label: 'Environments', icon: '🌍' },
    { id: 'operations', label: 'Operations', icon: '⚡' },
    { id: 'docs', label: 'Schema', icon: '📄' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 4vw, 2rem)' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>Loading...</div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 4vw, 2rem)' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>
          <h1>Spec not found</h1>
          <Link href="/dashboard/mcp-composer" style={{ color: '#667eea' }}>← Back to Creator</Link>
        </div>
      </div>
    );
  }

  const renderOverviewTab = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>API Information</h3>

        {/* Server Name - Editable */}
        <EditableField
          label="Server Name"
          value={spec.server_name}
          field="server_name"
          editingField={editingField}
          editValue={editValue}
          onStartEdit={startEdit}
          onSave={saveField}
          onCancel={cancelEdit}
          onChange={setEditValue}
          saving={saving}
        />

        {/* API Title - Editable */}
        <EditableField
          label="API Title"
          value={spec.api_title || ''}
          field="api_title"
          editingField={editingField}
          editValue={editValue}
          onStartEdit={startEdit}
          onSave={saveField}
          onCancel={cancelEdit}
          onChange={setEditValue}
          saving={saving}
        />

        {/* API Description - Editable */}
        <EditableField
          label="Description"
          value={spec.api_description || ''}
          field="api_description"
          editingField={editingField}
          editValue={editValue}
          onStartEdit={startEdit}
          onSave={saveField}
          onCancel={cancelEdit}
          onChange={setEditValue}
          saving={saving}
          multiline
        />

        {/* Read-only fields */}
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Source URL</div>
              <div style={{ color: '#667eea', fontSize: '0.85rem', wordBreak: 'break-all' }}>{spec.source_url}</div>
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Created</div>
              <div style={{ color: '#fff' }}>{new Date(spec.created_at).toLocaleDateString()}</div>
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Updated</div>
              <div style={{ color: '#fff' }}>{new Date(spec.updated_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <StatCard icon="⚡" label="Queries" value={operations.filter(o => o.operation_type === 'query').length} />
        <StatCard icon="🔄" label="Mutations" value={operations.filter(o => o.operation_type === 'mutation').length} />
        <StatCard icon="🌍" label="Environments" value={environments.length} />
        <StatCard icon="📅" label="Created" value={new Date(spec.created_at).toLocaleDateString()} />
      </div>

      {/* Default Headers */}
      <DefaultHeadersEditor
        specId={spec.id}
        headers={spec.default_headers || {}}
        onUpdate={fetchSpec}
      />

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={handleRefreshSchemas}
          disabled={refreshing}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid rgba(102, 126, 234, 0.4)',
            background: 'rgba(102, 126, 234, 0.1)',
            color: '#667eea',
            cursor: refreshing ? 'wait' : 'pointer',
            opacity: refreshing ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh Schemas'}
        </button>
        <button onClick={() => setShowDeleteModal(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}>
          Delete API
        </button>
      </div>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  const renderEnvironmentsTab = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <AddEnvironmentButton specId={specId} onAdd={fetchSpec} />
      {environments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>No environments configured</div>
      ) : (
        environments.map(env => (
          <EnvironmentCard key={env.id} environment={env} onDelete={fetchSpec} />
        ))
      )}
    </div>
  );

  const renderOperationsTab = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search operations..."
          style={{ flex: 1, minWidth: '200px', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | 'query' | 'mutation')} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
          <option value="all">All Types</option>
          <option value="query">Queries</option>
          <option value="mutation">Mutations</option>
        </select>
      </div>

      {/* Operations List */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {filteredOperations.map(op => (
          <OperationCard key={op.id} operation={op} onUpdate={fetchSpec} />
        ))}
      </div>
    </div>
  );

  const renderDocsTab = () => (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>GraphQL Schema</h3>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
        Schema introspected from: <a href={spec.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>{spec.source_url}</a>
      </p>
      <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto' }}>
        <pre style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>
          {operations.map(op => `${op.operation_type} ${op.operation_name}(${op.arguments?.map(a => `${a.name}: ${a.type}`).join(', ') || ''}): ${op.return_type || 'void'}`).join('\n')}
        </pre>
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
            <FaviconImage baseUrl={spec.source_url || ''} alt={spec.api_title || spec.server_name} size={32} borderRadius={6} fallbackEmoji="◈" fallbackBgColor="rgba(236, 72, 153, 0.2)" />
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>{spec.api_title || spec.server_name}</h1>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(236, 72, 153, 0.2)', color: '#ec4899', fontSize: '0.75rem', fontWeight: 600 }}>GraphQL</span>
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
        <AdBanner slot={ADS_CONFIG.slots.graphqlImportTop} />
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 1rem) 0' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '0.6rem 0.75rem', background: activeTab === tab.id ? 'rgba(102, 126, 234, 0.2)' : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 2rem) 2rem' }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'environments' && renderEnvironmentsTab()}
        {activeTab === 'operations' && renderOperationsTab()}
        {activeTab === 'docs' && renderDocsTab()}
      </div>

      {/* Bottom Ad */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 2rem) 2rem' }}>
        <AdBanner slot={ADS_CONFIG.slots.graphqlImportBottom} />
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowDeleteModal(false)}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Delete GraphQL API?</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 1.5rem' }}>This will delete all operations, tools, and environments. This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={saving} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.3)', color: '#ef4444', cursor: 'pointer' }}>{saving ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Environment Card Component (matching REST API edit page design)
function EnvironmentCard({ environment, onDelete }: { environment: GraphQLEnvironment; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(environment.name);
  const [host, setHost] = useState(environment.host);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/graphql/environments/${environment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, host }),
      });
      if (response.ok) {
        setEditing(false);
        onDelete(); // This is actually onUpdate - refresh the list
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this environment?')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/graphql/environments/${environment.id}`, { method: 'DELETE' });
      if (response.ok) onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
      {editing ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host URL" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setEditing(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 600 }}>{environment.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{environment.host}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditing(true)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.75rem', cursor: 'pointer' }}>✏️</button>
            <button onClick={handleDelete} disabled={deleting} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}>{deleting ? '...' : '🗑️'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Add Environment Button Component
function AddEnvironmentButton({ specId, onAdd }: { specId: string; onAdd: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [toolsCreated, setToolsCreated] = useState(0);

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
      if (!response.ok) throw new Error(data.error || 'Failed to create environment');
      setToolsCreated(data.toolsCreated || 0);
      setShowSuccess(true);
      setIsOpen(false);
      setName('');
      setHost('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create environment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.85rem', cursor: 'pointer' }}>+ Add Environment</button>
      ) : (
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Environment name (e.g., Staging)" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }} />
            <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="GraphQL endpoint URL" style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }} />
            {error && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setIsOpen(false); setName(''); setHost(''); setError(null); }} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => { setShowSuccess(false); onAdd(); }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Environment Created!</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 1.5rem' }}>{toolsCreated} tools created for this environment.</p>
            <button onClick={() => { setShowSuccess(false); onAdd(); }} style={{ padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>Got it!</button>
          </div>
        </div>
      )}
    </>
  );
}

// Editable field component (matching REST API edit page design)
function EditableField({
  label,
  value,
  field,
  editingField,
  editValue,
  onStartEdit,
  onSave,
  onCancel,
  onChange,
  saving,
  multiline = false,
}: {
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
              rows={3}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem', resize: 'vertical' }}
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
            />
          )}
          <button onClick={() => onSave(field, editValue)} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={onCancel} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ color: '#fff', flex: 1 }}>{value || <em style={{ color: 'rgba(255,255,255,0.3)' }}>Not set</em>}</span>
          <button onClick={() => onStartEdit(field, value)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.75rem', cursor: 'pointer' }}>
            ✏️ Edit
          </button>
        </div>
      )}
    </div>
  );
}

// Operation Card Component with editable description and viewable schemas
function OperationCard({ operation, onUpdate }: { operation: GraphQLOperation; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(operation.tools?.description || '');
  const [saving, setSaving] = useState(false);

  const tool = operation.tools;
  const typeColor = operation.operation_type === 'query' ? '#667eea' : '#f59e0b';
  const typeBg = operation.operation_type === 'query' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)';

  const handleSaveDescription = async () => {
    if (!tool) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/graphql/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      if (response.ok) {
        setEditingDescription(false);
        onUpdate();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWidget = async () => {
    if (!tool) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/graphql/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasWidget: !tool.has_widget }),
      });
      if (response.ok) onUpdate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
      {/* Header row */}
      <div
        style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: typeBg, color: typeColor, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
          {operation.operation_type}
        </span>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>{operation.operation_name}</div>
          {tool?.description && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{tool.description}</div>}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontFamily: 'monospace' }}>→ {operation.return_type || 'void'}</div>
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleWidget(); }}
          disabled={saving}
          style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', background: tool?.has_widget ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: tool?.has_widget ? '#10b981' : 'rgba(255,255,255,0.5)', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {tool?.has_widget ? '✓ Widget' : 'No Widget'}
        </button>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Description editing */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Description</div>
            {editingDescription ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(102, 126, 234, 0.5)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem', resize: 'vertical' }}
                />
                <button onClick={handleSaveDescription} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
                <button onClick={() => { setEditingDescription(false); setDescription(tool?.description || ''); }} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: '#fff', flex: 1, fontSize: '0.9rem' }}>{tool?.description || <em style={{ color: 'rgba(255,255,255,0.3)' }}>No description</em>}</span>
                <button onClick={() => { setDescription(tool?.description || ''); setEditingDescription(true); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.75rem', cursor: 'pointer' }}>
                  ✏️ Edit
                </button>
              </div>
            )}
          </div>

          {/* Input Schema (read-only) */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Input Schema {operation.arguments && operation.arguments.length > 0 && <span style={{ color: '#667eea' }}>({operation.arguments.length} args)</span>}
            </div>
            {tool?.input_schema && Object.keys(tool.input_schema).length > 0 ? (
              <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', overflow: 'auto', maxHeight: '250px', margin: 0 }}>
                {JSON.stringify(tool.input_schema, null, 2)}
              </pre>
            ) : operation.arguments && operation.arguments.length > 0 ? (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem' }}>
                {operation.arguments.map((arg, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: idx < operation.arguments.length - 1 ? '0.5rem' : 0 }}>
                    <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.8rem' }}>{arg.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>:</span>
                    <span style={{ color: '#667eea', fontFamily: 'monospace', fontSize: '0.8rem' }}>{arg.type}</span>
                    {arg.required && <span style={{ color: '#ef4444', fontSize: '0.7rem' }}>*</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', fontSize: '0.85rem' }}>No input parameters</span>
              </div>
            )}
          </div>

          {/* Return Type / Output Schema (read-only) */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Output Schema {operation.return_type && <span style={{ color: '#10b981' }}>({operation.return_type})</span>}
            </div>
            {tool?.output_schema && Object.keys(tool.output_schema).length > 0 ? (
              <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', overflow: 'auto', maxHeight: '250px', margin: 0 }}>
                {JSON.stringify(tool.output_schema, null, 2)}
              </pre>
            ) : (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', fontSize: '0.85rem' }}>No detailed schema available</span>
              </div>
            )}
          </div>

          {/* Tool info */}
          {tool && (
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                <span>Tool: <span style={{ color: '#fff' }}>{tool.name}</span></span>
                <span>Category: <span style={{ color: '#fff' }}>{tool.category || 'graphql'}</span></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// StatCard Component (matching REST API edit page)
function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{icon}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{label}</div>
    </div>
  );
}

// DefaultHeadersEditor Component (matching REST API edit page)
function DefaultHeadersEditor({ specId, headers, onUpdate }: { specId: string; headers: Record<string, string>; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [headersList, setHeadersList] = useState<Array<{ key: string; value: string }>>(
    Object.entries(headers).map(([key, value]) => ({ key, value }))
  );
  const [saving, setSaving] = useState(false);
  const [visibleHeaders, setVisibleHeaders] = useState<Set<number>>(new Set());
  const [visibleViewHeaders, setVisibleViewHeaders] = useState<Set<string>>(new Set());

  const isSensitiveHeader = (key: string): boolean => {
    const lowerKey = key.toLowerCase();
    return lowerKey.includes('api-key') || lowerKey.includes('apikey') || lowerKey.includes('x-api-key') ||
           lowerKey.includes('authorization') || lowerKey.includes('token') || lowerKey.includes('secret') ||
           lowerKey.includes('password') || lowerKey.includes('bearer') || lowerKey.includes('auth');
  };

  const toggleHeaderVisibility = (index: number) => {
    setVisibleHeaders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  };

  const toggleViewHeaderVisibility = (key: string) => {
    setVisibleViewHeaders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  const maskValue = (value: string): string => {
    if (value.length <= 4) return '••••••••';
    return '••••••••' + value.slice(-4);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const headersObj: Record<string, string> = {};
      for (const h of headersList) {
        if (h.key.trim()) headersObj[h.key.trim()] = h.value;
      }
      const response = await fetch(`/api/graphql/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_headers: headersObj }),
      });
      if (response.ok) {
        setEditing(false);
        setVisibleHeaders(new Set());
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>Default Headers</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.8rem', cursor: 'pointer' }}>
            ✏️ Edit Headers
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setHeadersList(Object.entries(headers).map(([key, value]) => ({ key, value }))); setVisibleHeaders(new Set()); }} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        These headers are sent with every GraphQL request to this server.
      </p>
      {editing ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {headersList.map((header, index) => {
            const isSensitive = isSensitiveHeader(header.key);
            const isVisible = visibleHeaders.has(index);
            return (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="text" value={header.key} onChange={(e) => { const updated = [...headersList]; updated[index].key = e.target.value; setHeadersList(updated); }} placeholder="Header name" style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>:</span>
                <div style={{ flex: 2, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input type={isSensitive && !isVisible ? 'password' : 'text'} value={header.value} onChange={(e) => { const updated = [...headersList]; updated[index].value = e.target.value; setHeadersList(updated); }} placeholder="Value" style={{ width: '100%', padding: '0.5rem', paddingRight: isSensitive ? '2.5rem' : '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }} />
                  {isSensitive && (
                    <button type="button" onClick={() => toggleHeaderVisibility(index)} style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.25rem', fontSize: '0.9rem' }} title={isVisible ? 'Hide value' : 'Show value'}>
                      {isVisible ? '👁️' : '👁️‍🗨️'}
                    </button>
                  )}
                </div>
                <button onClick={() => setHeadersList(headersList.filter((_, i) => i !== index))} style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer' }}>🗑️</button>
              </div>
            );
          })}
          <button onClick={() => setHeadersList([...headersList, { key: '', value: '' }])} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', cursor: 'pointer' }}>
            + Add Header
          </button>
        </div>
      ) : (
        <div>
          {Object.keys(headers).length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No default headers configured</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {Object.entries(headers).map(([key, value]) => {
                const isSensitive = isSensitiveHeader(key);
                const isVisible = visibleViewHeaders.has(key);
                return (
                  <div key={key} style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', alignItems: 'center' }}>
                    <span style={{ color: '#667eea', fontWeight: 600 }}>{key}:</span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', flex: 1 }}>{isSensitive && !isVisible ? maskValue(value) : value}</span>
                    {isSensitive && (
                      <button type="button" onClick={() => toggleViewHeaderVisibility(key)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.25rem', fontSize: '0.85rem' }} title={isVisible ? 'Hide value' : 'Show value'}>
                        {isVisible ? '👁️' : '👁️‍🗨️'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
