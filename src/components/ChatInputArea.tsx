'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';
import { AdBanner } from './AdBanner';
import { ADS_CONFIG } from '../config/ads.config';
import {
  AI_MODELS,
  TOKEN_QUOTAS,
  formatTokenCount,
  formatCurrency,
  calculateSafeTokensForBudget,
} from '../config/ai-tokens.config';

interface Personality {
  id: string;
  name: string;
  icon: string;
  system_prompt: string;
  prompt_token_count: number;
}

interface AgentConnector {
  id: string;
  display_name: string;
  icon_url?: string;
  external_url?: string;
}

interface ConversationTokens {
  input: number;
  output: number;
}

// RAG collection for RAG mode
interface RAGCollection {
  id: string;
  name: string;
  icon: string;
  source_type: 'csv' | 'url';
  embedding_model: string | null;
}

interface ChatInputAreaProps {
  // Mode: 'chat' (default) or 'rag'
  mode?: 'chat' | 'rag';

  // Core input state
  message: string;
  setMessage: (message: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  placeholder?: string;

  // Model selection (chat mode)
  selectedModel?: string;
  setSelectedModel?: (model: string) => void;
  tier?: 'free' | 'pro' | 'plus';

  // Budget info
  remainingBudget: number;

  // Personalities (for token display)
  activePersonalities?: Personality[];

  // Optional: External agents
  externalAgents?: AgentConnector[];
  isExternalAgentSelected?: boolean;
  selectedAgentConnector?: AgentConnector | null;

  // Optional: Conversation token stats
  conversationTokens?: ConversationTokens;
  conversationCost?: number;
  showConversationStats?: boolean;

  // Optional: Custom label for send button
  sendButtonLabel?: string;

  // Optional: Settings button
  onSettingsClick?: () => void;
  showSettingsButton?: boolean;

  // Optional: Reasoning toggle
  enableReasoning?: boolean;
  onReasoningToggle?: () => void;
  showReasoningToggle?: boolean;

  // Optional: Personas toggle (chat mode)
  activePersonasCount?: number;
  onPersonasClick?: () => void;
  showPersonasToggle?: boolean;

  // Optional: RAG toggle (chat mode)
  activeRagCount?: number;
  onRagClick?: () => void;
  showRagToggle?: boolean;

  // Optional: Connectors toggle (chat mode)
  activeConnectorsCount?: number;
  onConnectorsClick?: () => void;
  showConnectorsToggle?: boolean;

  // Optional: Stop button callback (when loading)
  onStop?: () => void;

  // RAG mode specific props
  rags?: RAGCollection[];
  selectedRagId?: string | null;
  setSelectedRagId?: (id: string) => void;
  // Multi-select support for RAG Explorer
  selectedRagIds?: string[];
  toggleRagSelection?: (id: string) => void;
  sessionTokens?: number;
  sessionCost?: number;

  // History Memory toggle
  historyMemoryEnabled?: boolean;
  setHistoryMemoryEnabled?: (enabled: boolean) => void;
  onHistoryMemoryClick?: () => void;

  // Error message
  error?: string | null;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  mode = 'chat',
  message,
  setMessage,
  onSend,
  isLoading = false,
  isDisabled = false,
  placeholder,

  selectedModel = '',
  setSelectedModel,
  tier = 'free',

  remainingBudget,

  activePersonalities = [],

  externalAgents = [],
  isExternalAgentSelected = false,
  selectedAgentConnector = null,

  conversationTokens,
  conversationCost,
  showConversationStats = false,

  sendButtonLabel,

  onSettingsClick,
  showSettingsButton = false,

  enableReasoning = false,
  onReasoningToggle,
  showReasoningToggle = false,

  activePersonasCount = 0,
  onPersonasClick,
  showPersonasToggle = false,

  activeRagCount = 0,
  onRagClick,
  showRagToggle = false,

  activeConnectorsCount = 0,
  onConnectorsClick,
  showConnectorsToggle = false,

  onStop,

  // RAG mode props
  rags = [],
  selectedRagId,
  setSelectedRagId,
  selectedRagIds = [],
  toggleRagSelection,
  sessionTokens = 0,
  sessionCost = 0,

  // History Memory
  historyMemoryEnabled = false,
  setHistoryMemoryEnabled,
  onHistoryMemoryClick,

  error,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRagDropdown, setShowRagDropdown] = useState(false);
  const [adCollapsed, setAdCollapsed] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const ragDropdownRef = useRef<HTMLDivElement>(null);

  // Get available models for tier (chat mode)
  const quota = TOKEN_QUOTAS[tier];
  const availableModels = AI_MODELS.filter(m => quota.models.includes(m.id));
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  // Get selected RAG (rag mode)
  const selectedRag = rags.find(r => r.id === selectedRagId);

