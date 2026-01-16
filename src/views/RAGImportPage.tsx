'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { AdBanner } from '../components/AdBanner';
import { Footer } from '../components/Footer';
import { AuthenticationCard, AuthType, OAuth2Config, defaultOAuth2Config } from '../components/AuthenticationCard';
import { CustomHeadersCard, CustomHeader } from '../components/CustomHeadersCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { ADS_CONFIG } from '../config/ads.config';
import {
  EMBEDDING_MODELS,
  getEmbeddingModelsForTier,
  formatCurrency,
  LOCAL_EMBEDDING_MODEL,
} from '../config/ai-tokens.config';

interface RAGImportPageProps {
  isPro: boolean;
  isPlus: boolean;
}

type Step = 'name' | 'source' | 'config' | 'saving';
type SourceType = 'csv' | 'url';

// Normalize name helper (consistent with other imports)
const normalizeName = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
};

// Host URL for generating collection URLs
const HOST_URL = process.env.NEXT_PUBLIC_HOST || 'https://tulzo.vercel.app';

export function RAGImportPage({ isPro, isPlus }: RAGImportPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get user's tier
  const userTier = isPlus ? 'plus' : isPro ? 'pro' : 'free';

  // Get available embedding models for user's tier
  const availableEmbeddingModels = useMemo(() => {
    return getEmbeddingModelsForTier(userTier);
  }, [userTier]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('name');

  // Basic info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📚');

  // Source selection
  const [sourceType, setSourceType] = useState<SourceType>('csv');

  // CSV import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvHasEmbeddings, setCsvHasEmbeddings] = useState(false);
  const [csvEmbeddingColumn, setCsvEmbeddingColumn] = useState('');
  const [csvContentColumn, setCsvContentColumn] = useState('');
  const [csvTitleColumn, setCsvTitleColumn] = useState('');
  const [csvColumns, setCsvColumns] = useState<string[]>([]);

  // Remote URL import
  const [remoteUrl, setRemoteUrl] = useState('');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [apiKey, setApiKey] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [basicCredentials, setBasicCredentials] = useState('');
  const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showBasicCredentials, setShowBasicCredentials] = useState(false);
  const [urlNeedsEmbeddings, setUrlNeedsEmbeddings] = useState(true);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [oauth2Config, setOAuth2Config] = useState<OAuth2Config>(defaultOAuth2Config);
  const [showClientSecret, setShowClientSecret] = useState(false);

  // URL RAG request configuration
  const [urlHttpMethod, setUrlHttpMethod] = useState<'GET' | 'POST'>('POST');
  const [urlParamsLocation, setUrlParamsLocation] = useState<'query' | 'body'>('body');
  const [urlContentType, setUrlContentType] = useState<'application/json' | 'application/x-www-form-urlencoded'>('application/json');

  // Field mapping for URL RAG (empty = use default field name)
  const [fieldMapping, setFieldMapping] = useState<{
    query: string;
    embedding: string;
    top_n: string;
    chunk_count: string;
    dimensions: string;
    model: string;
  }>({
    query: '',
    embedding: '',
    top_n: '',
    chunk_count: '',
    dimensions: '',
    model: '',
  });

  // Test state
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; data?: unknown; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Embedding config - default to local model (available to all tiers)
  const [embeddingModel, setEmbeddingModel] = useState(LOCAL_EMBEDDING_MODEL.id);
  const [tokenLimit, setTokenLimit] = useState(8000);
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topN, setTopN] = useState(5); // Number of top results to retrieve
  const [contentType, setContentType] = useState<'text' | 'code' | 'mixed'>('text');
  const [serverDescription, setServerDescription] = useState(''); // Description shown to API consumers

  // Get current model's dimensions
  const currentModelDimensions = useMemo(() => {
    const model = availableEmbeddingModels.find(m => m.id === embeddingModel);
    return model?.dimensions || 384;
  }, [embeddingModel, availableEmbeddingModels]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Fetch user's API key for pre-filling auth fields
  useEffect(() => {
    const fetchUserApiKey = async () => {
      try {
        const response = await fetch('/api/keys/list');
        if (response.ok) {
          const data = await response.json();
          if (data.hasKey && data.apiKey) {
            setUserApiKey(data.apiKey);
          }
        }
      } catch (err) {
        console.error('Error fetching user API key:', err);
      }
    };
    fetchUserApiKey();
  }, []);

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    padding: 'clamp(1rem, 3vw, 2rem)',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '16px',
    padding: '1.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    marginBottom: '1rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '0.9rem',
  };

  // Select style with proper arrow positioning
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' fill-opacity='0.6' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
    paddingRight: '2.5rem',
    cursor: 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.85rem',
    marginBottom: '0.5rem',
    fontWeight: 500,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
  };

  // CSV parsing
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setError(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const parsed = lines.slice(0, 6).map(line => {
        // Simple CSV parsing (handles basic cases)
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      });

      if (parsed.length > 0) {
        setCsvColumns(parsed[0]);
        setCsvPreview(parsed);
        // Auto-detect embedding column
        const embCol = parsed[0].find(c => c.toLowerCase().includes('embed'));
        if (embCol) {
          setCsvHasEmbeddings(true);
          setCsvEmbeddingColumn(embCol);
        }
        // Auto-detect content column
        const contentCol = parsed[0].find(c =>
          c.toLowerCase().includes('content') ||
          c.toLowerCase().includes('text') ||
          c.toLowerCase().includes('body')
        );
        if (contentCol) setCsvContentColumn(contentCol);
        // Auto-detect title column
        const titleCol = parsed[0].find(c =>
          c.toLowerCase().includes('title') ||
          c.toLowerCase().includes('name')
        );
        if (titleCol) setCsvTitleColumn(titleCol);
      }
    } catch {
      setError('Failed to parse CSV file');
    }
  };

  // Navigation
  const handleNext = () => {
    setError(null);
    switch (currentStep) {
      case 'name':
        if (!name.trim()) {
          setError('Name is required');
          return;
        }
        setCurrentStep('source');
        break;
      case 'source':
        if (sourceType === 'csv' && !csvFile) {
          setError('Please select a CSV file');
          return;
        }
        if (sourceType === 'csv' && !csvContentColumn) {
          setError('Please select the content column');
          return;
        }
        if (sourceType === 'url' && !remoteUrl.trim()) {
          setError('Please enter a URL');
          return;
        }
        setCurrentStep('config');
        break;
      case 'config':
        handleSave();
        break;
    }
  };

  const handleBack = () => {
    setError(null);
    switch (currentStep) {
      case 'source':
        setCurrentStep('name');
        break;
      case 'config':
        setCurrentStep('source');
        break;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setCurrentStep('saving');

    try {
      // Build auth config
      const authConfig: Record<string, string> = {};
      if (authType === 'api_key' && apiKey) authConfig.apiKey = apiKey;
      if (authType === 'bearer' && bearerToken) authConfig.bearerToken = bearerToken;
      if (authType === 'basic' && basicCredentials) authConfig.basicCredentials = basicCredentials;

      const headersObj = customHeaders.reduce((acc, h) => {
        if (h.key.trim() && h.value.trim()) acc[h.key] = h.value;
        return acc;
      }, {} as Record<string, string>);

      // Determine stored auth type
      let storedAuthType: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2' = 'none';
      if (sourceType === 'url') {
        if (authType === 'oauth2' && oauth2Config.enabled) {
          storedAuthType = 'oauth2';
        } else if (apiKey.trim()) {
          storedAuthType = 'api_key';
        } else if (bearerToken.trim()) {
          storedAuthType = 'bearer';
        } else if (basicCredentials.trim()) {
          storedAuthType = 'basic';
        }
      }

      // Determine if embeddings will be generated (only for URL source)
      const needsEmbeddings = sourceType === 'url' && urlNeedsEmbeddings;

      // Build request body
      // For CSV: Upstash generates embeddings, so has_embeddings=false, model=upstash model, auth=none
      // For URL: User configures embedding model and auth
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: Record<string, any> = {
        name: name.trim(),
        ragName: normalizeName(name.trim()), // Normalized internal name for API endpoint
        description: description.trim() || null,
        icon,
        sourceUrl: sourceType === 'url' ? remoteUrl : null,
        sourceType,
        // CSV uses path-based auth (api_key in URL), URL uses configured auth
        authType: sourceType === 'csv' ? 'none' : storedAuthType,
        authConfig: sourceType === 'url' ? authConfig : {},
        customHeaders: sourceType === 'url' ? headersObj : {},
        // CSV: Upstash generates embeddings, so has_embeddings=false
        hasEmbeddings: sourceType === 'csv' ? false : !urlNeedsEmbeddings,
        // CSV: Use Upstash model name for consistency
        embeddingModel: sourceType === 'csv' ? 'upstash-bge-base-en-v1.5' : (needsEmbeddings ? embeddingModel : null),
        embeddingDimensions: sourceType === 'csv' ? 768 : (needsEmbeddings ? currentModelDimensions : null),
        contentType,
        tokenLimit,
        chunkSize,
        chunkOverlap,
        topN,
        serverDescription: sourceType === 'csv' ? serverDescription.trim() || null : null,
        // URL RAG request configuration
        ...(sourceType === 'url' ? {
          httpMethod: urlHttpMethod,
          paramsLocation: urlParamsLocation,
          requestContentType: urlContentType,
          fieldMapping: {
            query: fieldMapping.query || 'query',
            embedding: fieldMapping.embedding || 'embedding',
            top_n: fieldMapping.top_n || 'top_n',
            dimensions: fieldMapping.dimensions || 'dimensions',
            model: fieldMapping.model || 'model',
          },
        } : {}),
      };

      // Add OAuth2 config if applicable
      if (storedAuthType === 'oauth2') {
        requestBody.oauth2Config = {
          authorizationEndpoint: oauth2Config.authorizationEndpoint,
          tokenEndpoint: oauth2Config.tokenEndpoint,
          scopes: oauth2Config.scopes,
          useDcr: oauth2Config.useDcr,
          clientId: oauth2Config.clientId,
          clientSecret: oauth2Config.clientSecret,
          registrationEndpoint: oauth2Config.registrationEndpoint,
        };
      }

      // Create RAG
      const response = await fetch('/api/ai/rags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create RAG');
      }

      const data = await response.json();
      const ragId = data.rag.id;

      // If CSV, upload documents
      if (sourceType === 'csv' && csvFile) {
        const formData = new FormData();
        formData.append('file', csvFile);
        formData.append('ragId', ragId);
        formData.append('contentColumn', csvContentColumn);
        formData.append('titleColumn', csvTitleColumn || '');
        formData.append('hasEmbeddings', String(csvHasEmbeddings));
        formData.append('embeddingColumn', csvEmbeddingColumn || '');
        formData.append('embeddingModel', !csvHasEmbeddings ? embeddingModel : '');

        const uploadResponse = await fetch('/api/ai/rags/documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          throw new Error(uploadData.error || 'Failed to upload documents');
        }
      }

      router.push(`/dashboard/rag/${ragId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create RAG');
      setCurrentStep('config');
    } finally {
      setIsSaving(false);
    }
  };

  // Step indicator
  const renderStepIndicator = () => {
    const steps = [
      { key: 'name', label: '1. Name' },
      { key: 'source', label: '2. Source' },
      { key: 'config', label: '3. Config' },
    ];
    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {steps.map((step, index) => (
          <div
            key={step.key}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              background: index <= currentIndex ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: index === currentIndex ? 700 : 400,
              opacity: index <= currentIndex ? 1 : 0.5,
            }}
          >
            {step.label}
          </div>
        ))}
      </div>
    );
  };

  // RAG import is now available for all tiers (free users can use it with external agents)

  // Render steps
  const renderNameStep = () => {
    const normalizedName = normalizeName(name);

    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>📝 Knowledge Base Name</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Give your knowledge base a name and description.
        </p>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <div>
            <label style={labelStyle}>Icon</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ ...inputStyle, width: '60px', textAlign: 'center', fontSize: '1.5rem', padding: '0.5rem' }}
              maxLength={2}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={labelStyle}>Display Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Knowledge Base"
              style={inputStyle}
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />
          </div>
        </div>

        {/* Normalized name display */}
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '1rem' }}>
          Internal name: <code style={{ color: '#10b981' }}>{normalizedName || '...'}</code>
        </p>

        {/* Collection URL preview */}
        {normalizedName && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem',
            marginBottom: '1rem',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', margin: '0 0 0.35rem' }}>
              📡 Collection API Endpoint (after import):
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <code style={{
                color: '#10b981',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                flex: 1,
              }}>
                {HOST_URL}/api/collection/{userApiKey || '{your_api_key}'}/{normalizedName}
              </code>
              {userApiKey && (
                <button
                  onClick={() => navigator.clipboard.writeText(`${HOST_URL}/api/collection/${userApiKey}/${normalizedName}`)}
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    color: '#10b981',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📋 Copy
                </button>
              )}
            </div>
            {!userApiKey && (
              <p style={{ color: '#f59e0b', fontSize: '0.7rem', margin: '0.5rem 0 0' }}>
                ⚠️ Generate an API key in the dashboard to use this endpoint.
              </p>
            )}
          </div>
        )}

        <div>
          <label style={labelStyle}>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this knowledge base contains..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>
    );
  };

  const renderSourceStep = () => (
    <div style={cardStyle}>
      <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>📥 Import Source</h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Choose how to import your data.
      </p>

      {/* Source Type Selector */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setSourceType('csv')}
          style={{
            flex: 1,
            padding: '1rem',
            borderRadius: '12px',
            border: sourceType === 'csv' ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.2)',
            background: sourceType === 'csv' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
            color: '#fff',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📄</span>
          <span style={{ fontWeight: 600 }}>Import CSV</span>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
            Upload a CSV file with your documents
          </p>
        </button>
        <button
          onClick={() => setSourceType('url')}
          style={{
            flex: 1,
            padding: '1rem',
            borderRadius: '12px',
            border: sourceType === 'url' ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.2)',
            background: sourceType === 'url' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
            color: '#fff',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🌐</span>
          <span style={{ fontWeight: 600 }}>Remote URL</span>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
            Fetch data from an API endpoint
          </p>
        </button>
      </div>

      {/* CSV Import */}
      {sourceType === 'csv' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem' }}>
          {/* Upstash Vector Storage Info */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem',
            marginBottom: '1rem',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', margin: 0 }}>
              <span style={{ color: '#60a5fa', fontWeight: 600 }}>💾 Upstash Vector Storage:</span>{' '}
              Embeddings will be stored with your <code style={{ color: '#10b981' }}>api_key</code> and{' '}
              <code style={{ color: '#10b981' }}>rag_name</code> ({normalizeName(name) || '...'}) for isolated collection search.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '2rem',
              borderRadius: '8px',
              border: '2px dashed rgba(139, 92, 246, 0.5)',
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#a78bfa',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {csvFile ? `📄 ${csvFile.name}` : '📤 Click to select CSV file'}
          </button>

          {csvPreview.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Preview (first 5 rows):
              </p>
              <div style={{ overflowX: 'auto', fontSize: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {csvColumns.map((col, i) => (
                        <th key={i} style={{ padding: '0.5rem', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(1).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} style={{ padding: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Column mapping */}
              <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div>
                  <label style={labelStyle}>Content Column *</label>
                  <select value={csvContentColumn} onChange={(e) => setCsvContentColumn(e.target.value)} style={selectStyle}>
                    <option value="">Select column...</option>
                    {csvColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Title Column (optional)</label>
                  <select value={csvTitleColumn} onChange={(e) => setCsvTitleColumn(e.target.value)} style={selectStyle}>
                    <option value="">None</option>
                    {csvColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
              </div>

              {/* Embeddings */}
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={csvHasEmbeddings}
                    onChange={(e) => setCsvHasEmbeddings(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  CSV already contains embeddings
                </label>
                {csvHasEmbeddings && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={labelStyle}>Embedding Column</label>
                    <select value={csvEmbeddingColumn} onChange={(e) => setCsvEmbeddingColumn(e.target.value)} style={selectStyle}>
                      <option value="">Select column...</option>
                      {csvColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Remote URL Import */}
      {sourceType === 'url' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>API Endpoint URL *</label>
            <input
              type="url"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://api.example.com/documents"
              style={inputStyle}
            />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              The API should return JSON with document data
            </p>
          </div>

          {/* Authentication */}
          <AuthenticationCard
            authType={authType}
            onAuthTypeChange={setAuthType}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            showApiKey={showApiKey}
            onShowApiKeyToggle={() => setShowApiKey(!showApiKey)}
            userApiKey={userApiKey}
            onUseMyApiKey={() => userApiKey && setApiKey(userApiKey)}
            bearerToken={bearerToken}
            onBearerTokenChange={setBearerToken}
            showBearerToken={showBearerToken}
            onShowBearerTokenToggle={() => setShowBearerToken(!showBearerToken)}
            basicCredentials={basicCredentials}
            onBasicCredentialsChange={setBasicCredentials}
            showBasicCredentials={showBasicCredentials}
            onShowBasicCredentialsToggle={() => setShowBasicCredentials(!showBasicCredentials)}
            oauth2Config={oauth2Config}
            onOAuth2ConfigChange={setOAuth2Config}
            showClientSecret={showClientSecret}
            onShowClientSecretToggle={() => setShowClientSecret(!showClientSecret)}
            domainForCheck={remoteUrl}
            description="If your API requires authentication, configure it below."
            inputStyle={inputStyle}
          />

          {/* Custom Headers */}
          <CustomHeadersCard
            headers={customHeaders}
            onHeadersChange={setCustomHeaders}
            inputStyle={inputStyle}
          />

          {/* Embeddings option */}
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={urlNeedsEmbeddings}
                onChange={(e) => setUrlNeedsEmbeddings(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              Generate embeddings for query searches
            </label>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.25rem', marginLeft: '26px' }}>
              Enable this to generate embeddings and send to RAG server for semantic search
            </p>
          </div>

          {/* Request Configuration */}
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
            <h4 style={{ color: '#60a5fa', fontSize: '0.9rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔧 Request Configuration
            </h4>

            {/* HTTP Method & Params Location */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>HTTP Method</label>
                <select value={urlHttpMethod} onChange={(e) => setUrlHttpMethod(e.target.value as 'GET' | 'POST')} style={selectStyle}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Parameters In</label>
                <select value={urlParamsLocation} onChange={(e) => setUrlParamsLocation(e.target.value as 'query' | 'body')} style={selectStyle}>
                  <option value="body">Request Body</option>
                  <option value="query">Query String</option>
                </select>
              </div>
              {urlParamsLocation === 'body' && (
                <div>
                  <label style={labelStyle}>Content-Type</label>
                  <select value={urlContentType} onChange={(e) => setUrlContentType(e.target.value as 'application/json' | 'application/x-www-form-urlencoded')} style={selectStyle}>
                    <option value="application/json">application/json</option>
                    <option value="application/x-www-form-urlencoded">form-urlencoded</option>
                  </select>
                </div>
              )}
            </div>

            {/* Field Mapping */}
            <div style={{ marginTop: '1rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.5rem', display: 'block' }}>
                📝 Field Mapping <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>(leave empty for defaults)</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '80px' }}>query →</span>
                  <input
                    type="text"
                    value={fieldMapping.query}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, query: e.target.value })}
                    placeholder="query"
                    style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                  />
                </div>
                {urlNeedsEmbeddings && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '80px' }}>embedding →</span>
                    <input
                      type="text"
                      value={fieldMapping.embedding}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, embedding: e.target.value })}
                      placeholder="embedding"
                      style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '80px' }}>top_n →</span>
                  <input
                    type="text"
                    value={fieldMapping.top_n}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, top_n: e.target.value })}
                    placeholder="top_n"
                    style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                  />
                </div>
                {urlNeedsEmbeddings && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '80px' }}>dimensions →</span>
                    <input
                      type="text"
                      value={fieldMapping.dimensions}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, dimensions: e.target.value })}
                      placeholder="dimensions"
                      style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                    />
                  </div>
                )}
                {urlNeedsEmbeddings && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', width: '80px' }}>model →</span>
                    <input
                      type="text"
                      value={fieldMapping.model}
                      onChange={(e) => setFieldMapping({ ...fieldMapping, model: e.target.value })}
                      placeholder="model"
                      style={{ ...inputStyle, flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Preview what will be sent */}
            <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem' }}>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', margin: '0 0 0.5rem' }}>Preview (what will be sent):</p>
              <pre style={{ color: '#10b981', fontSize: '0.7rem', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{urlHttpMethod} {remoteUrl || 'https://api.example.com/search'}{urlParamsLocation === 'query' ? '?' + new URLSearchParams({
  [fieldMapping.query || 'query']: '{user_query}',
  [fieldMapping.top_n || 'top_n']: String(topN),
  ...(urlNeedsEmbeddings ? { [fieldMapping.embedding || 'embedding']: '[...]' } : {}),
}).toString() : ''}
{urlParamsLocation === 'body' ? `
Content-Type: ${urlContentType}

${urlContentType === 'application/json' ? JSON.stringify({
  [fieldMapping.query || 'query']: '{user_query}',
  [fieldMapping.top_n || 'top_n']: topN,
  ...(urlNeedsEmbeddings ? {
    [fieldMapping.embedding || 'embedding']: '[...]',
    [fieldMapping.dimensions || 'dimensions']: currentModelDimensions,
    [fieldMapping.model || 'model']: embeddingModel,
  } : {}),
}, null, 2) : new URLSearchParams({
  [fieldMapping.query || 'query']: '{user_query}',
  [fieldMapping.top_n || 'top_n']: String(topN),
}).toString()}` : ''}
              </pre>
            </div>

            {/* Test Section */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(59, 130, 246, 0.3)', paddingTop: '1rem' }}>
              <h4 style={{ color: '#f59e0b', fontSize: '0.85rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🧪 Test Connection
              </h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="Enter a test query..."
                  style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
                />
                <button
                  onClick={async () => {
                    if (!testQuery.trim() || !remoteUrl.trim()) return;
                    setIsTesting(true);
                    setTestResult(null);
                    try {
                      const response = await fetch('/api/ai/rags/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          url: remoteUrl,
                          method: urlHttpMethod,
                          paramsLocation: urlParamsLocation,
                          contentType: urlContentType,
                          authType,
                          authConfig: {
                            apiKey,
                            bearerToken,
                            basicCredentials,
                          },
                          oauth2Config: authType === 'oauth2' ? oauth2Config : null,
                          customHeaders: customHeaders.reduce((acc, h) => {
                            if (h.key.trim() && h.value.trim()) acc[h.key] = h.value;
                            return acc;
                          }, {} as Record<string, string>),
                          fieldMapping,
                          query: testQuery,
                          topN,
                          generateEmbedding: urlNeedsEmbeddings,
                          embeddingModel: urlNeedsEmbeddings ? embeddingModel : null,
                          dimensions: urlNeedsEmbeddings ? currentModelDimensions : null,
                        }),
                      });
                      const data = await response.json();
                      setTestResult(response.ok ? { success: true, data } : { success: false, error: data.error || 'Request failed' });
                    } catch (err) {
                      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
                    } finally {
                      setIsTesting(false);
                    }
                  }}
                  disabled={isTesting || !testQuery.trim() || !remoteUrl.trim()}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: isTesting ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
                    color: '#f59e0b',
                    cursor: isTesting || !testQuery.trim() || !remoteUrl.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    opacity: isTesting || !testQuery.trim() || !remoteUrl.trim() ? 0.6 : 1,
                  }}
                >
                  {isTesting ? '⏳ Testing...' : '🚀 Test'}
                </button>
              </div>
              {testResult && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}>
                  <p style={{ color: testResult.success ? '#10b981' : '#ef4444', fontSize: '0.8rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
                    {testResult.success ? '✅ Success' : '❌ Error'}
                  </p>
                  <pre style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '0.7rem',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '150px',
                    overflowY: 'auto',
                  }}>
                    {testResult.success ? JSON.stringify(testResult.data, null, 2) : testResult.error}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderConfigStep = () => {
    // Determine if embeddings will be generated (only for URL source)
    const needsEmbeddings = sourceType === 'url' && urlNeedsEmbeddings;

    // Upstash embedding info for CSV
    const UPSTASH_MODEL = {
      name: 'BGE-BASE-EN-V1.5',
      dimensions: 768,
      sparseModel: 'BM25',
      similarity: 'COSINE',
    };

    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>⚙️ Configuration</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {sourceType === 'csv'
            ? 'Review embedding settings and configure retrieval options.'
            : 'Configure embedding and retrieval settings.'}
        </p>

        {/* Content Type Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>Content Type</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { value: 'text', label: '📝 Text', desc: 'Natural language, docs, articles' },
              { value: 'code', label: '💻 Code', desc: 'Programming code, scripts' },
              { value: 'mixed', label: '📦 Mixed', desc: 'Both text and code' },
            ].map(type => (
              <button
                key={type.value}
                onClick={() => setContentType(type.value as 'text' | 'code' | 'mixed')}
                style={{
                  flex: '1 1 100px',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: contentType === type.value ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.2)',
                  background: contentType === type.value ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>{type.label}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>{type.desc}</span>
              </button>
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            {contentType === 'code'
              ? '🔍 Hybrid search enabled for exact keyword + semantic matching'
              : contentType === 'mixed'
                ? '🔍 Hybrid search enabled for best of both worlds'
                : '🔍 Semantic search optimized for natural language'}
          </p>
        </div>

        {/* CSV: Show Upstash embedding info (read-only) */}
        {sourceType === 'csv' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Embedding Configuration</label>
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🧠</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Upstash Vector (Hybrid Search)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>{UPSTASH_MODEL.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Dense Model</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ color: '#a78bfa', fontWeight: 600, fontSize: '1.1rem' }}>{UPSTASH_MODEL.dimensions}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Dimensions</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem' }}>{UPSTASH_MODEL.sparseModel}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Sparse Model</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: '0.9rem' }}>{UPSTASH_MODEL.similarity}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Similarity</div>
                </div>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.75rem', marginBottom: 0 }}>
                ✨ Embeddings are generated automatically by Upstash Vector for optimal search performance.
              </p>
            </div>

            {/* Server Description for API consumers */}
            <div style={{ marginTop: '1rem' }}>
              <label style={labelStyle}>📡 Server Description (shown to API consumers)</label>
              <textarea
                value={serverDescription}
                onChange={(e) => setServerDescription(e.target.value)}
                placeholder="Describe this collection for API consumers. E.g., 'Product documentation for XYZ API. Returns relevant docs for product queries.'"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                This description will be shown when users access your collection endpoint.
              </p>
            </div>
          </div>
        )}

        {/* URL: Show embedding model selector with dimension warning */}
        {sourceType === 'url' && (
          <div style={{ marginBottom: '1.5rem', opacity: needsEmbeddings ? 1 : 0.5 }}>
            <label style={labelStyle}>Embedding Model</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <select
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  style={selectStyle}
                  disabled={!needsEmbeddings}
                >
                  {availableEmbeddingModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.icon} {model.name} {model.isLocal ? '• Free' : `• ${formatCurrency(model.costPer1M)}/M`}
                    </option>
                  ))}
                </select>
              </div>
              {/* Dimensions display - read-only, auto-set from model */}
              <div style={{ minWidth: '100px' }}>
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  textAlign: 'center',
                }}>
                  <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: '1.1rem' }}>{currentModelDimensions}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block' }}>dimensions</span>
                </div>
              </div>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {!needsEmbeddings
                ? '⚠️ Embeddings not needed - source already has embeddings'
                : availableEmbeddingModels.find(m => m.id === embeddingModel)?.isLocal
                  ? '💻 Runs locally - no API costs, works offline'
                  : '☁️ Remote API - higher quality, uses your budget'}
            </p>
            {needsEmbeddings && (
              <div style={{
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginTop: '0.75rem',
              }}>
                <p style={{ color: '#fbbf24', fontSize: '0.8rem', margin: 0 }}>
                  ⚠️ <strong>Important:</strong> Your remote API must return embeddings with <strong>DIMENSIONS: {currentModelDimensions}</strong> to match this model.
                </p>
              </div>
            )}
            {needsEmbeddings && userTier === 'free' && (
              <p style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                💡 Upgrade to Pro or Plus for access to more embedding models
              </p>
            )}
            {needsEmbeddings && userTier === 'pro' && availableEmbeddingModels.length < EMBEDDING_MODELS.length && (
              <p style={{ color: '#a78bfa', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                ✨ Upgrade to Plus for access to all {EMBEDDING_MODELS.length} embedding models
              </p>
            )}
          </div>
        )}

        {/* Chunking settings - only show for CSV or URL needing embeddings */}
        {(sourceType === 'csv' || needsEmbeddings) && (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '1.5rem' }}>
            <div>
              <label style={labelStyle}>Chunk Size</label>
              <input
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(parseInt(e.target.value) || 500)}
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '0.25rem' }}>Characters per chunk</p>
            </div>
            <div>
              <label style={labelStyle}>Chunk Overlap</label>
              <input
                type="number"
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(parseInt(e.target.value) || 50)}
                style={inputStyle}
              />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '0.25rem' }}>Overlap between chunks</p>
            </div>
          </div>
        )}

        {/* Retrieval settings */}
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '1.5rem' }}>
          <div>
            <label style={labelStyle}>Top N Results</label>
            <input
              type="number"
              value={topN}
              onChange={(e) => setTopN(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
              min={1}
              max={20}
              style={{ ...inputStyle, maxWidth: '120px' }}
            />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
              Number of chunks to retrieve (1-20)
            </p>
          </div>
          <div>
            <label style={labelStyle}>Context Token Limit</label>
            <input
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(parseInt(e.target.value) || 8000)}
              style={{ ...inputStyle, maxWidth: '150px' }}
            />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
              Max tokens in AI context
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderSavingStep = () => (
    <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
      <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '0.5rem' }}>Creating Knowledge Base...</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)' }}>
        {sourceType === 'csv' ? 'Uploading and processing your documents...' : 'Setting up your knowledge base...'}
      </p>
    </div>
  );

  return (
    <div style={containerStyle}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <BackToTools />

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ color: '#fff', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, marginBottom: '0.5rem' }}>
            📚 Create Knowledge Base
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
            Import documents to enhance your AI with custom knowledge
          </p>
        </div>

        {ADS_CONFIG.enabled && <AdBanner slot={ADS_CONFIG.slots.homeTop} style={{ marginBottom: '1.5rem' }} />}

        {renderStepIndicator()}

        {error && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {currentStep === 'name' && renderNameStep()}
        {currentStep === 'source' && renderSourceStep()}
        {currentStep === 'config' && renderConfigStep()}
        {currentStep === 'saving' && renderSavingStep()}

        {/* Navigation */}
        {currentStep !== 'saving' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
            {currentStep === 'name' ? (
              <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>
                ← Cancel
              </Link>
            ) : (
              <button onClick={handleBack} style={{ ...buttonStyle, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={isSaving}
              style={{
                ...buttonStyle,
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                color: '#fff',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {currentStep === 'config' ? (isSaving ? 'Creating...' : 'Create Knowledge Base') : 'Next →'}
            </button>
          </div>
        )}

        <AdBanner slot={ADS_CONFIG.slots.homeTop} style={{ marginTop: '2rem' }} />
        <Footer />
      </div>
    </div>
  );
}
