'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';

interface GraphQLTool {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
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

type TabType = 'overview' | 'environments' | 'operations' | 'headers' | 'docs';

interface Props {
  specId: string;
}

export function GraphQLEditPage({ specId }: Props) {
  const router = useRouter();
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

  // Headers editing state
  const [editingHeaders, setEditingHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'basic' | 'api_key'>('none');
  const [headersSaving, setHeadersSaving] = useState(false);

  useEffect(() => {
    fetchSpec();
  }, [specId]);

  const fetchSpec = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/graphql/${specId}`);
      if (!response.ok) throw new Error('Failed to fetch spec');
      const data = await response.json();
      setSpec(data.spec);
      setOperations(data.operations || []);
      setEnvironments(data.environments || []);

      // Initialize headers editing state
      if (data.spec?.default_headers) {
        const headers = Object.entries(data.spec.default_headers).map(([key, value]) => ({
          key,
          value: value as string,
        }));
        setEditingHeaders(headers);
      }
      if (data.spec?.auth_type) {
        setAuthType(data.spec.auth_type as 'none' | 'bearer' | 'basic' | 'api_key');
      }
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
    { id: 'headers', label: 'Headers', icon: '🔐' },
    { id: 'docs', label: 'Schema', icon: '📄' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: '2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>Loading...</div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: '2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>
          <h1>Spec not found</h1>
          <Link href="/dashboard/mcp-composer" style={{ color: '#667eea' }}>← Back to Composer</Link>
        </div>
      </div>
    );
  }

  const renderOverviewTab = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>API Information</h3>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Server Name</label>
            <div style={{ color: '#fff', fontSize: '1rem' }}>{spec.server_name}</div>
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Title</label>
            <div style={{ color: '#fff', fontSize: '1rem' }}>{spec.api_title || '-'}</div>
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Description</label>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>{spec.api_description || 'No description'}</div>
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Source URL</label>
            <div style={{ color: '#667eea', fontSize: '0.9rem', wordBreak: 'break-all' }}>{spec.source_url}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <div style={{ background: 'rgba(102, 126, 234, 0.1)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(102, 126, 234, 0.3)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#667eea' }}>{operations.filter(o => o.operation_type === 'query').length}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Queries</div>
        </div>
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>{operations.filter(o => o.operation_type === 'mutation').length}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Mutations</div>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>{environments.length}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Environments</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowDeleteModal(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}>
          Delete API
        </button>
      </div>
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
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {filteredOperations.map(op => (
          <div key={op.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: op.operation_type === 'query' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: op.operation_type === 'query' ? '#667eea' : '#f59e0b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
              {op.operation_type}
            </span>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <div style={{ color: '#fff', fontWeight: 500 }}>{op.operation_name}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{op.tools?.name || 'No tool'}</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>→ {op.return_type || 'void'}</div>
            <button
              onClick={() => handleToggleWidget(op.id, !op.tools?.has_widget)}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: op.tools?.has_widget ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: op.tools?.has_widget ? '#10b981' : 'rgba(255,255,255,0.5)', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              {op.tools?.has_widget ? '✓ Widget' : 'No Widget'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const handleSaveHeaders = async () => {
    setHeadersSaving(true);
    setError(null);
    try {
      // Build headers object from array
      const headersObj: Record<string, string> = {};
      editingHeaders.forEach(h => {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value;
        }
      });

      const response = await fetch(`/api/graphql/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_headers: headersObj,
          auth_type: authType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save headers');
      }

      setSuccess('Headers saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHeadersSaving(false);
    }
  };

  const renderHeadersTab = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Auth Type */}
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Authentication Type</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['none', 'api_key', 'bearer', 'basic'] as const).map(type => (
            <button
              key={type}
              onClick={() => setAuthType(type)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: authType === type ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {type === 'none' ? 'None' : type === 'api_key' ? 'API Key' : type === 'bearer' ? 'Bearer Token' : 'Basic Auth'}
            </button>
          ))}
        </div>
      </div>

      {/* Default Headers */}
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Default Headers</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          These headers will be sent with every GraphQL request.
        </p>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {editingHeaders.map((header, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={header.key}
                onChange={(e) => {
                  const newHeaders = [...editingHeaders];
                  newHeaders[index].key = e.target.value;
                  setEditingHeaders(newHeaders);
                }}
                placeholder="Header name"
                style={{ flex: '1 1 150px', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
              />
              <input
                type="text"
                value={header.value}
                onChange={(e) => {
                  const newHeaders = [...editingHeaders];
                  newHeaders[index].value = e.target.value;
                  setEditingHeaders(newHeaders);
                }}
                placeholder="Header value"
                style={{ flex: '2 1 200px', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
              />
              <button
                onClick={() => setEditingHeaders(editingHeaders.filter((_, i) => i !== index))}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={() => setEditingHeaders([...editingHeaders, { key: '', value: '' }])}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            + Add Header
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSaveHeaders}
          disabled={headersSaving}
          style={{ padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', opacity: headersSaving ? 0.7 : 1 }}
        >
          {headersSaving ? 'Saving...' : 'Save Headers'}
        </button>
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
      <div style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '1rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard/mcp-composer" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>← Back</Link>
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>{spec.api_title || spec.server_name}</h1>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.75rem', fontWeight: 600 }}>GraphQL</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ maxWidth: '1200px', margin: '1rem auto', padding: '0 2rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#ef4444' }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}
      {success && (
        <div style={{ maxWidth: '1200px', margin: '1rem auto', padding: '0 2rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', color: '#10b981' }}>{success}</div>
        </div>
      )}

      {/* Top Ad */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 2rem 0' }}>
        <AdBanner slot={ADS_CONFIG.slots.graphqlImportTop} />
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem 0' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '0.6rem 0.75rem', background: activeTab === tab.id ? 'rgba(102, 126, 234, 0.2)' : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 2rem 2rem' }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'environments' && renderEnvironmentsTab()}
        {activeTab === 'operations' && renderOperationsTab()}
        {activeTab === 'headers' && renderHeadersTab()}
        {activeTab === 'docs' && renderDocsTab()}
      </div>

      {/* Bottom Ad */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 2rem' }}>
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

// Environment Card Component
function EnvironmentCard({ environment, onDelete }: { environment: GraphQLEnvironment; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/graphql/environments/${environment.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      onDelete();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
      <div>
        <div style={{ color: '#fff', fontWeight: 500 }}>{environment.name}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{environment.host}</div>
      </div>
      <button onClick={handleDelete} disabled={deleting} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer' }}>
        {deleting ? 'Deleting...' : 'Delete'}
      </button>
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

