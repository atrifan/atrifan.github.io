'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Types
interface RAGCollection {
  id: string;
  name: string;
  rag_name: string;
  description: string | null;
  icon: string;
  source_type: 'csv' | 'url';
  source_url: string | null;
  document_count: number;
  chunk_count: number;
  total_tokens: number;
  embedding_model: string | null;
  environment_name: string | null;
  tool_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RAGToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void;
  onHasTools?: (hasTools: boolean) => void;
}

export function RAGToolsSection({ onToolSelect, selectedTools = [], onDataChange, onHasTools }: RAGToolsSectionProps) {
  const [rags, setRags] = useState<RAGCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRags, setExpandedRags] = useState<Set<string>>(new Set());
  const [deletingRag, setDeletingRag] = useState<string | null>(null);
  const [confirmDeleteRag, setConfirmDeleteRag] = useState<{ ragId: string; ragName: string } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  useEffect(() => {
    fetchRags();
  }, []);

  useEffect(() => {
    if (onHasTools) {
      onHasTools(rags.length > 0);
    }
  }, [rags.length, onHasTools]);

  const fetchRags = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ai/rags');
      if (!response.ok) throw new Error('Failed to fetch RAGs');
      const data = await response.json();
      setRags(data.rags || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching RAGs:', err);
      setError('Failed to load knowledge bases');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (ragId: string) => {
    setExpandedRags(prev => {
      const next = new Set(prev);
      if (next.has(ragId)) next.delete(ragId);
      else next.add(ragId);
      return next;
    });
  };

  const handleDeleteRag = async (ragId: string) => {
    setDeletingRag(ragId);
    setConfirmDeleteRag(null);
    try {
      const response = await fetch(`/api/ai/rags/${ragId}`, { method: 'DELETE' });
      if (response.ok) {
        showNotification('success', 'Knowledge base deleted');
        await fetchRags();
        onDataChange?.();
      } else {
        const data = await response.json();
        showNotification('error', data.error || 'Failed to delete');
      }
    } catch {
      showNotification('error', 'Failed to delete knowledge base');
    } finally {
      setDeletingRag(null);
    }
  };

  // Generate tool name for a RAG
  const getToolName = (rag: RAGCollection): string => {
    const envName = rag.environment_name || 'default';
    return `rag_${envName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${rag.rag_name}-search`;
  };

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(124, 58, 237, 0.08))',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Loading knowledge bases...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(220, 38, 38, 0.08))',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{ color: '#ef4444' }}>{error}</div>
        <button onClick={fetchRags} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#ef4444', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (rags.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(124, 58, 237, 0.08))',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📚</div>
        <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>No Knowledge Bases</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 1rem' }}>
          Import CSV files or connect external RAG endpoints to add knowledge base tools.
        </p>
        <Link href="/dashboard/rag-import" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: '8px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
          + Import Knowledge Base
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(124, 58, 237, 0.08))',
      border: '1px solid rgba(139, 92, 246, 0.25)',
      borderRadius: '16px',
      padding: 'clamp(1rem, 3vw, 1.5rem)',
      position: 'relative',
    }}>
      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', padding: '0.75rem 1rem', borderRadius: '8px',
          background: notification.type === 'success' ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(124, 58, 237, 0.95))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
          border: `1px solid ${notification.type === 'success' ? 'rgba(139, 92, 246, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
          color: '#fff', fontSize: '0.9rem', fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ color: '#8b5cf6', margin: 0, fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📚 Knowledge Base Tools
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0.25rem 0 0', fontSize: 'clamp(0.8rem, 2vw, 0.85rem)' }}>
            RAG collections for semantic search
          </p>
        </div>
        <Link href="/dashboard/rag-import" style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#8b5cf6', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          + Import
        </Link>
      </div>

      {/* RAG List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rags.map(rag => {
          const isExpanded = expandedRags.has(rag.id);
          const toolName = getToolName(rag);
          const isSelected = selectedTools.includes(toolName);

          return (
            <div key={rag.id} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.15)', overflow: 'hidden' }}>
              {/* RAG Header */}
              <div
                onClick={() => toggleExpand(rag.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <span style={{ fontSize: '1.25rem' }}>{rag.icon || '📚'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rag.name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>{rag.source_type === 'csv' ? '📄 CSV' : '🔗 URL'}</span>
                    <span>•</span>
                    <span>{rag.document_count} docs</span>
                    <span>•</span>
                    <span>{rag.chunk_count} chunks</span>
                  </div>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(139, 92, 246, 0.15)', padding: '1rem' }}>
                  {rag.description && (
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem' }}>{rag.description}</p>
                  )}

                  {/* Tool Selection */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', border: isSelected ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToolSelect?.(toolName, !isSelected)}
                      style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{toolName}</div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Search tool for this knowledge base</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Link href={`/dashboard/rag/${rag.id}`} style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#8b5cf6', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
                      ⚙️ Manage
                    </Link>
                    <button
                      onClick={() => setConfirmDeleteRag({ ragId: rag.id, ragName: rag.name })}
                      disabled={deletingRag === rag.id}
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, cursor: deletingRag === rag.id ? 'not-allowed' : 'pointer', opacity: deletingRag === rag.id ? 0.5 : 1 }}
                    >
                      {deletingRag === rag.id ? '...' : '🗑️ Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteRag && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setConfirmDeleteRag(null)}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16162a)', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', border: '1px solid rgba(239, 68, 68, 0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 1rem', fontSize: '1.1rem' }}>Delete Knowledge Base?</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>
              Are you sure you want to delete <strong style={{ color: '#ef4444' }}>{confirmDeleteRag.ragName}</strong>? This will remove all documents and vectors.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteRag(null)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={() => handleDeleteRag(confirmDeleteRag.ragId)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
