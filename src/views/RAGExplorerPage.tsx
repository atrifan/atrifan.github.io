'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Footer } from '../components/Footer';
import { RAGSettingsPanel, RAGSettingsPanelMode } from '../components/RAGSettingsPanel';
import { ChatInputArea } from '../components/ChatInputArea';
import { OAuthAuthenticationModal, OAuthSuccessData } from '../components/OAuthAuthenticationModal';
import { applySEO } from '../utils/seo';
import {
  EMBEDDING_MODELS,
  formatCurrency,
  calculateEmbeddingCost,
} from '../config/ai-tokens.config';
import type { OAuth2AuthConfig, OAuthServerType } from '../types/supabase';

interface RAGExplorerPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
  sessionId?: string;
}

interface RAGCollection {
  id: string;
  name: string;
  rag_name: string;
  description: string | null;
  icon: string;
  source_type: 'csv' | 'url';
  source_url?: string;
  embedding_model: string | null;
  embedding_dimensions: number;
  top_n: number;
  auth_type?: string;
  auth_config?: {
    authorization_endpoint?: string;
    token_endpoint?: string;
    scopes?: string;
    client_id?: string;
    client_secret?: string;
  };
}

interface SearchResult {
  content: string;
  score: number;
  title?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface SearchMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  results?: SearchResult[];
  tokens?: number;
  cost?: number;
  ragName?: string;
}

interface RAGSession {
  id: string;
  title: string;
  rag_id: string | null;
  rag_name: string | null;
  embedding_model: string | null;
  message_count: number;
  total_tokens: number;
  total_cost: number;
  updated_at: string;
}

