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
import { AuthenticationSection } from '../components/AuthenticationSection';
import { ADS_CONFIG } from '../config/ads.config';

interface A2AAgent {
  id: string;
  agent_name: string;
  display_name: string;
  agent_url: string;
  import_url: string | null;
  environment_name: string;
  auth_type: string;
  auth_config: Record<string, unknown>;
  default_headers: Record<string, string>;
  category: string;
  description: string;
  icon_url: string | null;
  tags: string[];
  version: string | null;
  protocol_version: string | null;
  tool_id: string | null;
  created_at: string;
  updated_at: string;
}

type TabType = 'overview' | 'schema';

interface Props {
  agentId: string;
  isPro: boolean;
  isPlus: boolean;
}

export function A2AAgentEditPage({ agentId, isPro, isPlus }: Props) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const [agent, setAgent] = useState<A2AAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Field editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Schema state
  const [inputSchema, setInputSchema] = useState('');
  const [outputSchema, setOutputSchema] = useState('');

  useEffect(() => {
    if (canAccessPro) {
      fetchAgent();
    }
  }, [agentId, canAccessPro]);

  const fetchAgent = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/agents/${agentId}`);
      if (!response.ok) throw new Error('Failed to fetch agent');
      const data = await response.json();
      setAgent(data.agent);
      // Fetch tool schema if tool_id exists
      if (data.agent.tool_id) {
        const toolRes = await fetch(`/api/tools/${data.agent.tool_id}`);
        if (toolRes.ok) {
          const toolData = await toolRes.json();
          setInputSchema(JSON.stringify(toolData.tool?.input_schema || {}, null, 2));
          setOutputSchema(JSON.stringify(toolData.tool?.output_schema || {}, null, 2));
        }
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
      const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
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
      const response = await fetch(`/api/agents/${agentId}/reimport`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to refresh');
      }
      const data = await response.json();
      setSuccess(data.message || 'Agent refreshed from source URL');
      setTimeout(() => setSuccess(null), 3000);
      fetchAgent();
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
    if (!agent) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (field === 'display_name') body.displayName = value;
      if (field === 'environment_name') body.environmentName = value;
      if (field === 'description') body.description = value;

      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      setAgent({ ...agent, [field]: value });
      setEditingField(null);
      setSuccess('Saved successfully');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveSchemas = async () => {
    if (!agent?.tool_id) return;
    setSaving(true);
    try {
      let parsedInput, parsedOutput;
      try { parsedInput = JSON.parse(inputSchema); } catch { throw new Error('Invalid input schema JSON'); }
      try { parsedOutput = JSON.parse(outputSchema); } catch { throw new Error('Invalid output schema JSON'); }

      const response = await fetch(`/api/tools/${agent.tool_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputSchema: parsedInput, outputSchema: parsedOutput }),
      });
      if (!response.ok) throw new Error('Failed to save schemas');
      setSuccess('Schemas saved');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'schema', label: 'Schema', icon: '📄' },
  ];

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          title="A2A Agent Editor - Pro Feature"
          featureName="A2A agent editing"
          showCloseButton={false}
        />
        <div style={{ maxWidth: '56rem', margin: '0 auto', filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 4rem)', fontWeight: 900, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              A2A AGENT EDITOR
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

  if (!agent) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 4vw, 2rem)' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', color: '#fff', textAlign: 'center', paddingTop: '4rem' }}>
          <h1>Agent not found</h1>
          <Link href="/dashboard/mcp-composer" style={{ color: '#f59e0b' }}>← Back to Creator</Link>
        </div>
      </div>
    );
  }

  // Render Overview Tab
  const renderOverviewTab = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Agent Information */}
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Agent Information</h3>

        {/* Display Name */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Display Name</label>
          {editingField === 'display_name' ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              <button onClick={() => saveField('display_name', editValue)} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
              <button onClick={cancelEdit} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#fff' }}>{agent.display_name}</span>
              <button onClick={() => startEdit('display_name', agent.display_name)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
            </div>
          )}
        </div>

        {/* Environment */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Environment</label>
          {editingField === 'environment_name' ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              <button onClick={() => saveField('environment_name', editValue)} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
              <button onClick={cancelEdit} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#fff' }}>{agent.environment_name}</span>
              <button onClick={() => startEdit('environment_name', agent.environment_name)} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
            </div>
          )}
        </div>

        {/* Description */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Description</label>
          {editingField === 'description' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={3} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => saveField('description', editValue)} disabled={saving} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
                <button onClick={cancelEdit} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <span style={{ color: '#fff', flex: 1 }}>{agent.description || '—'}</span>
              <button onClick={() => startEdit('description', agent.description || '')} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
            </div>
          )}
        </div>

        {/* A2A URL (endpoint) */}
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>A2A URL <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>(endpoint)</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: '#10b981', fontSize: '1rem' }}>🔗</span>
            <code style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{agent.agent_url}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(agent.agent_url);
                setSuccess('URL copied to clipboard');
                setTimeout(() => setSuccess(null), 2000);
              }}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              📋 Copy
            </button>
          </div>
        </div>

        {/* Import URL (if different from agent_url) */}
        {agent.import_url && agent.import_url !== agent.agent_url && (
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Import URL <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>(original)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: '#f59e0b', fontSize: '1rem' }}>📥</span>
              <code style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{agent.import_url}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(agent.import_url!);
                  setSuccess('URL copied to clipboard');
                  setTimeout(() => setSuccess(null), 2000);
                }}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                📋 Copy
              </button>
            </div>
          </div>
        )}

        {/* Read-only fields */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Agent Name</label>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: '0.85rem' }}>{agent.agent_name}</span>
          </div>
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Category</label>
            <span style={{ color: '#fff' }}>{agent.category}</span>
          </div>
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Version</label>
            <span style={{ color: '#fff' }}>{agent.version || '—'}</span>
          </div>
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Protocol Version</label>
            <span style={{ color: '#fff' }}>{agent.protocol_version || '—'}</span>
          </div>
        </div>

        {/* Tags */}
        {agent.tags && agent.tags.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Tags</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {agent.tags.map((tag) => (
                <span key={tag} style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.25rem 0.75rem', borderRadius: '50px', fontSize: '0.8rem' }}>{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🤖</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Type</div>
          <div style={{ color: '#fff', fontWeight: 600 }}>A2A Agent</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📅</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Created</div>
          <div style={{ color: '#fff', fontWeight: 600 }}>{new Date(agent.created_at).toLocaleDateString()}</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🔄</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Updated</div>
          <div style={{ color: '#fff', fontWeight: 600 }}>{new Date(agent.updated_at).toLocaleDateString()}</div>
        </div>
      </div>

      {/* Authentication */}
      <AuthenticationSection
        resourceId={agent.id}
        resourceType="agent"
        authType={agent.auth_type || 'none'}
        authConfig={agent.auth_config || {}}
        sourceUrl={agent.agent_url}
        onUpdate={fetchAgent}
        accentColor="#f59e0b"
      />

      {/* Default Headers */}
      <DefaultHeadersEditor
        agentId={agent.id}
        headers={agent.default_headers || {}}
        onUpdate={fetchAgent}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={handleRefresh} disabled={refreshing} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.7 : 1 }}>
          🔄 {refreshing ? 'Refreshing...' : 'Refresh from URL'}
        </button>
        <button onClick={() => setShowDeleteModal(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}>
          🗑️ Delete Agent
        </button>
      </div>
    </div>
  );

  // Render Schema Tab
  const renderSchemaTab = () => (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Input Schema</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>Define the JSON schema for input parameters sent to this agent.</p>
        <textarea
          value={inputSchema}
          onChange={(e) => setInputSchema(e.target.value)}
          rows={12}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
        />
      </div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Output Schema</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>Define the JSON schema for the expected response from this agent.</p>
        <textarea
          value={outputSchema}
          onChange={(e) => setOutputSchema(e.target.value)}
          rows={10}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button onClick={saveSchemas} disabled={saving || !agent.tool_id} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: saving ? 'rgba(245, 158, 11, 0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontWeight: 600, cursor: saving || !agent.tool_id ? 'not-allowed' : 'pointer', opacity: !agent.tool_id ? 0.5 : 1 }}>
          {saving ? 'Saving...' : 'Save Schemas'}
        </button>
      </div>
      {!agent.tool_id && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'right' }}>No tool linked to this agent yet.</p>}
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
            <FaviconImage iconUrl={agent.icon_url} baseUrl={agent.agent_url} alt={agent.display_name} size={32} borderRadius={6} fallbackEmoji="🤖" fallbackBgColor="rgba(245, 158, 11, 0.2)" />
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>{agent.display_name}</h1>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>A2A</span>
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
        <AdBanner slot={ADS_CONFIG.slots.agentImportTop} />
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 1rem) 0' }}>
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '0.6rem 0.75rem', background: activeTab === tab.id ? 'rgba(245, 158, 11, 0.2)' : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 2rem) 3rem' }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'schema' && renderSchemaTab()}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '2rem', maxWidth: '400px', width: '100%', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>Delete A2A Agent?</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem' }}>
              This will permanently delete <strong>{agent.display_name}</strong> and its associated tool. This action cannot be undone.
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