  // Token estimation (rough: ~4 chars per token)
  const estimateTokens = (text: string): number => {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  };

  const currentInputTokens = estimateTokens(message);
  const totalSystemPromptTokens = activePersonalities.reduce((sum, p) => sum + p.prompt_token_count, 0);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close RAG dropdown when clicking outside
  useEffect(() => {
    if (!showRagDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ragDropdownRef.current && !ragDropdownRef.current.contains(e.target as Node)) {
        setShowRagDropdown(false);
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRagDropdown]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  // Handle Enter key - Enter to send, Cmd/Ctrl+Enter for new line
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+Enter: insert new line
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = message.substring(0, start) + '\n' + message.substring(end);
        setMessage(newValue);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
          adjustTextareaHeight();
        }, 0);
      } else if (!e.shiftKey) {
        // Enter without modifiers: send
        e.preventDefault();
        onSend();
      }
    }
  }, [message, setMessage, onSend, adjustTextareaHeight]);

  // Placeholder text
  const getPlaceholder = () => {
    if (mode === 'rag') {
      return selectedRag ? `Search ${selectedRag.name}...` : 'Select a knowledge base first';
    }
    return isExternalAgentSelected && selectedAgentConnector
      ? `Message ${selectedAgentConnector.display_name}...`
      : `Message ${selectedModelData?.name || 'AI'}...`;
  };

  // Can send check - for RAG mode, allow if either single or multi-select has selections
  const hasRagSelection = selectedRagIds.length > 0 || selectedRagId;
  const canSend = mode === 'rag'
    ? !isDisabled && !isLoading && message.trim() && hasRagSelection
    : !isDisabled && !isLoading && message.trim();

  return (
    <div style={{ width: '100%' }}>
      {/* Collapsible ad banner - disappears completely when hidden */}
      {!adCollapsed && (
        <div style={{ marginBottom: '0.5rem' }}>
          {/* Hide button */}
          <button
            onClick={() => setAdCollapsed(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              width: '100%',
              padding: '0.5rem',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.25) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px 8px 0 0',
              color: 'rgba(255,255,255,0.85)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.35) 100%)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.25) 100%)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>✕</span>
            <span>Hide Ad</span>
          </button>
          {/* Ad content */}
          <div style={{ borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <AdBanner slot={ADS_CONFIG.slots.chatInputArea} format="horizontal" delay={1000} />
          </div>
        </div>
      )}

      {/* Session stats for RAG mode */}
      {mode === 'rag' && sessionTokens > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.7rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            Session:
            <span style={{ color: '#10b981', marginLeft: '0.35rem' }}>{formatTokenCount(sessionTokens)} tokens</span>
            {sessionCost > 0 && (
              <span style={{ color: '#a78bfa', marginLeft: '0.5rem' }}>• {formatCurrency(sessionCost)}</span>
            )}
          </span>
        </div>
      )}

      {/* Conversation token stats for chat mode */}
      {mode === 'chat' && showConversationStats && conversationTokens && (conversationTokens.input > 0 || conversationTokens.output > 0) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.7rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            Conversation:
            <span style={{ color: '#10b981', marginLeft: '0.35rem' }}>↑ {formatTokenCount(conversationTokens.input)} in</span>
            <span style={{ color: '#60a5fa', marginLeft: '0.5rem' }}>↓ {formatTokenCount(conversationTokens.output)} out</span>
            {conversationCost !== undefined && conversationCost > 0 && (
              <span style={{ color: '#a78bfa', marginLeft: '0.5rem' }}>• {formatCurrency(conversationCost)}</span>
            )}
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.5rem', color: '#ef4444', fontSize: '0.8rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        {/* Settings button - left side */}
        {showSettingsButton && onSettingsClick && (
          <button
            onClick={onSettingsClick}
            title="Settings"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              width: '48px',
              height: '48px',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}

        {/* Textarea with token counter */}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              const textarea = e.target;
              textarea.style.height = 'auto';
              textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || getPlaceholder()}
            disabled={isDisabled || isLoading || (mode === 'rag' && !hasRagSelection)}
            rows={1}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              paddingRight: '5rem',
              color: '#fff',
              fontSize: '1rem',
              lineHeight: 1.4,
              resize: 'none',
              minHeight: '44px',
              maxHeight: '120px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {/* Live token counter */}
          {(currentInputTokens > 0 || totalSystemPromptTokens > 0) && (
            <div style={{ position: 'absolute', right: '0.75rem', bottom: '0.75rem', display: 'flex', gap: '0.25rem', fontSize: '0.65rem', pointerEvents: 'none' }}>
              {currentInputTokens > 0 && (
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{currentInputTokens}</span>
              )}
              {totalSystemPromptTokens > 0 && (
                <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>+{totalSystemPromptTokens} 🎭</span>
              )}
            </div>
          )}
        </div>

        {/* Send/Stop button */}
        {isLoading && onStop ? (
          <button
            onClick={onStop}
            title="Stop (cancel request)"
            style={{
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 'none',
              borderRadius: '12px',
              width: '48px',
              height: '48px',
              padding: 0,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            aria-label={mode === 'rag' ? 'Search' : 'Send'}
            title={isLoading ? 'Sending...' : mode === 'rag' ? 'Search (Enter)' : 'Send (Enter)'}
            style={{
              background: mode === 'rag'
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #f59e0b, #ea580c)',
              border: 'none',
              borderRadius: '12px',
              width: sendButtonLabel ? 'auto' : '48px',
              height: '48px',
              padding: sendButtonLabel ? '0 1rem' : 0,
              color: '#fff',
              cursor: !canSend ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: !canSend ? 0.5 : 1,
              flexShrink: 0,
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            {isLoading ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : sendButtonLabel ? (
              <span style={{ fontSize: '1.5rem' }}>{sendButtonLabel}</span>
            ) : mode === 'rag' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Selector row - Model selector (chat) or RAG selector (rag) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        {mode === 'rag' ? (
          /* RAG selector for RAG mode */
          <div ref={ragDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowRagDropdown(!showRagDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: selectedRagIds.length > 1 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.08)',
                border: selectedRagIds.length > 1 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
                color: selectedRagIds.length > 1 ? '#10b981' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                transition: 'all 0.2s',
              }}
            >
              <span>{selectedRag?.icon || '📚'}</span>
              <span>
                {selectedRagIds.length > 1
                  ? `${selectedRagIds.length} sources selected`
                  : selectedRag?.name || 'Select knowledge base'}
              </span>
              <span style={{ marginLeft: '0.25rem', opacity: 0.5 }}>▾</span>
            </button>

            {showRagDropdown && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '4px',
                background: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 100,
                minWidth: '260px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
              }}>
                {toggleRagSelection && (
                  <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                    Select multiple sources (click checkboxes)
                  </div>
                )}
                {rags.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center' }}>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: 0 }}>No knowledge bases</p>
                    <Link href="/dashboard/rag-import" style={{ color: '#10b981', fontSize: '0.75rem' }}>
                      Create one →
                    </Link>
                  </div>
                ) : (
                  rags.map(rag => {
                    const isSelected = toggleRagSelection
                      ? selectedRagIds.includes(rag.id)
                      : rag.id === selectedRagId;
                    return (
                      <button
                        key={rag.id}
                        onClick={() => {
                          if (toggleRagSelection) {
                            toggleRagSelection(rag.id);
                          } else {
                            setSelectedRagId?.(rag.id);
                            setShowRagDropdown(false);
                          }
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                          border: 'none',
                          color: isSelected ? '#10b981' : 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          textAlign: 'left',
                        }}
                      >
                        {toggleRagSelection && (
                          <span style={{
                            width: '16px', height: '16px', borderRadius: '4px',
                            border: isSelected ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.3)',
                            background: isSelected ? '#10b981' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.65rem', color: '#fff',
                          }}>
                            {isSelected && '✓'}
                          </span>
                        )}
                        <span>{rag.icon}</span>
                        <span style={{ flex: 1 }}>{rag.name}</span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                          {rag.source_type}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : (
          /* Model selector for chat mode */
          <div ref={modelDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                transition: 'all 0.2s',
              }}
            >
              {isExternalAgentSelected && selectedAgentConnector ? (
                <>
                  <FaviconImage iconUrl={selectedAgentConnector.icon_url} baseUrl={selectedAgentConnector.external_url?.startsWith('http') ? selectedAgentConnector.external_url : undefined} size={14} fallbackEmoji="🤖" />
                  <span>{selectedAgentConnector.display_name}</span>
                </>
              ) : (
                <>
                  <span>{selectedModelData?.icon}</span>
                  <span>{selectedModelData?.name}</span>
                </>
              )}
              <span style={{ marginLeft: '0.25rem', opacity: 0.5 }}>▾</span>
            </button>

            {showModelDropdown && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '4px',
                background: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 100,
                minWidth: '180px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
              }}>
                <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>AI Models</div>
                {availableModels.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedModel?.(m.id); setShowModelDropdown(false); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: selectedModel === m.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                      border: 'none',
                      color: selectedModel === m.id ? '#f59e0b' : 'rgba(255,255,255,0.8)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      textAlign: 'left',
                    }}
                  >
                    <span>{m.icon}</span>
                    <span>{m.name}</span>
                  </button>
                ))}

                {externalAgents.length > 0 && (
                  <>
                    <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>External Agents</div>
                    {externalAgents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => { setSelectedModel?.(`agent:${agent.id}`); setShowModelDropdown(false); }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: selectedModel === `agent:${agent.id}` ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                          border: 'none',
                          color: selectedModel === `agent:${agent.id}` ? '#a78bfa' : 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          textAlign: 'left',
                        }}
                      >
                        <FaviconImage iconUrl={agent.icon_url} baseUrl={agent.external_url?.startsWith('http') ? agent.external_url : undefined} size={16} fallbackEmoji="🤖" />
                        <span>{agent.display_name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Feature toggle buttons (chat mode only) */}
        {mode === 'chat' && (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {showPersonasToggle && onPersonasClick && (
              <button
                onClick={onPersonasClick}
                title={activePersonasCount > 0 ? `${activePersonasCount} persona${activePersonasCount > 1 ? 's' : ''} active (click to manage)` : 'No personas active (click to add)'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: activePersonasCount > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.08)',
                  border: activePersonasCount > 0 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '0.25rem 0.4rem',
                  color: activePersonasCount > 0 ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s',
                }}
              >
                🎭
                {activePersonasCount > 0 && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{activePersonasCount}</span>
                )}
              </button>
            )}

            {showReasoningToggle && (
              <button
                onClick={onReasoningToggle}
                disabled={!onReasoningToggle}
                title={!onReasoningToggle ? 'Reasoning always enabled' : enableReasoning ? 'Reasoning enabled (click to disable)' : 'Enable reasoning for tool orchestration'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: enableReasoning ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.08)',
                  border: enableReasoning ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '0.25rem 0.4rem',
                  color: enableReasoning ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                  cursor: onReasoningToggle ? 'pointer' : 'default',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s',
                  opacity: !onReasoningToggle ? 0.8 : 1,
                }}
              >
                🧠
              </button>
            )}

            {showRagToggle && onRagClick && (
              <button
                onClick={onRagClick}
                title={activeRagCount > 0 ? `${activeRagCount} knowledge base${activeRagCount > 1 ? 's' : ''} active (click to manage)` : 'No knowledge bases active (click to add)'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: activeRagCount > 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.08)',
                  border: activeRagCount > 0 ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '0.25rem 0.4rem',
                  color: activeRagCount > 0 ? '#10b981' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M8 7h8" />
                  <path d="M8 11h8" />
                  <path d="M8 15h4" />
                </svg>
                {activeRagCount > 0 && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{activeRagCount}</span>
                )}
              </button>
            )}

            {showConnectorsToggle && onConnectorsClick && (
              <button
                onClick={onConnectorsClick}
                title={activeConnectorsCount > 0 ? `${activeConnectorsCount} connector${activeConnectorsCount > 1 ? 's' : ''} active (click to manage)` : 'No connectors active (click to add)'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: activeConnectorsCount > 0 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.08)',
                  border: activeConnectorsCount > 0 ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '0.25rem 0.4rem',
                  color: activeConnectorsCount > 0 ? '#3b82f6' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4" />
                  <path d="M12 18v4" />
                  <path d="M4.93 4.93l2.83 2.83" />
                  <path d="M16.24 16.24l2.83 2.83" />
                  <path d="M2 12h4" />
                  <path d="M18 12h4" />
                  <path d="M4.93 19.07l2.83-2.83" />
                  <path d="M16.24 7.76l2.83-2.83" />
                </svg>
                {activeConnectorsCount > 0 && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{activeConnectorsCount}</span>
                )}
              </button>
            )}

            {/* History Memory toggle */}
            {setHistoryMemoryEnabled && (
              <button
                onClick={() => setHistoryMemoryEnabled(!historyMemoryEnabled)}
                title={historyMemoryEnabled ? "History Memory enabled - click to disable" : "History Memory disabled - click to enable semantic context injection"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: historyMemoryEnabled ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.08)',
                  border: historyMemoryEnabled ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '0.25rem 0.4rem',
                  color: historyMemoryEnabled ? '#10b981' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s',
                }}
              >
                📜
              </button>
            )}
          </div>
        )}

        {/* Token/budget info */}
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
          {mode === 'rag' ? (
            <>{formatCurrency(remainingBudget)} remaining</>
          ) : isExternalAgentSelected ? (
            '∞ tokens (free)'
          ) : (
            <>~{formatTokenCount(calculateSafeTokensForBudget(selectedModel, remainingBudget))} tokens • {formatCurrency(remainingBudget)} left</>
          )}
        </span>

        {/* Helper text */}
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}>
          Enter to {mode === 'rag' ? 'search' : 'send'} • ⌘+Enter for new line
        </span>
      </div>
    </div>
  );
};

