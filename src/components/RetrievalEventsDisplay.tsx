'use client';

import React, { useState } from 'react';

// Types for retrieval events
export interface RAGResult {
  id: string;
  score: number;
  title?: string;
  content: string;
  source?: string;
}

export interface RAGRetrievalEvent {
  ragId: string;
  ragName: string;
  ragIcon: string;
  sourceType: 'csv' | 'url';
  results: RAGResult[];
  error?: string;
}

export interface HistoryMatchEvent {
  chatId: string;
  score: number;
  messages: Array<{ content: string; messageType: string }>;
}

export interface RetrievalEventsData {
  ragEvents?: RAGRetrievalEvent[];
  historyEvents?: HistoryMatchEvent[];
  isSearching?: boolean;
  isSending?: boolean;
}

interface RetrievalEventsDisplayProps {
  data: RetrievalEventsData;
  style?: React.CSSProperties;
}

export function RetrievalEventsDisplay({ data, style }: RetrievalEventsDisplayProps) {
  const [expandedRags, setExpandedRags] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState(false);

  const { ragEvents, historyEvents, isSearching, isSending } = data;
  const hasRagResults = ragEvents && ragEvents.some(e => e.results.length > 0);
  const hasHistoryResults = historyEvents && historyEvents.length > 0;

  if (!isSearching && !isSending && !hasRagResults && !hasHistoryResults) {
    return null;
  }

  const toggleRag = (ragId: string) => {
    setExpandedRags(prev => {
      const next = new Set(prev);
      if (next.has(ragId)) next.delete(ragId);
      else next.add(ragId);
      return next;
    });
  };

  return (
    <div style={{
      padding: '0.75rem 1rem',
      background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.95), rgba(15, 15, 30, 0.95))',
      borderRadius: '12px',
      border: '1px solid rgba(139, 92, 246, 0.2)',
      marginBottom: '0.75rem',
      fontSize: '0.8rem',
      ...style,
    }}>
      {/* Searching indicator */}
      {isSearching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(139, 92, 246, 0.8)', marginBottom: hasRagResults || hasHistoryResults ? '0.5rem' : 0 }}>
          <div className="retrieval-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }} />
          <span>Retrieving from knowledge bases...</span>
        </div>
      )}

      {/* RAG Results */}
      {hasRagResults && ragEvents?.map(event => {
        if (event.results.length === 0) return null;
        const isExpanded = expandedRags.has(event.ragId);
        
        return (
          <div key={event.ragId} style={{ marginBottom: '0.5rem' }}>
            <button
              onClick={() => toggleRag(event.ragId)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer', color: '#10b981',
              }}
            >
              <span>{event.ragIcon}</span>
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>{event.ragName}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{event.results.length} results</span>
              <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
            </button>
            
            {isExpanded && (
              <div style={{ marginTop: '0.5rem', paddingLeft: '1rem', borderLeft: '2px solid rgba(16, 185, 129, 0.3)' }}>
                {event.results.map((result, idx) => (
                  <div key={result.id} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: 'rgba(16, 185, 129, 0.7)', fontSize: '0.7rem' }}>#{idx + 1}</span>
                      {result.title && <span style={{ color: '#fff', fontWeight: 500 }}>{result.title}</span>}
                      <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                        {(result.score * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', lineHeight: 1.4 }}>
                      {result.content.length > 200 ? result.content.slice(0, 200) + '...' : result.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* History Match Results */}
      {hasHistoryResults && (
        <div style={{ marginBottom: '0.5rem' }}>
          <button
            onClick={() => setExpandedHistory(!expandedHistory)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
              background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer', color: '#f59e0b',
            }}
          >
            <span>🧠</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Matching History Context</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{historyEvents?.length} matches</span>
            <span style={{ transform: expandedHistory ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          </button>
          
          {expandedHistory && historyEvents && (
            <div style={{ marginTop: '0.5rem', paddingLeft: '1rem', borderLeft: '2px solid rgba(245, 158, 11, 0.3)' }}>
              {historyEvents.map((event, idx) => (
                <div key={idx} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <div style={{ color: 'rgba(245, 158, 11, 0.7)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>
                    {(event.score * 100).toFixed(0)}% relevance
                  </div>
                  {event.messages.slice(0, 2).map((msg, mIdx) => (
                    <div key={mIdx} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: msg.messageType === 'user' ? '#8b5cf6' : '#10b981' }}>
                        {msg.messageType === 'user' ? 'You: ' : 'AI: '}
                      </span>
                      {msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sending indicator */}
      {isSending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(99, 102, 241, 0.8)', marginTop: hasRagResults || hasHistoryResults ? '0.5rem' : 0 }}>
          <div className="retrieval-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} />
          <span>Sending to model with context...</span>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        .retrieval-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// Compact inline version for message history display
export function RetrievalEventsBadge({
  ragData,
  historyData,
  onClick
}: {
  ragData?: RAGRetrievalEvent[];
  historyData?: HistoryMatchEvent[];
  onClick?: () => void;
}) {
  const ragCount = ragData?.reduce((sum, e) => sum + e.results.length, 0) || 0;
  const historyCount = historyData?.length || 0;

  if (ragCount === 0 && historyCount === 0) return null;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: 'pointer',
        fontSize: '0.7rem', color: '#a78bfa',
      }}
    >
      {ragCount > 0 && <span>📚 {ragCount} RAG</span>}
      {historyCount > 0 && <span>🧠 {historyCount} history</span>}
    </button>
  );
}

