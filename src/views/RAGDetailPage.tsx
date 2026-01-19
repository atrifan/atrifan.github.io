'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
import { ADS_CONFIG } from '../config/ads.config';
import { getSuggestedFormat } from '../lib/upstash-vector';

// Host URL - uses NEXT_PUBLIC_HOST env var with fallback to production URL
const HOST_URL = process.env.NEXT_PUBLIC_HOST || 'https://tulzo.vercel.app';

interface RAGDetailPageProps {
  ragId: string;
  isPro: boolean;
  isPlus: boolean;
}

interface RAG {
  id: string;
  name: string;
  rag_name: string;
  description: string | null;
  server_description: string | null;
  source_url: string | null;
  source_type: 'csv' | 'url';
  icon: string;
  has_embeddings: boolean;
  embedding_model: string | null;
  embedding_dimensions: number;
  token_limit: number;
  top_n: number;
  document_count: number;
  total_tokens: number;
  chunk_count: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  environment_name: string;
  swagger_spec: Record<string, unknown> | null;
  tool_id: string | null;
  field_config?: {
    id_column: string;
    document_column: string;
    fields: FieldMapping[];
  };
}

interface Tool {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

interface Document {
  id: string;
  title: string | null;
  source_identifier: string | null;
  token_count: number;
  created_at: string;
}

interface FieldMapping {
  column: string;
  embed: boolean;
  metadata: boolean;
  format: string;
}

type TabType = 'overview' | 'data' | 'swagger';

export function RAGDetailPage({ ragId, isPro, isPlus }: RAGDetailPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rag, setRag] = useState<RAG | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Update Data modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [csvIdColumn, setCsvIdColumn] = useState('');
  const [csvContentColumn, setCsvContentColumn] = useState('');
  const [csvTitleColumn, setCsvTitleColumn] = useState('');
  const [csvFieldMappings, setCsvFieldMappings] = useState<FieldMapping[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    updated: number;
    deleted: number;
    vectorCount: number;
  } | null>(null);

