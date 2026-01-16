'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Footer } from '../components/Footer';
import { applySEO } from '../utils/seo';
import {
  EMBEDDING_MODELS,
  formatTokenCount,
  formatCurrency,
  calculateEmbeddingCost,
} from '../config/ai-tokens.config';

interface RAGExplorerPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

interface RAGCollection {
  id: string;
  name: string;
  rag_name: string;
  description: string | null;
  icon: string;
  source_type: 'csv' | 'url';
  embedding_model: string | null;
  embedding_dimensions: number;
  top_n: number;
}

interface SearchResult {
  content: string;
  score: number;
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

export const RAGExplorerPage: React.FC<RAGExplorerPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  const router = useRouter();

  // State
  const [rags, setRags] = useState<RAGCollection[]>([]);
  const [selectedRag, setSelectedRag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<SearchMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  // Budget tracking
  const [embeddingTokensUsed, setEmbeddingTokensUsed] = useState(0);
  const [embeddingCostUsed, setEmbeddingCostUsed] = useState(0);
  const [remainingBudget, setRemainingBudget] = useState(5);

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

  // Fetch RAGs and API key
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch RAGs
        const ragsRes = await fetch('/api/ai/rags');
        if (ragsRes.ok) {
          const data = await ragsRes.json();
          setRags(data.rags || []);
          if (data.rags?.length > 0 && !selectedRag) {
            setSelectedRag(data.rags[0].id);
          }
        }

        // Fetch API key
        const keysRes = await fetch('/api/keys/list');
        if (keysRes.ok) {
          const data = await keysRes.json();
          if (data.hasKey && data.apiKey) {
            setApiKey(data.apiKey);
          }
        }

        // Fetch budget
        const budgetRes = await fetch('/api/ai/budget');
        if (budgetRes.ok) {
          const data = await budgetRes.json();
          setRemainingBudget(data.remainingBudget || 5);
          setEmbeddingCostUsed(data.embeddingCost || 0);
          setEmbeddingTokensUsed(data.embeddingTokens || 0);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  }, [selectedRag]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Calculate total tokens in conversation
  const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
  const totalCost = messages.reduce((sum, m) => sum + (m.cost || 0), 0);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!query.trim() || !selectedRag || !apiKey || isLoading) return;

    const userMessage: SearchMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);
    setError(null);

    try {
      const ragData = rags.find(r => r.id === selectedRag);
      if (!ragData) throw new Error('RAG not found');

      // Call collection API
      const response = await fetch(`/api/collection/${apiKey}/${ragData.rag_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          top_n: ragData.top_n || 5,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Search failed');
      }

      const data = await response.json();
      // Estimate tokens (rough: ~4 chars per token)
      const estimatedTokens = Math.ceil(query.trim().length / 4);
      const cost = embeddingModel ? calculateEmbeddingCost(embeddingModel.id, estimatedTokens) : 0;

      const assistantMessage: SearchMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.results?.length > 0
          ? `Found ${data.results.length} relevant results:`
          : 'No results found for your query.',
        timestamp: new Date(),
        results: data.results || [],
        tokens: estimatedTokens,
        cost,
        ragName: ragData.name,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setEmbeddingTokensUsed(prev => prev + estimatedTokens);
      setEmbeddingCostUsed(prev => prev + cost);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [query, selectedRag, apiKey, isLoading, rags, embeddingModel]);

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

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle: React.CSSProperties = {
    padding: '1rem',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  };

  const selectStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    color: '#fff',
    fontSize: '0.9rem',
    cursor: 'pointer',
    minWidth: '200px',
  };

  if (!isLoggedIn) {
    return (
      <div style={containerStyle}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🔍</span>
            <h1 style={{ color: '#fff', marginBottom: '1rem' }}>Knowledge Base Search</h1>
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

  return (
    <div style={containerStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>
            ← Home
          </Link>
          <h1 style={{ color: '#fff', fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔍</span> Knowledge Base Search
          </h1>
        </div>

        {/* RAG Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            value={selectedRag || ''}
            onChange={(e) => setSelectedRag(e.target.value)}
            style={selectStyle}
          >
            {rags.length === 0 ? (
              <option value="">No knowledge bases</option>
            ) : (
              rags.map(rag => (
                <option key={rag.id} value={rag.id}>
                  {rag.icon} {rag.name}
                </option>
              ))
            )}
          </select>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              padding: '0.5rem',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && selectedRagData && (
        <div style={{
          padding: '1rem',
          background: 'rgba(0,0,0,0.3)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Source:</span>
              <span style={{ color: '#fff', marginLeft: '0.5rem' }}>
                {selectedRagData.source_type === 'csv' ? '📄 CSV Upload' : '🌐 Remote URL'}
              </span>
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Embedding Model:</span>
              <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>
                {embeddingModel?.name || selectedRagData.embedding_model || 'Upstash BGE'}
              </span>
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Dimensions:</span>
              <span style={{ color: '#fff', marginLeft: '0.5rem' }}>{selectedRagData.embedding_dimensions}</span>
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Top N:</span>
              <span style={{ color: '#fff', marginLeft: '0.5rem' }}>{selectedRagData.top_n}</span>
            </div>
          </div>
        </div>
      )}

      {/* Token Stats Bar */}
      <div style={{
        padding: '0.5rem 1rem',
        background: 'rgba(16, 185, 129, 0.1)',
        borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
        display: 'flex',
        justifyContent: 'center',
        gap: '2rem',
        fontSize: '0.8rem',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.6)' }}>
          Session: <span style={{ color: '#10b981' }}>{formatTokenCount(totalTokens)} tokens</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '0.5rem' }}>({formatCurrency(totalCost)})</span>
        </span>
        <span style={{ color: 'rgba(255,255,255,0.6)' }}>
          Budget: <span style={{ color: remainingBudget > 1 ? '#10b981' : '#f59e0b' }}>{formatCurrency(remainingBudget)} remaining</span>
        </span>
      </div>

      {/* Messages Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🔮</span>
            <p>Explore your knowledge base</p>
            {rags.length === 0 && (
              <Link href="/dashboard/rag-import" style={{ color: '#10b981', textDecoration: 'underline' }}>
                Create your first knowledge base →
              </Link>
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
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Result {idx + 1}</span>
                            <span style={{ color: '#10b981', fontSize: '0.75rem' }}>Score: {(result.score * 100).toFixed(1)}%</span>
                          </div>
                          <p style={{ color: '#fff', fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-wrap' }}>
                            {result.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Token info */}
                  {msg.tokens && msg.tokens > 0 && (
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

      {/* Input Area */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.3)',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', gap: '0.75rem' }}>
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder={selectedRag ? 'Search your knowledge base...' : 'Select a knowledge base first'}
            disabled={!selectedRag || !apiKey || isLoading}
            rows={1}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              color: '#fff',
              fontSize: '1rem',
              resize: 'none',
              minHeight: '44px',
              maxHeight: '120px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || !selectedRag || !apiKey || isLoading}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '12px',
              padding: '0 1.5rem',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: (!query.trim() || !selectedRag || !apiKey || isLoading) ? 0.5 : 1,
            }}
          >
            {isLoading ? '...' : '🔍'}
          </button>
        </div>
        {error && (
          <p style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>{error}</p>
        )}
        {!apiKey && (
          <p style={{ color: '#f59e0b', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>
            ⚠️ Generate an API key in the <Link href="/dashboard" style={{ color: '#f59e0b' }}>dashboard</Link> to search
          </p>
        )}
      </div>
    </div>
  );
};