export const RAGExplorerPage: React.FC<RAGExplorerPageProps> = ({ isLoggedIn, isPro, isPlus, sessionId }) => {
  const router = useRouter();

  // State
  const [rags, setRags] = useState<RAGCollection[]>([]);
  const [selectedRag, setSelectedRag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<SearchMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  // Session management
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [sessions, setSessions] = useState<RAGSession[]>([]);

  // Settings panel
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsPanelMode, setSettingsPanelMode] = useState<RAGSettingsPanelMode>('main');

  // Budget tracking
  const [embeddingTokensUsed, setEmbeddingTokensUsed] = useState(0);
  const [embeddingCostUsed, setEmbeddingCostUsed] = useState(0);
  const [remainingBudget, setRemainingBudget] = useState(5);
  const [monthlyBudget, setMonthlyBudget] = useState(5);

  // Screen size
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // OAuth state
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthModalData, setOauthModalData] = useState<{
    serverName: string;
    serverType: OAuthServerType;
    serverId: string;
    oauthConfig: OAuth2AuthConfig;
  } | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get selected RAG data
  const selectedRagData = rags.find(r => r.id === selectedRag);
  const embeddingModel = selectedRagData?.embedding_model
    ? EMBEDDING_MODELS.find(m => m.id === selectedRagData.embedding_model)
    : null;

  // Apply SEO
  useEffect(() => {
    applySEO('ragExplorer');
  }, []);

  // Screen size detection
  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 768);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Fetch RAGs, API key, sessions, and budget (runs once on mount)
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch RAGs
        const ragsRes = await fetch('/api/ai/rags');
        let fetchedRags: typeof rags = [];
        if (ragsRes.ok) {
          const data = await ragsRes.json();
          fetchedRags = data.rags || [];
          setRags(fetchedRags);
        }

        // If we have a sessionId in URL, load that session to get the correct RAG
        // Otherwise, select the first RAG as default
        if (sessionId) {
          // Load session data to get the RAG ID
          const sessionRes = await fetch(`/api/ai/rag-sessions/${sessionId}`);
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            setCurrentSessionId(sessionId);
            if (sessionData.session.rag_id) {
              setSelectedRag(sessionData.session.rag_id);
            } else if (fetchedRags.length > 0) {
              setSelectedRag(fetchedRags[0].id);
            }
            setMessages(
              (sessionData.messages || []).map((m: { id: string; role: 'user' | 'assistant'; content: string; results?: SearchResult[]; tokens?: number; cost?: number; created_at: string }) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.created_at),
                results: m.results || [],
                tokens: m.tokens,
                cost: m.cost,
              }))
            );
          } else if (fetchedRags.length > 0) {
            setSelectedRag(fetchedRags[0].id);
          }
        } else if (fetchedRags.length > 0) {
          setSelectedRag(fetchedRags[0].id);
        }

        // Fetch API key
        const keysRes = await fetch('/api/keys/list');
        if (keysRes.ok) {
          const data = await keysRes.json();
          if (data.hasKey && data.apiKey) {
            setApiKey(data.apiKey);
          }
        }
        setApiKeyLoading(false);

        // Fetch sessions
        const sessionsRes = await fetch('/api/ai/rag-sessions');
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setSessions(data.sessions || []);
        }

        // Fetch budget
        const budgetRes = await fetch('/api/ai/budget');
        if (budgetRes.ok) {
          const data = await budgetRes.json();
          setRemainingBudget(data.remainingBudget || 5);
          setMonthlyBudget(data.budget?.monthlyBudgetUsd || 5);
          setEmbeddingCostUsed(data.embeddingCost || 0);
          setEmbeddingTokensUsed(data.embeddingTokens || 0);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - sessionId is from URL params and doesn't change

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Calculate total tokens in conversation
  const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
  const totalCost = messages.reduce((sum, m) => sum + (m.cost || 0), 0);

  // Load a session
  const loadSession = async (id: string, updateUrl: boolean = true) => {
    try {
      const res = await fetch(`/api/ai/rag-sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentSessionId(id);
        if (data.session.rag_id) {
          setSelectedRag(data.session.rag_id);
        }
        setMessages(
          (data.messages || []).map((m: { id: string; role: 'user' | 'assistant'; content: string; results?: SearchResult[]; tokens?: number; cost?: number; created_at: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at),
            results: m.results || [],
            tokens: m.tokens,
            cost: m.cost,
          }))
        );
        // Only update URL if explicitly requested (e.g., clicking from history sidebar)
        if (updateUrl) {
          window.history.replaceState(null, '', `/rag-explorer/${id}`);
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  // Delete a session
  const deleteSession = async (id: string) => {
    try {
      await fetch(`/api/ai/rag-sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        startNewSession();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  // Clear all history
  const clearAllHistory = async () => {
    try {
      await fetch('/api/ai/rag-sessions', { method: 'DELETE' });
      setSessions([]);
      startNewSession();
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  // Start new session
  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setError(null);
    router.push('/rag-explorer');
  };

  // OAuth handlers
  const triggerOAuthAndRetry = useCallback((
    queryToRetry: string,
    ragData: RAGCollection
  ) => {
    if (!ragData.auth_config) return;

    console.log('[RAG OAuth] Triggering OAuth flow for:', ragData.name);
    setPendingQuery(queryToRetry);
    setOauthModalData({
      serverName: ragData.name,
      serverType: 'rag' as OAuthServerType,
      serverId: ragData.id,
      oauthConfig: {
        authorization_endpoint: ragData.auth_config.authorization_endpoint || '',
        token_endpoint: ragData.auth_config.token_endpoint || '',
        scopes: ragData.auth_config.scopes || '',
        client_id: ragData.auth_config.client_id || '',
        client_secret: ragData.auth_config.client_secret || '',
        use_dcr: false,
        registration_endpoint: '',
      },
    });
    setOauthModalOpen(true);
    setIsLoading(false);
  }, []);

  const handleOAuthSuccess = useCallback(async (_data?: OAuthSuccessData) => {
    setOauthModalOpen(false);
    setOauthModalData(null);

    // Retry the pending query
    if (pendingQuery) {
      console.log('[RAG OAuth] Auth successful, retrying query');
      setQuery(pendingQuery);
      setPendingQuery(null);
      // Trigger search after state update
      setTimeout(() => {
        const searchBtn = document.querySelector('button[aria-label="Search"]') as HTMLButtonElement;
        if (searchBtn && !searchBtn.disabled) {
          searchBtn.click();
        }
      }, 100);
    }
  }, [pendingQuery]);

  const handleOAuthCancel = useCallback(() => {
    setOauthModalOpen(false);
    setOauthModalData(null);
    setPendingQuery(null);
  }, []);

  // Search handler - uses unified /api/collection/{apiKey}/{ragName} endpoint
  const handleSearch = useCallback(async () => {
    if (!query.trim() || !selectedRag || !apiKey || isLoading) return;

    const queryText = query.trim();
    const userMessage: SearchMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: queryText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);
    setError(null);

    try {
      const ragData = rags.find(r => r.id === selectedRag);
      if (!ragData) throw new Error('RAG not found');

      // Create session if needed
      let sessionIdToUse = currentSessionId;
      if (!sessionIdToUse) {
        const sessionRes = await fetch('/api/ai/rag-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: queryText.slice(0, 50) + (queryText.length > 50 ? '...' : ''),
            ragId: ragData.id,
            ragName: ragData.name,
            embeddingModel: ragData.embedding_model,
          }),
        });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          sessionIdToUse = sessionData.session.id;
          setCurrentSessionId(sessionIdToUse);
          // Use replace to update URL without triggering a full page reload
          window.history.replaceState(null, '', `/rag-explorer/${sessionIdToUse}`);
          // Add to sessions list
          setSessions(prev => [sessionData.session, ...prev]);
        }
      }

      // Call unified collection API (handles both CSV/internal and URL/external)
      const response = await fetch(`/api/collection/${apiKey}/${ragData.rag_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          top_n: ragData.top_n || 5,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Search failed');
      }

      const data = await response.json();
      // Estimate tokens (rough: ~4 chars per token)
      const estimatedTokens = Math.ceil(queryText.length / 4);
      const cost = embeddingModel ? calculateEmbeddingCost(embeddingModel.id, estimatedTokens) : 0;

      const assistantContent = data.results?.length > 0
        ? `Found ${data.results.length} relevant results:`
        : 'No results found for your query.';

      const assistantMessage: SearchMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        results: data.results || [],
        tokens: estimatedTokens,
        cost,
        ragName: ragData.name,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setEmbeddingTokensUsed(prev => prev + estimatedTokens);
      setEmbeddingCostUsed(prev => prev + cost);

      // Save messages to session
      if (sessionIdToUse) {
        await fetch(`/api/ai/rag-sessions/${sessionIdToUse}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: queryText,
            assistantMessage: assistantContent,
            results: data.results || [],
            tokens: estimatedTokens,
            cost,
          }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [query, selectedRag, apiKey, isLoading, rags, embeddingModel, currentSessionId, router]);

  // Toggle message expansion
  const toggleExpand = (id: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  if (!isLoggedIn) {
    return (
      <div className="chat-fullscreen-container">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🔮</span>
            <h1 style={{ color: '#fff', marginBottom: '1rem' }}>RAG Explorer</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem' }}>
              Sign in to search your knowledge bases
            </p>
            <Link href="/sign-in" style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              padding: '0.75rem 2rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
            }}>
              Sign In
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Add class to body for hiding iubenda
  useEffect(() => {
    document.body.classList.add('chat-page-active');
    return () => {
      document.body.classList.remove('chat-page-active');
    };
  }, []);

  return (
    <div className="chat-fullscreen">
      {/* Header - compact with essential controls */}
      <div className="chat-fullscreen-header">
        <div style={{ maxWidth: '56rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          {/* Left: Back + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '1.25rem', flexShrink: 0 }}>←</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <span style={{ fontSize: '1.25rem' }}>🔮</span>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedRagData?.name || 'RAG Explorer'}
              </span>
            </div>
          </div>

          {/* Right: Budget + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* Budget indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.6rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.8rem' }}>💰</span>
              <span style={{ color: remainingBudget > 1 ? '#10b981' : '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>{formatCurrency(remainingBudget)}</span>
            </div>

            {/* New search button */}
            <button onClick={startNewSession} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.35rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>+</span>
              <span className="desktop-only">New</span>
            </button>

            {/* History button - opens settings panel */}
            <button onClick={() => {
              setShowSettingsPanel(true);
              setSettingsPanelMode('history');
            }} style={{ background: showSettingsPanel ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.35rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', position: 'relative' }}>
              📜
              {sessions.length > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#10b981', color: '#fff', borderRadius: '8px', padding: '0 0.25rem', fontSize: '0.55rem', fontWeight: 700, minWidth: '14px', textAlign: 'center' }}>{sessions.length > 99 ? '99+' : sessions.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="chat-with-sidebar">
        {/* Main Chat Area */}
        <div className="chat-main-area">
          {/* Messages Area - Scrollable */}
          <div className="chat-fullscreen-messages">
            <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '50vh', padding: '2rem', textAlign: 'center' }}>
            <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🔮</span>
            <h2 style={{ color: '#fff', marginBottom: '0.5rem', fontWeight: 500 }}>RAG Explorer</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1rem' }}>Search your knowledge bases with semantic understanding</p>
            {rags.length === 0 ? (
              <Link href="/dashboard/rag-import" style={{ color: '#10b981', textDecoration: 'underline' }}>
                Create your first knowledge base →
              </Link>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>Select a knowledge base below and start searching</p>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map(msg => {
              const isExpanded = expandedMessages.has(msg.id);
              const hasResults = msg.results && msg.results.length > 0;

              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}
                >
                  <div
                    style={{
                      padding: '0.875rem 1rem',
                      borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: msg.role === 'user'
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      cursor: hasResults ? 'pointer' : 'default',
                    }}
                    onClick={() => hasResults && toggleExpand(msg.id)}
                  >
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    {hasResults && (
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem', display: 'block' }}>
                        {isExpanded ? '▼ Click to collapse' : '▶ Click to expand results'}
                      </span>
                    )}
                  </div>

                  {/* Copy button for assistant messages */}
                  {msg.role === 'assistant' && hasResults && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            // Copy all results as markdown
                            const resultsText = msg.results!.map((r, i) =>
                              `## Result ${i + 1} (Score: ${r.score < 0.1 ? r.score.toFixed(4) : (r.score * 100).toFixed(1) + '%'})\n\n${r.content}`
                            ).join('\n\n---\n\n');
                            await navigator.clipboard.writeText(resultsText);
                            const btn = e.currentTarget;
                            btn.textContent = '✓ Copied';
                            setTimeout(() => { btn.textContent = '📋 Copy All'; }, 1500);
                          } catch (err) {
                            console.error('Failed to copy:', err);
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '6px',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                          e.currentTarget.style.color = '#10b981';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                          e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                        }}
                        title="Copy all results as markdown"
                      >
                        📋 Copy All
                      </button>
                    </div>
                  )}

                  {/* Expanded Results */}
                  {hasResults && isExpanded && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {msg.results!.map((result, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            position: 'relative',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Result {idx + 1}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await navigator.clipboard.writeText(result.content);
                                    const btn = e.currentTarget;
                                    btn.textContent = '✓';
                                    setTimeout(() => { btn.textContent = '📋'; }, 1500);
                                  } catch (err) {
                                    console.error('Failed to copy:', err);
                                  }
                                }}
                                style={{
                                  padding: '0.15rem 0.35rem',
                                  background: 'transparent',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: '4px',
                                  color: 'rgba(255,255,255,0.4)',
                                  fontSize: '0.65rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                                  e.currentTarget.style.color = '#10b981';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                                }}
                                title="Copy this result"
                              >
                                📋
                              </button>
                              <span style={{ color: '#10b981', fontSize: '0.75rem' }}>Score: {result.score < 0.1 ? result.score.toFixed(4) : (result.score * 100).toFixed(1) + '%'}</span>
                            </div>
                          </div>
                          {/* Metadata display */}
                          {result.metadata && Object.keys(result.metadata).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              {Object.entries(result.metadata).map(([key, value]) => (
                                <span
                                  key={key}
                                  style={{
                                    background: 'rgba(139, 92, 246, 0.15)',
                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                    borderRadius: '4px',
                                    padding: '0.15rem 0.4rem',
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{key}:</span>{' '}
                                  <span style={{ color: '#a78bfa' }}>{String(value)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Content with label */}
                          <div style={{ fontSize: '0.85rem' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>content: </span>
                            <span style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{result.content}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Token info - only show for assistant messages (embedding cost) */}
                  {msg.role === 'assistant' && msg.tokens && msg.tokens > 0 && (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>
                      <span style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#10b981' }}>
                        {msg.tokens} tokens ({formatCurrency(msg.cost || 0)})
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
            </div>
          </div>

          {/* Fixed Input Bar - Bottom */}
          <div className="chat-fullscreen-input">
            <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
              <ChatInputArea
                mode="rag"
                message={query}
                setMessage={setQuery}
                onSend={handleSearch}
                isLoading={isLoading}
                isDisabled={!selectedRag || (!apiKey && !apiKeyLoading)}
                remainingBudget={remainingBudget}
                rags={rags.map(r => ({
                  id: r.id,
                  name: r.name,
                  icon: r.icon,
                  source_type: r.source_type,
                  embedding_model: r.embedding_model,
                }))}
                selectedRagId={selectedRag}
                setSelectedRagId={setSelectedRag}
                sessionTokens={totalTokens}
                sessionCost={totalCost}
                showSettingsButton
                onSettingsClick={() => { setShowSettingsPanel(true); setSettingsPanelMode('main'); }}
                error={error || (!apiKey && !apiKeyLoading ? 'Generate an API key in the dashboard to search' : null)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* RAG Settings Panel */}
      <RAGSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isLargeScreen={isLargeScreen}
        panelMode={settingsPanelMode}
        setPanelMode={setSettingsPanelMode}
        rags={rags}
        selectedRagId={selectedRag}
        setSelectedRagId={setSelectedRag}
        budgetData={{
          remainingBudget,
          embeddingCost: embeddingCostUsed,
          embeddingTokens: embeddingTokensUsed,
          monthlyBudget,
        }}
        sessions={sessions}
        currentSessionId={currentSessionId}
        loadSession={loadSession}
        deleteSession={deleteSession}
        clearAllHistory={clearAllHistory}
        onNewSession={startNewSession}
      />

      {/* OAuth Authentication Modal */}
      {oauthModalData && (
        <OAuthAuthenticationModal
          isOpen={oauthModalOpen}
          serverName={oauthModalData.serverName}
          serverType={oauthModalData.serverType}
          serverId={oauthModalData.serverId}
          oauthConfig={oauthModalData.oauthConfig}
          onSuccess={handleOAuthSuccess}
          onCancel={handleOAuthCancel}
        />
      )}
    </div>
  );
};
