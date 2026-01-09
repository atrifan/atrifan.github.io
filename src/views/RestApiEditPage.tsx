'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import yaml from 'js-yaml';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';

// Types
interface RestApiTool {
  id: string;
  name: string;
  description: string;
  category: string;
  has_widget: boolean;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

interface RestApiEndpoint {
  id: string;
  tool_id: string;
  operation_id: string;
  http_method: string;
  path: string;
  tools?: RestApiTool;
}

interface RestApiEnvironment {
  id: string;
  name: string;
  host: string;
}

interface RestApiSpec {
  id: string;
  server_name: string;
  api_title: string;
  api_description: string;
  api_version: string;
  openapi_version: string;
  source_url?: string;
  import_method?: 'paste' | 'url';
  raw_spec?: string;
  swagger_spec?: Record<string, unknown>;
  spec_format?: 'json' | 'yaml';
  default_headers?: Record<string, string>;
  auth_type?: 'none' | 'bearer' | 'api_key' | 'basic' | 'custom';
  auth_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type TabType = 'overview' | 'environments' | 'tools' | 'spec';

const methodColors: Record<string, string> = {
  GET: '#10b981',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  PATCH: '#8b5cf6',
  DELETE: '#ef4444',
};

interface RestApiEditPageProps {
  specId: string;
  isPro: boolean;
  isPlus: boolean;
}

export function RestApiEditPage({ specId, isPro, isPlus }: RestApiEditPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data
  const [spec, setSpec] = useState<RestApiSpec | null>(null);
  const [endpoints, setEndpoints] = useState<RestApiEndpoint[]>([]);
  const [environments, setEnvironments] = useState<RestApiEnvironment[]>([]);

  // Edit states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Spec editing states
  const [editingSpec, setEditingSpec] = useState(false);
  const [specEditValue, setSpecEditValue] = useState('');
  const [reparsingSpec, setReparsingSpec] = useState(false);
  const [regeneratingSpec, setRegeneratingSpec] = useState(false);

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
          title="REST API Editor - Pro Feature"
          featureName="REST API specification editing"
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
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              REST API EDITOR
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
      const response = await fetch(`/api/swagger/${specId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch spec');
      }
      const data = await response.json();
      setSpec(data.spec);
      setEndpoints(data.endpoints || []);
      setEnvironments(data.environments || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveField = async (field: string, value: string) => {
    if (!spec) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (field === 'server_name') body.serverName = value;
      if (field === 'api_title') body.apiTitle = value;
      if (field === 'api_description') body.apiDescription = value;

      const response = await fetch(`/api/swagger/${specId}`, {
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

  const handleReimport = async () => {
    if (!spec?.source_url) return;
    if (!confirm(`Refresh spec from ${spec.source_url}? This will update all tools.`)) return;

    setSaving(true);
    try {
      const response = await fetch('/api/swagger/reimport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reimport');
      }

      setSuccess('Successfully refreshed from source URL!');
      fetchSpec();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSpec = async () => {
    if (!confirm('Regenerate spec from current endpoints/tools? This will overwrite the current spec.')) return;

    setRegeneratingSpec(true);
    try {
      const response = await fetch(`/api/swagger/${specId}/regenerate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to regenerate');
      }

      setSuccess('Spec regenerated from current data!');
      fetchSpec();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegeneratingSpec(false);
    }
  };

