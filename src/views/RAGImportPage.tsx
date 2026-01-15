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

  // Embedding config - default to local model (available to all tiers)
  const [embeddingModel, setEmbeddingModel] = useState(LOCAL_EMBEDDING_MODEL.id);
  const [tokenLimit, setTokenLimit] = useState(8000);
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topN, setTopN] = useState(5); // Number of top results to retrieve

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

      // Build request body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: Record<string, any> = {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        sourceUrl: sourceType === 'url' ? remoteUrl : null,
        sourceType,
        authType: storedAuthType,
        authConfig: sourceType === 'url' ? authConfig : {},
        customHeaders: sourceType === 'url' ? headersObj : {},
        hasEmbeddings: sourceType === 'csv' ? csvHasEmbeddings : !urlNeedsEmbeddings,
        embeddingModel: (sourceType === 'csv' && !csvHasEmbeddings) || (sourceType === 'url' && urlNeedsEmbeddings) ? embeddingModel : null,
        tokenLimit,
        chunkSize,
        chunkOverlap,
        topN, // Number of top results to retrieve
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
  const renderNameStep = () => (
    <div style={cardStyle}>
      <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>📝 Knowledge Base Name</h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Give your knowledge base a name and description.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
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
          <label style={labelStyle}>Name *</label>
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
                  <select value={csvContentColumn} onChange={(e) => setCsvContentColumn(e.target.value)} style={inputStyle}>
                    <option value="">Select column...</option>
                    {csvColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Title Column (optional)</label>
                  <select value={csvTitleColumn} onChange={(e) => setCsvTitleColumn(e.target.value)} style={inputStyle}>
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
                    <select value={csvEmbeddingColumn} onChange={(e) => setCsvEmbeddingColumn(e.target.value)} style={inputStyle}>
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
        </div>
      )}
    </div>
  );

  const renderConfigStep = () => {
    // Determine if embeddings will be generated
    const needsEmbeddings = (sourceType === 'csv' && !csvHasEmbeddings) || (sourceType === 'url' && urlNeedsEmbeddings);

    return (
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>⚙️ Configuration</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Configure embedding and retrieval settings.
        </p>

        {/* Embedding Model - always show, but disabled when not needed */}
        <div style={{ marginBottom: '1.5rem', opacity: needsEmbeddings ? 1 : 0.5 }}>
          <label style={labelStyle}>Embedding Model</label>
          <select
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            style={inputStyle}
            disabled={!needsEmbeddings}
          >
            {availableEmbeddingModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.icon} {model.name} ({model.dimensions}d) {model.isLocal ? '• Free' : `• ${formatCurrency(model.costPer1M)}/M`}
              </option>
            ))}
          </select>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {!needsEmbeddings
              ? '⚠️ Embeddings not needed - source already has embeddings'
              : availableEmbeddingModels.find(m => m.id === embeddingModel)?.isLocal
                ? '💻 Runs locally - no API costs, works offline'
                : '☁️ Remote API - higher quality, uses your budget'}
          </p>
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

        {/* Chunking settings - only show when embeddings are needed */}
        {needsEmbeddings && (
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