  const fetchRag = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/rags/${ragId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.rag) {
          setRag(data.rag);
          setTool(data.tool || null);
          // Initialize field config from saved RAG if available
          if (data.rag.field_config) {
            setCsvIdColumn(data.rag.field_config.id_column || '');
            setCsvContentColumn(data.rag.field_config.document_column || '');
            setCsvFieldMappings(data.rag.field_config.fields || []);
          }
        } else {
          setError('RAG not found');
        }
      } else {
        setError('RAG not found');
      }
    } catch (err) {
      setError('Failed to fetch RAG');
    }
  }, [ragId]);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/rags/documents?ragId=${ragId}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  }, [ragId]);

  useEffect(() => {
    if (canAccessPro) {
      Promise.all([fetchRag(), fetchDocuments()]).finally(() => setLoading(false));
      // Fetch API key for endpoint display
      fetch('/api/keys/list')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.hasKey && data?.apiKey) {
            setApiKey(data.apiKey);
          }
        })
        .catch(() => {});
    }
  }, [canAccessPro, fetchRag, fetchDocuments]);

  // Parse CSV line handling quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        setUploadError('CSV must have header and at least one data row');
        return;
      }

      const headers = parseCSVLine(lines[0]);
      setCsvHeaders(headers);

      // Parse preview rows (first 3 data rows)
      const previewRows = lines.slice(1, 4).map(line => parseCSVLine(line));
      setCsvPreviewRows(previewRows);

      // Auto-detect columns from saved config or smart detection
      if (rag?.field_config) {
        setCsvIdColumn(rag.field_config.id_column);
        setCsvContentColumn(rag.field_config.document_column);
        setCsvFieldMappings(rag.field_config.fields);
      } else {
        // Smart detection
        const idCol = headers.find(h => /^(id|sku|code|product_id|item_id)$/i.test(h)) || headers[0];
        const contentCol = headers.find(h => /^(content|description|text|body|document)$/i.test(h)) || headers[1] || headers[0];
        const titleCol = headers.find(h => /^(title|name|heading|label)$/i.test(h)) || '';

        setCsvIdColumn(idCol);
        setCsvContentColumn(contentCol);
        setCsvTitleColumn(titleCol);

        // Initialize field mappings for other columns
        const otherCols = headers.filter(h => h !== idCol && h !== contentCol && h !== titleCol);
        setCsvFieldMappings(otherCols.map(col => ({
          column: col,
          embed: true,
          metadata: true,
          format: getSuggestedFormat(col),
        })));
      }
    } catch (err) {
      setUploadError('Failed to parse CSV file');
    }
  };

  // Handle update data upload
  const handleUpdateData = async () => {
    if (!csvFile || !csvIdColumn || !csvContentColumn) {
      setUploadError('Please select a file and configure ID and content columns');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('ragId', ragId);
      formData.append('ragName', rag?.rag_name || '');
      formData.append('idColumn', csvIdColumn);
      formData.append('contentColumn', csvContentColumn);
      formData.append('titleColumn', csvTitleColumn);
      formData.append('fieldMappings', JSON.stringify(csvFieldMappings));
      formData.append('hasEmbeddings', 'false');

      const response = await fetch('/api/ai/rags/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload documents');
      }

      const data = await response.json();
      setUploadSuccess(`Successfully updated data`);
      setUploadResult({
        inserted: data.inserted || 0,
        updated: data.updated || 0,
        deleted: data.deleted || 0,
        vectorCount: data.vectorCount || 0,
      });

      // Refresh data
      fetchDocuments();
      fetchRag();

      // Close modal after short delay
      setTimeout(() => {
        setShowUpdateModal(false);
        setCsvFile(null);
        setCsvHeaders([]);
        setCsvPreviewRows([]);
      }, 2000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Delete this document?')) return;

    try {
      await fetch(`/api/ai/rags/documents?id=${docId}`, { method: 'DELETE' });
      fetchDocuments();
      fetchRag();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleDeleteRag = async () => {
    setSaving(true);
    try {
      await fetch(`/api/ai/rags/${ragId}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err) {
      setError('Failed to delete RAG');
      setShowDeleteModal(false);
    } finally {
      setSaving(false);
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

  const saveField = async (field: string, value: string | number) => {
    if (!rag) return;
    setSaving(true);
    try {
      const body: Record<string, string | number> = {};
      if (field === 'name') body.name = value;
      if (field === 'description') body.description = value;
      if (field === 'icon') body.icon = value;
      if (field === 'top_n') body.topN = value;
      if (field === 'token_limit') body.tokenLimit = value;

      const response = await fetch(`/api/ai/rags/${ragId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      setRag({ ...rag, [field]: value });
      setEditingField(null);
      setSuccess('Saved successfully');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'data', label: 'Data', icon: '📊' },
    { id: 'swagger', label: 'API / Swagger', icon: '📄' },
  ];

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          onClose={() => router.push('/dashboard')}
          title="RAG Knowledge Base - Pro Feature"
          featureName="RAG Knowledge Base"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '2rem', height: '2rem', border: '2px solid #8b5cf6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error || !rag) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '1rem' }}>
            {error || 'RAG not found'}
          </h1>
          <Link href="/dashboard" style={{ color: '#8b5cf6' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Styles
  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const labelStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem',
  };

  const valueStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: '1rem',
  };

  // Compute endpoint URL
  const endpointUrl = rag.source_type === 'url' && rag.source_url
    ? rag.source_url
    : apiKey && rag.rag_name
      ? `${HOST_URL}/api/collection/${apiKey}/${rag.rag_name}`
      : null;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)' }}>
      {ADS_CONFIG.enabled && (
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
      )}

      {/* Header Bar - matches MCP server edit page */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '1rem clamp(1rem, 4vw, 2rem)', position: 'relative', zIndex: 101 }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>← Back</Link>
            <span style={{ fontSize: '2rem' }}>{rag.icon}</span>
            <h1 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>{rag.name}</h1>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', fontSize: '0.75rem', fontWeight: 600 }}>RAG</span>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: rag.source_type === 'csv' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: rag.source_type === 'csv' ? '#10b981' : '#3b82f6', fontSize: '0.75rem', fontWeight: 600 }}>{rag.source_type === 'csv' ? 'CSV' : 'URL'}</span>
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

      {/* Endpoint URL Bar */}
      {endpointUrl && (
        <div style={{ maxWidth: '56rem', margin: '1rem auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', flexShrink: 0 }}>
              {rag.source_type === 'url' ? '🌐 Source:' : '🔗 Endpoint:'}
            </span>
            <code style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#10b981',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {endpointUrl}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(endpointUrl);
                setCopiedEndpoint(true);
                setTimeout(() => setCopiedEndpoint(false), 2000);
              }}
              style={{
                background: copiedEndpoint ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '0.5rem 0.75rem',
                color: copiedEndpoint ? '#10b981' : 'rgba(255,255,255,0.7)',
                fontSize: '0.8rem',
                flexShrink: 0,
              }}
              title="Copy endpoint"
            >
              {copiedEndpoint ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Tool Info */}
      {tool && (
        <div style={{ maxWidth: '56rem', margin: '1rem auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
            <span style={{ fontSize: '1.25rem' }}>🔧</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600 }}>MCP Tool</div>
              <div style={{ color: '#a78bfa', fontSize: '0.9rem', fontFamily: 'monospace' }}>{tool.name}</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Available in your MCP server</div>
          </div>
        </div>
      )}

      {/* Top Ad */}
      <div style={{ maxWidth: '56rem', margin: '1rem auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
        <AdBanner slot={ADS_CONFIG.slots.toolTop} format="horizontal" />
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1.5rem clamp(1rem, 4vw, 2rem) 3rem' }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{rag.document_count || 0}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Documents</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{(rag.chunk_count || 0).toLocaleString()}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Vectors</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{(rag.total_tokens || 0).toLocaleString()}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Total Tokens</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{rag.top_n || 5}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Top N Results</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.5rem 1rem',
                  background: activeTab === tab.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  border: activeTab === tab.id ? '1px solid #8b5cf6' : '1px solid transparent',
                  borderRadius: '8px',
                  color: activeTab === tab.id ? '#8b5cf6' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1.5rem' }}>Configuration</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Display Name - Editable */}
                <div>
                  <div style={labelStyle}>Display Name</div>
                  {editingField === 'name' ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff' }}
                      />
                      <button onClick={() => saveField('name', editValue)} disabled={saving} style={{ padding: '0.5rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>✓</button>
                      <button onClick={cancelEdit} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ ...valueStyle, cursor: 'pointer' }} onClick={() => startEdit('name', rag.name)}>
                      {rag.name} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>✏️</span>
                    </div>
                  )}
                </div>

                {/* RAG Name (API identifier - read-only) */}
                <div>
                  <div style={labelStyle}>API Identifier</div>
                  <div style={{ ...valueStyle, fontFamily: 'monospace', color: '#8b5cf6' }}>{rag.rag_name}</div>
                </div>

                {/* Description */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={labelStyle}>Description</div>
                  {editingField === 'description' ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={2}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', resize: 'vertical' }}
                      />
                      <button onClick={() => saveField('description', editValue)} disabled={saving} style={{ padding: '0.5rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>✓</button>
                      <button onClick={cancelEdit} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ ...valueStyle, cursor: 'pointer' }} onClick={() => startEdit('description', rag.description || '')}>
                      {rag.description || <span style={{ color: 'rgba(255,255,255,0.4)' }}>No description</span>} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>✏️</span>
                    </div>
                  )}
                </div>

                {/* Top N */}
                <div>
                  <div style={labelStyle}>Top N Results</div>
                  {editingField === 'top_n' ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        min={1}
                        max={20}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff' }}
                      />
                      <button onClick={() => saveField('top_n', parseInt(editValue))} disabled={saving} style={{ padding: '0.5rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>✓</button>
                      <button onClick={cancelEdit} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ ...valueStyle, cursor: 'pointer' }} onClick={() => startEdit('top_n', String(rag.top_n || 5))}>
                      {rag.top_n || 5} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>✏️</span>
                    </div>
                  )}
                </div>

                {/* Source Type */}
                <div>
                  <div style={labelStyle}>Source Type</div>
                  <div style={valueStyle}>{rag.source_type === 'csv' ? '📄 CSV Upload' : '🌐 Remote URL'}</div>
                </div>

                {/* Environment */}
                <div>
                  <div style={labelStyle}>Environment</div>
                  <div style={valueStyle}>{rag.environment_name || 'default'}</div>
                </div>

                {/* Created */}
                <div>
                  <div style={labelStyle}>Created</div>
                  <div style={valueStyle}>{new Date(rag.created_at).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Field Config */}
              {rag.field_config && (
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <h4 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>Field Configuration</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div style={labelStyle}>ID Column</div>
                      <div style={{ ...valueStyle, fontFamily: 'monospace' }}>{rag.field_config.id_column}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Document Column</div>
                      <div style={{ ...valueStyle, fontFamily: 'monospace' }}>{rag.field_config.document_column}</div>
                    </div>
                  </div>
                  {rag.field_config.fields && rag.field_config.fields.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={labelStyle}>Additional Fields</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {rag.field_config.fields.map((f) => (
                          <span key={f.column} style={{ padding: '0.25rem 0.5rem', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '4px', fontSize: '0.8rem', color: '#a78bfa' }}>
                            {f.column} {f.embed && '📝'} {f.metadata && '🏷️'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delete Button - at bottom of overview */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button onClick={() => setShowDeleteModal(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}>
                  Delete Knowledge Base
                </button>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div style={cardStyle}>
              {/* Update Data Button (CSV sources only) */}
              {rag.source_type === 'csv' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <h3 style={{ color: '#fff', fontSize: '1rem', margin: 0 }}>Update Data</h3>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                      Upload a new CSV to update your knowledge base
                    </p>
                  </div>
                  <button
                    onClick={() => setShowUpdateModal(true)}
                    style={{ padding: '0.5rem 1rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    📤 Update Data
                  </button>
                </div>
              )}

              <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>
                Documents ({documents.length})
              </h3>

              {documents.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.5)' }}>No documents yet. Upload some data above.</p>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '0.5rem' }}
                    >
                      <div>
                        <div style={{ color: '#fff', fontWeight: 500 }}>
                          {doc.title || doc.source_identifier || 'Untitled'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                          {doc.token_count} tokens
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        style={{ padding: '0.25rem 0.5rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Swagger Tab */}
          {activeTab === 'swagger' && (
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem' }}>API Endpoint</h3>

              {tool ? (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={labelStyle}>Tool Name</div>
                    <div style={{ ...valueStyle, fontFamily: 'monospace', color: '#8b5cf6' }}>{tool.name}</div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={labelStyle}>Endpoint URL</div>
                    <code style={{ display: 'block', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: '#10b981', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                      GET /api/collection/YOUR_API_KEY/{rag.rag_name}?q=your+query
                    </code>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={labelStyle}>cURL Example</div>
                    <pre style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{`curl "${HOST_URL}/api/collection/YOUR_API_KEY/${rag.rag_name}?q=search+query&top_k=${rag.top_n || 5}"`}
                    </pre>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={labelStyle}>Input Schema</div>
                    <pre style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', overflow: 'auto', maxHeight: '200px' }}>
                      {JSON.stringify(tool.input_schema, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div style={labelStyle}>Output Schema</div>
                    <pre style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', overflow: 'auto', maxHeight: '200px' }}>
                      {JSON.stringify(tool.output_schema, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.5)' }}>No tool generated for this RAG yet.</p>
              )}

              {rag.swagger_spec && (
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={labelStyle}>Full Swagger Spec</div>
                  <pre style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '0.7rem', overflow: 'auto', maxHeight: '300px' }}>
                    {JSON.stringify(rag.swagger_spec, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

        {/* Footer Ad */}
        <div style={{ marginTop: '2rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.toolBottom} format="horizontal" />
        </div>
      </div>
      <Footer />

      {/* Update Data Modal */}
      {showUpdateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#fff', fontSize: '1.25rem', margin: 0 }}>Update Data</h2>
              <button
                onClick={() => {
                  setShowUpdateModal(false);
                  setCsvFile(null);
                  setCsvHeaders([]);
                  setCsvPreviewRows([]);
                  setUploadError(null);
                  setUploadSuccess(null);
                  setUploadResult(null);
                }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* File Upload */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Select CSV File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: 'block', width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }}
                />
                {csvFile && (
                  <p style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>
                    Selected: {csvFile.name} ({csvPreviewRows.length > 0 ? `${csvPreviewRows.length}+ rows` : 'parsing...'})
                  </p>
                )}
              </div>

              {/* Column Configuration */}
              {csvHeaders.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        ID Column *
                      </label>
                      <select
                        value={csvIdColumn}
                        onChange={(e) => setCsvIdColumn(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="">Select...</option>
                        {csvHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        Content Column *
                      </label>
                      <select
                        value={csvContentColumn}
                        onChange={(e) => setCsvContentColumn(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="">Select...</option>
                        {csvHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        Title Column
                      </label>
                      <select
                        value={csvTitleColumn}
                        onChange={(e) => setCsvTitleColumn(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="">None</option>
                        {csvHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Field Mappings */}
                  {csvFieldMappings.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        Additional Fields
                      </label>
                      <div style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                        {csvFieldMappings.map((field, idx) => (
                          <div key={field.column} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 500, color: '#fff', minWidth: '120px' }}>{field.column}</span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                              <input
                                type="checkbox"
                                checked={field.embed}
                                onChange={(e) => {
                                  const updated = [...csvFieldMappings];
                                  updated[idx] = { ...field, embed: e.target.checked };
                                  setCsvFieldMappings(updated);
                                }}
                              />
                              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Embed</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                              <input
                                type="checkbox"
                                checked={field.metadata}
                                onChange={(e) => {
                                  const updated = [...csvFieldMappings];
                                  updated[idx] = { ...field, metadata: e.target.checked };
                                  setCsvFieldMappings(updated);
                                }}
                              />
                              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Metadata</span>
                            </label>
                            <input
                              type="text"
                              value={field.format}
                              onChange={(e) => {
                                const updated = [...csvFieldMappings];
                                updated[idx] = { ...field, format: e.target.value };
                                setCsvFieldMappings(updated);
                              }}
                              placeholder="Format: {value}"
                              style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview */}
                  {csvPreviewRows.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        Preview (first 3 rows)
                      </label>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ minWidth: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(139, 92, 246, 0.2)' }}>
                              {csvHeaders.map(h => (
                                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#a78bfa', fontWeight: 500 }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreviewRows.map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                {row.map((cell, cellIdx) => (
                                  <td key={cellIdx} style={{ padding: '0.5rem 0.75rem', color: '#fff', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Error/Success Messages */}
              {uploadError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '0.875rem' }}>
                  {uploadError}
                </div>
              )}
              {uploadSuccess && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', borderRadius: '8px', color: '#10b981', fontSize: '0.875rem' }}>
                  {uploadSuccess}
                  {uploadResult && (
                    <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                      <div>Inserted: {uploadResult.inserted}</div>
                      <div>Updated: {uploadResult.updated}</div>
                      <div>Deleted: {uploadResult.deleted}</div>
                      <div>Vectors: {uploadResult.vectorCount}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  onClick={() => {
                    setShowUpdateModal(false);
                    setCsvFile(null);
                    setCsvHeaders([]);
                    setCsvPreviewRows([]);
                    setUploadError(null);
                    setUploadSuccess(null);
                    setUploadResult(null);
                  }}
                  style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateData}
                  disabled={isUploading || !csvFile || !csvIdColumn || !csvContentColumn}
                  style={{ padding: '0.5rem 1rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', opacity: (isUploading || !csvFile || !csvIdColumn || !csvContentColumn) ? 0.5 : 1 }}
                >
                  {isUploading ? 'Uploading...' : 'Update Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', maxWidth: '400px', width: '100%' }}>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>Delete Knowledge Base?</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>
              This will permanently delete <strong style={{ color: '#ef4444' }}>{rag.name}</strong> and all its documents. The associated tool will also be removed. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRag}
                disabled={saving}
                style={{ padding: '0.5rem 1rem', background: '#ef4444', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