  const handleReparseSpec = async () => {
    if (!specEditValue.trim()) {
      setError('Spec content cannot be empty');
      return;
    }

    setReparsingSpec(true);
    try {
      // Detect format
      const trimmed = specEditValue.trim();
      const format = trimmed.startsWith('{') ? 'json' : 'yaml';

      const response = await fetch(`/api/swagger/${specId}/reparse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawSpec: specEditValue, format }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to parse spec');
      }

      const data = await response.json();
      setSuccess(`Spec updated! Created: ${data.stats.created}, Updated: ${data.stats.updated}, Deleted: ${data.stats.deleted}`);
      setEditingSpec(false);
      fetchSpec();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReparsingSpec(false);
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: '2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: '2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>
          <h1>Spec not found</h1>
          <Link href="/dashboard/mcp-composer" style={{ color: '#667eea' }}>← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'environments', label: 'Environments', icon: '🌍' },
    { id: 'tools', label: 'Tools', icon: '🔧' },
    { id: 'spec', label: 'Spec', icon: '📄' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)' }}>
      {/* Side Ads */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/dashboard/mcp-composer" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>
              ← Back
            </Link>
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>
              {spec.api_title || spec.server_name}
            </h1>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.75rem', fontWeight: 600 }}>
              {spec.server_name}
            </span>
          </div>
          {spec.source_url && (
            <button
              onClick={handleReimport}
              disabled={saving}
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.85rem', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              🔄 {saving ? 'Refreshing...' : 'Refresh from URL'}
            </button>
          )}
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
          <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', color: '#10b981' }}>
            {success}
          </div>
        </div>
      )}

      {/* Top Ad Banner */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 2rem 0' }}>
        <AdBanner slot={ADS_CONFIG.slots.swaggerImportTop} />
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem 0' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.6rem 0.75rem',
                background: activeTab === tab.id ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent',
                color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginBottom: '-1px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 2rem 2rem' }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'environments' && renderEnvironmentsTab()}
        {activeTab === 'tools' && renderToolsTab()}
        {activeTab === 'spec' && renderSpecTab()}
      </div>

      {/* Bottom Ad Banner */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 2rem' }}>
        <AdBanner slot={ADS_CONFIG.slots.swaggerImportBottom} />
      </div>
    </div>
  );

  function renderOverviewTab() {
    if (!spec) return null;
    return (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>API Information</h3>

          {/* Server Name */}
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

          {/* API Title */}
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

          {/* API Description */}
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
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>API Version</div>
                <div style={{ color: '#fff' }}>{spec.api_version || 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>OpenAPI Version</div>
                <div style={{ color: '#fff' }}>{spec.openapi_version || 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Import Method</div>
                <div style={{ color: '#fff' }}>{spec.import_method === 'url' ? '🔗 URL' : '📋 Paste'}</div>
              </div>
              {spec.source_url && (
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Source URL</div>
                  <div style={{ color: '#667eea', fontSize: '0.85rem', wordBreak: 'break-all' }}>{spec.source_url}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <StatCard icon="🔧" label="Tools" value={endpoints.length} />
          <StatCard icon="🌍" label="Environments" value={environments.length} />
          <StatCard icon="📅" label="Created" value={new Date(spec.created_at).toLocaleDateString()} />
          <StatCard icon="🔄" label="Updated" value={new Date(spec.updated_at).toLocaleDateString()} />
        </div>

        {/* Default Headers */}
        <DefaultHeadersEditor
          specId={spec.id}
          headers={spec.default_headers || {}}
          onUpdate={fetchSpec}
        />
      </div>
    );
  }


  function renderEnvironmentsTab() {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', margin: 0 }}>Environments ({environments.length})</h3>
          <AddEnvironmentButton specId={specId} onAdd={fetchSpec} />
        </div>

        {environments.length === 0 ? (
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
            No environments found. Add one to create tools for a new server.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {environments.map(env => (
              <EnvironmentCard key={env.id} env={env} onUpdate={fetchSpec} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderToolsTab() {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', margin: 0 }}>Tools ({endpoints.length})</h3>
        </div>

        {endpoints.length === 0 ? (
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
            No tools found
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {endpoints.map(endpoint => (
              <ToolCard key={endpoint.id} endpoint={endpoint} onUpdate={fetchSpec} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSpecTab() {
    if (!spec) return null;

    // Generate spec content based on format preference
    let specContent: string;
    if (spec.raw_spec) {
      specContent = spec.raw_spec;
    } else if (spec.swagger_spec) {
      // Use the original format if available, otherwise default to JSON
      if (spec.spec_format === 'yaml') {
        try {
          specContent = yaml.dump(spec.swagger_spec, { indent: 2, lineWidth: -1 });
        } catch {
          specContent = JSON.stringify(spec.swagger_spec, null, 2);
        }
      } else {
        specContent = JSON.stringify(spec.swagger_spec, null, 2);
      }
    } else {
      specContent = 'No spec content available';
    }

    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {/* Header with actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0 }}>OpenAPI Specification</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Edit the spec directly or regenerate from current tools/endpoints
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!editingSpec && (
              <>
                <button
                  onClick={() => { setSpecEditValue(specContent); setEditingSpec(true); }}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(102, 126, 234, 0.4)', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  ✏️ Edit Spec
                </button>
                <button
                  onClick={handleRegenerateSpec}
                  disabled={regeneratingSpec}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.85rem', cursor: regeneratingSpec ? 'wait' : 'pointer' }}
                >
                  🔄 {regeneratingSpec ? 'Regenerating...' : 'Regenerate from Tools'}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(specContent);
                    setSuccess('Copied to clipboard!');
                    setTimeout(() => setSuccess(null), 2000);
                  }}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  📋 Copy
                </button>
              </>
            )}
            {editingSpec && (
              <>
                <button
                  onClick={handleReparseSpec}
                  disabled={reparsingSpec}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.85rem', cursor: reparsingSpec ? 'wait' : 'pointer' }}
                >
                  💾 {reparsingSpec ? 'Saving...' : 'Save & Update Tools'}
                </button>
                <button
                  onClick={() => setEditingSpec(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info box about bidirectional sync */}
        <div style={{ background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid rgba(102, 126, 234, 0.3)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
          <strong style={{ color: '#667eea' }}>💡 Bidirectional Sync:</strong> Edit tools/endpoints above and click "Regenerate from Tools" to update this spec, or edit this spec directly and click "Save & Update Tools" to update the tools.
        </div>

        {/* Spec content - view or edit mode */}
        {editingSpec ? (
          <textarea
            value={specEditValue}
            onChange={(e) => setSpecEditValue(e.target.value)}
            style={{
              width: '100%',
              minHeight: '500px',
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid rgba(102, 126, 234, 0.5)',
              background: 'rgba(0,0,0,0.3)',
              color: '#e2e8f0',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
            spellCheck={false}
          />
        ) : (
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '600px', overflow: 'auto' }}>
            <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {specContent}
            </pre>
          </div>
        )}
      </div>
    );
  }
}

// Helper Components
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

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600 }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{label}</div>
    </div>
  );
}

function EnvironmentCard({ env, onUpdate }: { env: { id: string; name: string; host: string }; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(env.name);
  const [host, setHost] = useState(env.host);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/swagger/environments/${env.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, host }),
      });
      if (response.ok) {
        setEditing(false);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this environment?')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/swagger/environments/${env.id}`, { method: 'DELETE' });
      if (response.ok) onUpdate();
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
            <div style={{ color: '#fff', fontWeight: 600 }}>{env.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{env.host}</div>
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

interface ToolCardEndpoint {
  id: string;
  tool_id: string;
  operation_id: string;
  http_method: string;
  path: string;
  tools?: {
    id: string;
    name: string;
    description: string;
    category: string;
    has_widget: boolean;
  };
}

const toolMethodColors: Record<string, string> = {
  GET: '#10b981',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  PATCH: '#8b5cf6',
  DELETE: '#ef4444',
};

function ToolCard({ endpoint, onUpdate }: { endpoint: ToolCardEndpoint; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(endpoint.tools?.name || '');
  const [description, setDescription] = useState(endpoint.tools?.description || '');
  const [hasWidget, setHasWidget] = useState(endpoint.tools?.has_widget || false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tool = endpoint.tools;
  const methodColor = toolMethodColors[endpoint.http_method] || '#888';

  const handleSave = async () => {
    if (!tool) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/swagger/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, hasWidget }),
      });
      if (response.ok) {
        setEditing(false);
        onUpdate();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tool) return;
    if (!confirm('Delete this tool?')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/swagger/tools/${tool.id}`, { method: 'DELETE' });
      if (response.ok) onUpdate();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
      {editing && tool ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Tool Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id={`widget-${tool.id}`} checked={hasWidget} onChange={(e) => setHasWidget(e.target.checked)} />
            <label htmlFor={`widget-${tool.id}`} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Enable Widget</label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setEditing(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: methodColor, color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>{endpoint.http_method}</span>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{tool?.name || endpoint.operation_id}</span>
                {tool?.has_widget && <span title="Widget enabled" style={{ fontSize: '0.8rem' }}>🎨</span>}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{endpoint.path}</div>
              {tool?.description && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{tool.description}</div>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => { setName(tool?.name || ''); setDescription(tool?.description || ''); setHasWidget(tool?.has_widget || false); setEditing(true); }} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', fontSize: '0.75rem', cursor: 'pointer' }}>✏️</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}>{deleting ? '...' : '🗑️'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DefaultHeadersEditor({ specId, headers, onUpdate }: { specId: string; headers: Record<string, string>; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [headersList, setHeadersList] = useState<Array<{ key: string; value: string }>>(
    Object.entries(headers).map(([key, value]) => ({ key, value }))
  );
  const [saving, setSaving] = useState(false);

  const addHeader = () => {
    setHeadersList([...headersList, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    setHeadersList(headersList.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...headersList];
    updated[index][field] = value;
    setHeadersList(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const headersObj: Record<string, string> = {};
      for (const h of headersList) {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value;
        }
      }

      const response = await fetch(`/api/swagger/${specId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultHeaders: headersObj }),
      });

      if (response.ok) {
        setEditing(false);
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
            <button onClick={() => { setEditing(false); setHeadersList(Object.entries(headers).map(([key, value]) => ({ key, value }))); }} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        These headers are sent with every API request to this server.
      </p>

      {editing ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {headersList.map((header, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={header.key}
                onChange={(e) => updateHeader(index, 'key', e.target.value)}
                placeholder="Header name"
                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
              />
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>:</span>
              <input
                type="text"
                value={header.value}
                onChange={(e) => updateHeader(index, 'value', e.target.value)}
                placeholder="Value"
                style={{ flex: 2, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
              />
              <button onClick={() => removeHeader(index)} style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer' }}>🗑️</button>
            </div>
          ))}
          <button onClick={addHeader} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', cursor: 'pointer' }}>
            + Add Header
          </button>
        </div>
      ) : (
        <div>
          {Object.keys(headers).length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No default headers configured</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <span style={{ color: '#667eea', fontWeight: 600 }}>{key}:</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddEnvironmentButton({ specId, onAdd }: { specId: string; onAdd: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdEnvName, setCreatedEnvName] = useState('');
  const [toolsCreated, setToolsCreated] = useState(0);

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

      // Show success modal
      setCreatedEnvName(name.trim());
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
        <button
          onClick={() => setIsOpen(true)}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.85rem', cursor: 'pointer' }}
        >
          + Add Environment
        </button>
      ) : (
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Environment name (e.g., Staging)"
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
            />
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Host URL (e.g., https://staging.api.example.com)"
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem' }}
            />
            {error && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setIsOpen(false); setName(''); setHost(''); setError(null); }} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.8rem', cursor: 'pointer' }}>
                {saving ? 'Creating...' : 'Create Environment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
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
          onClick={() => { setShowSuccess(false); onAdd(); }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
              Environment Created!
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 0.5rem', fontSize: '0.95rem' }}>
              <strong style={{ color: '#10b981' }}>{createdEnvName}</strong> has been created successfully.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 1.5rem', fontSize: '0.85rem' }}>
              {toolsCreated} tool{toolsCreated !== 1 ? 's' : ''} created for this environment.
            </p>
            <button
              onClick={() => { setShowSuccess(false); onAdd(); }}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
