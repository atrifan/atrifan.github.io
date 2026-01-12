'use client';

import React, { useRef, useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';
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

interface ChatInputAreaProps {
  // Core input state
  message: string;
  setMessage: (message: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  placeholder?: string;

  // Model selection
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  tier: 'free' | 'pro' | 'plus';

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
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  message,
  setMessage,
  onSend,
  isLoading = false,
  isDisabled = false,
  placeholder,

  selectedModel,
  setSelectedModel,
  tier,

  remainingBudget,

  activePersonalities = [],

  externalAgents = [],
  isExternalAgentSelected = false,
  selectedAgentConnector = null,

  conversationTokens,
  conversationCost,
  showConversationStats = false,

  sendButtonLabel,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Get available models for tier
  const quota = TOKEN_QUOTAS[tier];
  const availableModels = AI_MODELS.filter(m => quota.models.includes(m.id));
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  // Token estimation (rough: ~4 chars per token)
  const estimateTokens = (text: string): number => {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  };

  const currentInputTokens = estimateTokens(message);
  const totalSystemPromptTokens = activePersonalities.reduce((sum, p) => sum + p.prompt_token_count, 0);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const defaultPlaceholder = isExternalAgentSelected && selectedAgentConnector
    ? `Message ${selectedAgentConnector.display_name}...`
    : `Message ${selectedModelData?.name || 'AI'}...`;

  return (
    <div style={{ width: '100%' }}>
      {/* Conversation token stats */}
      {showConversationStats && conversationTokens && (conversationTokens.input > 0 || conversationTokens.output > 0) && (
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

      {/* Input row */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
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
            placeholder={placeholder || defaultPlaceholder}
            disabled={isDisabled || isLoading}
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

        {/* Send button */}
        <button
          onClick={onSend}
          disabled={isDisabled || isLoading || !message.trim()}
          title={isLoading ? 'Sending...' : 'Send (Enter)'}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
            border: 'none',
            borderRadius: '12px',
            width: sendButtonLabel ? 'auto' : '48px',
            height: '48px',
            padding: sendButtonLabel ? '0 1rem' : 0,
            color: '#fff',
            cursor: isDisabled || isLoading || !message.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            opacity: isDisabled || isLoading || !message.trim() ? 0.5 : 1,
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
            <>{sendButtonLabel}</>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Model selector + Helper text */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        {/* Model selector button with dropdown */}
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

          {/* Dropdown menu - opens upward */}
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
              {/* AI Models Section */}
              <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>AI Models</div>
              {availableModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(m.id); setShowModelDropdown(false); }}
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

              {/* External Agents Section */}
              {externalAgents.length > 0 && (
                <>
                  <div style={{ padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>External Agents</div>
                  {externalAgents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => { setSelectedModel(`agent:${agent.id}`); setShowModelDropdown(false); }}
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

        {/* Token/budget info */}
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
          {isExternalAgentSelected ? (
            '∞ tokens (free)'
          ) : (
            <>~{formatTokenCount(calculateSafeTokensForBudget(selectedModel, remainingBudget))} tokens • {formatCurrency(remainingBudget)} left</>
          )}
        </span>

        {/* Helper text */}
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}>
          Enter to send • ⌘+Enter for new line
        </span>
      </div>
    </div>
  );
};