// DefaultHeadersEditor Component for A2A Agents
function DefaultHeadersEditor({ agentId, headers, onUpdate }: { agentId: string; headers: Record<string, string>; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [headersList, setHeadersList] = useState<Array<{ key: string; value: string }>>(
    Object.entries(headers).map(([key, value]) => ({ key, value }))
  );
  const [saving, setSaving] = useState(false);
  const [visibleHeaders, setVisibleHeaders] = useState<Set<number>>(new Set());
  const [visibleViewHeaders, setVisibleViewHeaders] = useState<Set<string>>(new Set());

  // Check if a header key is sensitive (should be hidden by default)
  const isSensitiveHeader = (key: string): boolean => {
    const lowerKey = key.toLowerCase();
    return lowerKey.includes('api-key') ||
           lowerKey.includes('apikey') ||
           lowerKey.includes('x-api-key') ||
           lowerKey.includes('authorization') ||
           lowerKey.includes('token') ||
           lowerKey.includes('secret') ||
           lowerKey.includes('password') ||
           lowerKey.includes('bearer') ||
           lowerKey.includes('auth');
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

      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultHeaders: headersObj }),
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
          <button onClick={() => setEditing(true)} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.8rem', cursor: 'pointer' }}>
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
        Headers sent with every request to this agent.
      </p>

      {editing ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {headersList.map((header, index) => {
            const isSensitive = isSensitiveHeader(header.key);
            const isVisible = visibleHeaders.has(index);
            return (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={header.key}
                  onChange={(e) => updateHeader(index, 'key', e.target.value)}
                  placeholder="Header name"
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                />
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>:</span>
                <div style={{ flex: 2, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={isSensitive && !isVisible ? 'password' : 'text'}
                    value={header.value}
                    onChange={(e) => updateHeader(index, 'value', e.target.value)}
                    placeholder="Value"
                    style={{ width: '100%', padding: '0.5rem', paddingRight: isSensitive ? '2.5rem' : '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                  />
                  {isSensitive && (
                    <button
                      type="button"
                      onClick={() => toggleHeaderVisibility(index)}
                      style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.25rem', fontSize: '0.9rem' }}
                      title={isVisible ? 'Hide value' : 'Show value'}
                    >
                      {isVisible ? '👁️' : '👁️‍🗨️'}
                    </button>
                  )}
                </div>
                <button onClick={() => removeHeader(index)} style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer' }}>✕</button>
              </div>
            );
          })}
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
              {Object.entries(headers).map(([key, value]) => {
                const isSensitive = isSensitiveHeader(key);
                const isVisible = visibleViewHeaders.has(key);
                return (
                  <div key={key} style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', alignItems: 'center' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{key}:</span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                      {isSensitive && !isVisible ? maskValue(value) : value}
                    </span>
                    {isSensitive && (
                      <button
                        type="button"
                        onClick={() => toggleViewHeaderVisibility(key)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.25rem', fontSize: '0.85rem' }}
                        title={isVisible ? 'Hide value' : 'Show value'}
                      >
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
