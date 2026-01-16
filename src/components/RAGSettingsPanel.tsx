'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { EMBEDDING_MODELS, formatCurrency, formatTokenCount } from '../config/ai-tokens.config';

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
  auth_type?: string;
}

interface RAGSession {
  id: string;
  title: string;
  rag_name: string | null;
  message_count: number;
  total_tokens: number;
  total_cost: number;
  updated_at: string;
}

interface BudgetData {
  remainingBudget: number;
  embeddingCost: number;
  embeddingTokens: number;
  monthlyBudget: number;
}

export type RAGSettingsPanelMode = 'main' | 'history' | 'stats';

export interface RAGSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isLargeScreen: boolean;
  panelMode: RAGSettingsPanelMode;
  setPanelMode: (mode: RAGSettingsPanelMode) => void;
  
  // RAG selection
  rags: RAGCollection[];
  selectedRagId: string | null;
  setSelectedRagId: (id: string) => void;
  
  // Budget
  budgetData: BudgetData | null;
  
  // History
  sessions: RAGSession[];
  currentSessionId: string | null;
  loadSession: (id: string) => void;
  deleteSession: (id: string) => void;
  clearAllHistory: () => void;
  
  // New session
  onNewSession: () => void;
}

// Donut chart component
const UsageDonut: React.FC<{ percent: number; size?: number; strokeWidth?: number }> = ({ percent, size = 32, strokeWidth = 4 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent > 90 ? '#ef4444' : percent > 70 ? '#f59e0b' : '#10b981';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
};

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const RAGSettingsPanel: React.FC<RAGSettingsPanelProps> = (props) => {
  const {
    isOpen,
    onClose,
    isLargeScreen,
    panelMode,
    setPanelMode,
    rags,
    selectedRagId,
    setSelectedRagId,
    budgetData,
    sessions,
    currentSessionId,
    loadSession,
    deleteSession,
    clearAllHistory,
    onNewSession,
  } = props;

  const [showRagDropdown, setShowRagDropdown] = useState(false);

  if (!isOpen) return null;

  const selectedRag = rags.find(r => r.id === selectedRagId);
  const embeddingModel = selectedRag?.embedding_model
    ? EMBEDDING_MODELS.find(m => m.id === selectedRag.embedding_model)
    : null;

  // Budget calculations
  const remainingBudget = budgetData?.remainingBudget || 5;
  const monthlyBudget = budgetData?.monthlyBudget || 5;
  const embeddingCost = budgetData?.embeddingCost || 0;
  const embeddingTokens = budgetData?.embeddingTokens || 0;
  const budgetUsagePercent = ((monthlyBudget - remainingBudget) / monthlyBudget) * 100;

  const gradientColors = 'linear-gradient(135deg, #10b981, #059669)';

  return (
    <>
      {/* Backdrop for large screens */}
      {isLargeScreen && <div className="chat-sidebar-backdrop open" onClick={onClose} />}
      <div className={isLargeScreen ? 'chat-sidebar-panel open' : 'chat-mobile-overlay'}>
        {/* Header */}
        <div className={isLargeScreen ? 'chat-sidebar-header' : 'chat-mobile-overlay-header'}>
          {panelMode === 'main' ? (
            <>
              <button
                onClick={() => { onNewSession(); onClose(); }}
                style={{ padding: '0.4rem 0.75rem', background: gradientColors, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                ✨ New Search
              </button>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 600, flex: 1, textAlign: 'center' }}>RAG Settings</h2>
            </>
          ) : (
            <>
              <button onClick={() => setPanelMode('main')} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>← Back</button>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 600, flex: 1, textAlign: 'center' }}>
                {panelMode === 'history' && '📜 Search History'}
                {panelMode === 'stats' && '📊 Embedding Stats'}
              </h2>
            </>
          )}
          <button onClick={() => { onClose(); setPanelMode('main'); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}>✕</button>
        </div>

        {/* Scrollable Content */}
        <div className={isLargeScreen ? 'chat-sidebar-scrollable' : 'chat-mobile-overlay-content'}>
          {/* MAIN MODE */}
          {panelMode === 'main' && (
            <>
              {/* Budget Indicator */}
              <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>💰 Budget</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{formatCurrency(embeddingCost)} / {formatCurrency(monthlyBudget)}</span>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${budgetUsagePercent}%`, height: '100%', background: budgetUsagePercent > 90 ? '#ef4444' : budgetUsagePercent > 70 ? '#f59e0b' : '#10b981', borderRadius: '8px' }} />
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                  {formatCurrency(remainingBudget)} remaining this month
                </div>

                {/* Embedding Stats */}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>🔮 Embedding Tokens</span>
                    <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 500 }}>{formatTokenCount(embeddingTokens)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>💵 Embedding Cost</span>
                    <span style={{ color: '#a78bfa', fontSize: '0.75rem', fontWeight: 500 }}>{formatCurrency(embeddingCost)}</span>
                  </div>
                </div>
              </div>

              {/* RAG Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Knowledge Base
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowRagDropdown(!showRagDropdown)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.75rem', color: '#fff', fontSize: '1rem', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span>{selectedRag?.icon || '📚'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRag?.name || 'Select Knowledge Base'}</span>
                    </div>
                    <span style={{ transform: showRagDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
                  </button>
                  {showRagDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', maxHeight: '300px', overflowY: 'auto', zIndex: 100 }}>
                      {rags.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                          No knowledge bases found.
                          <Link href="/dashboard/rag-import" style={{ display: 'block', marginTop: '0.5rem', color: '#10b981' }}>Create one →</Link>
                        </div>
                      ) : (
                        rags.map(rag => (
                          <button
                            key={rag.id}
                            onClick={() => { setSelectedRagId(rag.id); setShowRagDropdown(false); }}
                            style={{ width: '100%', padding: '0.6rem 0.75rem', background: selectedRagId === rag.id ? 'rgba(16, 185, 129, 0.2)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textAlign: 'left' }}
                          >
                            <span>{rag.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rag.name}</div>
                              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                                {rag.source_type === 'csv' ? '📄 CSV' : '🌐 URL'} • {rag.embedding_model || 'Upstash BGE'}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected RAG Info */}
              {selectedRag && (
                <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{selectedRag.icon}</span>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>{selectedRag.name}</div>
                      {selectedRag.description && (
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{selectedRag.description}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Source:</span>
                      <span style={{ color: '#fff', marginLeft: '0.35rem' }}>{selectedRag.source_type === 'csv' ? 'CSV Upload' : 'Remote URL'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Top N:</span>
                      <span style={{ color: '#fff', marginLeft: '0.35rem' }}>{selectedRag.top_n}</span>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Model:</span>
                      <span style={{ color: '#10b981', marginLeft: '0.35rem' }}>{embeddingModel?.name || selectedRag.embedding_model || 'Upstash BGE'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Dimensions:</span>
                      <span style={{ color: '#fff', marginLeft: '0.35rem' }}>{selectedRag.embedding_dimensions}</span>
                    </div>
                    {selectedRag.auth_type && selectedRag.auth_type !== 'none' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Auth:</span>
                        <span style={{ color: '#8b5cf6', marginLeft: '0.35rem', textTransform: 'uppercase', fontSize: '0.65rem', background: 'rgba(139, 92, 246, 0.2)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{selectedRag.auth_type}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={() => setPanelMode('history')}
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.9rem' }}
                >
                  <span>📜 Search History</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{sessions.length} sessions</span>
                </button>
                <button
                  onClick={() => setPanelMode('stats')}
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.9rem' }}
                >
                  <span>📊 Embedding Stats</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{formatTokenCount(budgetData?.embeddingTokens || 0)} tokens</span>
                </button>
              </div>
            </>
          )}

          {/* HISTORY MODE */}
          {panelMode === 'history' && (
            <>
              {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📜</span>
                  <p>No search history yet</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{sessions.length} sessions</span>
                    <button
                      onClick={clearAllHistory}
                      style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.35rem 0.6rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Clear All
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {sessions.map(session => (
                      <div
                        key={session.id}
                        onClick={() => { loadSession(session.id); onClose(); }}
                        style={{
                          padding: '0.75rem',
                          background: currentSessionId === session.id ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
                          border: currentSessionId === session.id ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {session.title}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                              {session.rag_name && <span style={{ marginRight: '0.5rem' }}>📚 {session.rag_name}</span>}
                              {session.message_count} messages • {formatTokenCount(session.total_tokens)} tokens
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', marginTop: '0.15rem' }}>
                              {formatRelativeTime(session.updated_at)}
                              {session.total_cost > 0 && <span style={{ marginLeft: '0.5rem' }}>• {formatCurrency(session.total_cost)}</span>}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.25rem' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* STATS MODE */}
          {panelMode === 'stats' && (
            <>
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <UsageDonut percent={budgetUsagePercent} size={48} strokeWidth={5} />
                  <div>
                    <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600 }}>{formatCurrency(embeddingCost)}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>of {formatCurrency(monthlyBudget)} budget used</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Tokens Used</div>
                    <div style={{ color: '#10b981', fontSize: '1rem', fontWeight: 600 }}>{formatTokenCount(budgetData?.embeddingTokens || 0)}</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Remaining</div>
                    <div style={{ color: remainingBudget > 1 ? '#10b981' : '#f59e0b', fontSize: '1rem', fontWeight: 600 }}>{formatCurrency(remainingBudget)}</div>
                  </div>
                </div>
              </div>

              {/* Embedding Model Info */}
              {selectedRag && (
                <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                    Current Embedding Model
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>🧠</span>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{embeddingModel?.name || selectedRag.embedding_model || 'Upstash BGE Base'}</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                        {selectedRag.embedding_dimensions} dimensions
                        {embeddingModel && <span> • ${embeddingModel.costPer1M}/1M tokens</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};
