'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { UpgradeModal } from '../components/UpgradeModal';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface ChatPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

// AI Models available
const AI_MODELS = [
  { id: 'llama-3.1', name: 'Llama 3.1', provider: 'Meta', free: true, icon: '🦙' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI', free: false, icon: '🤖' },
  { id: 'claude-4', name: 'Claude 4', provider: 'Anthropic', free: false, icon: '🧠' },
  { id: 'gemini-3', name: 'Gemini 3', provider: 'Google', free: false, icon: '✨' },
  { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'Anthropic', free: false, icon: '🎵' },
  { id: 'o1', name: 'OpenAI o1', provider: 'OpenAI', free: false, icon: '🔮' },
  { id: 'o3-mini', name: 'OpenAI o3-mini', provider: 'OpenAI', free: false, icon: '⚡' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', free: false, icon: '🔍' },
  { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'DeepSeek', free: false, icon: '🚀' },
  { id: 'gemini-image', name: 'Gemini Image Gen', provider: 'Google', free: false, icon: '🎨' },
];

// Mock chat history
const MOCK_HISTORY = [
  { id: '1', title: 'Budget planning help', date: '2 hours ago' },
  { id: '2', title: 'Sleep schedule optimization', date: 'Yesterday' },
  { id: '3', title: 'Trading risk calculation', date: '3 days ago' },
];

// External connectors - MCP servers and A2A agents
const CONNECTORS = [
  { id: 'my-mcp', name: 'My MCP Servers', icon: '🔧', type: 'mcp', connected: true, description: 'Your custom MCP servers' },
  { id: 'marketplace', name: 'MCP Marketplace', icon: '🏪', type: 'mcp', connected: false, description: 'Browse community servers' },
  { id: 'external-mcp', name: 'External MCP URL', icon: '🔗', type: 'mcp', connected: false, description: 'Connect via URL' },
  { id: 'a2a-agents', name: 'A2A Agents', icon: '🤖', type: 'a2a', connected: false, description: 'Connect to other agents' },
];

// Available tools for conversation - all types
const TOOL_CATEGORIES = [
  { id: 'native', name: 'Native Tools', icon: '⚡', count: 20, description: 'Built-in Tulzo calculators' },
  { id: 'mcp', name: 'MCP Servers', icon: '🔧', count: 0, description: 'Your custom MCP tools' },
  { id: 'graphql', name: 'GraphQL APIs', icon: '◈', count: 0, description: 'GraphQL endpoints' },
  { id: 'swagger', name: 'Swagger/OpenAPI', icon: '📋', count: 0, description: 'REST API specs' },
  { id: 'rest', name: 'REST APIs', icon: '🌐', count: 0, description: 'Custom REST endpoints' },
  { id: 'a2a', name: 'A2A Agents', icon: '🤖', count: 0, description: 'Agent-to-Agent tools' },
];

export const ChatPage: React.FC<ChatPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  const [selectedModel, setSelectedModel] = useState('llama-3.1');
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const canAccessPro = isPro || isPlus;
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  useEffect(() => {
    applySEO('chat');
  }, []);

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <UpgradeModal
          isOpen={true}
          title="AI Chat - Pro Feature"
          featureName="AI Chat with multiple models"
          showCloseButton={false}
        />
        <View maxWidth="56rem" marginX="auto" UNSAFE_style={{ filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              CHAT
            </h1>
          </View>
        </View>
        <Footer />
      </View>
    );
  }

  return (
    <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <View maxWidth="56rem" marginX="auto">
        {/* Back Button */}
        <div style={{ marginBottom: '2rem' }}>
          <BackToTools />
        </div>

        {/* Top Ad */}
        <AdBanner slot={ADS_CONFIG.slots.chatTop} format="horizontal" />

        {/* Hero Header - Centered like CUT */}
        <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
          <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
            {/* Chat Icon */}
            <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="chatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="url(#chatGradient)" opacity="0.2" />
              <path d="M30 35C30 31.6863 32.6863 29 36 29H64C67.3137 29 70 31.6863 70 35V55C70 58.3137 67.3137 61 64 61H45L35 71V61H36C32.6863 61 30 58.3137 30 55V35Z" stroke="url(#chatGradient)" strokeWidth="3" fill="none" />
              <circle cx="42" cy="45" r="3" fill="url(#chatGradient)" />
              <circle cx="50" cy="45" r="3" fill="url(#chatGradient)" />
              <circle cx="58" cy="45" r="3" fill="url(#chatGradient)" />
            </svg>
          </div>

          <h1 style={{
            fontSize: 'clamp(1.75rem, 6vw, 4rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em',
          }}>
            CHAT
          </h1>

          <p style={{
            fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.7)',
            maxWidth: '500px',
            margin: '0 auto 1rem',
          }}>
            Multi-model AI assistant with access to all your tools
          </p>

          {!canAccessPro && (
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              padding: '0.3rem 0.8rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-block',
            }}>
              PRO FEATURE
            </span>
          )}
        </View>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ background: showHistory ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            📜 History
          </button>
          <button onClick={() => setShowTools(!showTools)} style={{ background: showTools ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            🔧 Tools
          </button>
          <button onClick={() => setShowConnectors(!showConnectors)} style={{ background: showConnectors ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            🔌 Connectors
          </button>
        </div>

        {/* Pro Access Required Banner */}
        {!canAccessPro && (
          <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', margin: '0 0 0.5rem' }}>🔒 Pro Subscription Required</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem' }}>
              {isLoggedIn ? 'Upgrade to Pro to access all AI models and features.' : 'Sign in and upgrade to Pro to unlock AI Chat.'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Free users can try <strong style={{ color: '#10b981' }}>Llama 3.1</strong> with limited features.
            </p>
            <Link href={isLoggedIn ? '/pricing' : '/sign-in'} style={{ textDecoration: 'none' }}>
              <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '10px', padding: '0.75rem 2rem', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                {isLoggedIn ? 'Upgrade to Pro' : 'Sign In'}
              </button>
            </Link>
          </div>
        )}

        {/* Tools Panel */}
        {showTools && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem' }}>
            <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 1rem' }}>🔧 Available Tools for Conversation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {TOOL_CATEGORIES.map(cat => (
                <div key={cat.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{cat.icon}</span>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{cat.name}</span>
                    <span style={{ marginLeft: 'auto', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', padding: '0.1rem 0.4rem', borderRadius: '8px', fontSize: '0.7rem' }}>{cat.count}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: 0 }}>{cat.description}</p>
                </div>
              ))}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.75rem' }}>
              Add more tools via Dashboard → MCP Creator, Swagger Import, GraphQL Import, or A2A Agents
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: showHistory || showConnectors ? '280px 1fr' : '1fr', gap: '1rem' }}>
          {/* Sidebar */}
          {(showHistory || showConnectors) && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              {showHistory && (
                <div>
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📜 Chat History</h3>
                  {MOCK_HISTORY.map(chat => (
                    <div key={chat.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{chat.title}</div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{chat.date}</div>
                    </div>
                  ))}
                  <button style={{ width: '100%', background: 'rgba(139, 92, 246, 0.2)', border: '1px dashed rgba(139, 92, 246, 0.5)', borderRadius: '8px', padding: '0.75rem', color: '#a78bfa', cursor: 'pointer', marginTop: '0.5rem' }}>+ New Chat</button>
                </div>
              )}
              {showConnectors && (
                <div style={{ marginTop: showHistory ? '1.5rem' : 0 }}>
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🔌 External Connectors</h3>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', margin: '0 0 1rem' }}>Connect to external MCP servers and A2A agents</p>
                  {CONNECTORS.map(conn => (
                    <div key={conn.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{conn.icon}</span>
                          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{conn.name}</span>
                        </div>
                        <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '8px', background: conn.type === 'mcp' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: conn.type === 'mcp' ? '#667eea' : '#f59e0b' }}>
                          {conn.type.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', margin: '0 0 0.5rem' }}>{conn.description}</p>
                      <button style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: 'none', background: conn.connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: conn.connected ? '#10b981' : '#a78bfa', fontSize: '0.75rem', cursor: 'pointer' }}>
                        {conn.connected ? '✓ Connected' : 'Connect'}
                      </button>
                    </div>
                  ))}
                  <button style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.75rem', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                    + Add External MCP Server
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Main Chat Area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Model Selector */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Model</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
                {AI_MODELS.map(model => {
                  const isDisabled = !model.free && !canAccessPro;
                  return (
                    <button key={model.id} onClick={() => !isDisabled && setSelectedModel(model.id)} disabled={isDisabled} style={{ background: selectedModel === model.id ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : isDisabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)', border: selectedModel === model.id ? 'none' : '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1, filter: isDisabled ? 'grayscale(1)' : 'none', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span>{model.icon}</span>
                        <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{model.name}</span>
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>{model.provider}</div>
                      {model.free && <span style={{ fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '8px', marginTop: '0.25rem', display: 'inline-block' }}>FREE</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chat Messages Area */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
              {/* Empty state */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{selectedModelData?.icon || '🤖'}</div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: '0 0 0.5rem' }}>Start chatting with {selectedModelData?.name}</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '400px' }}>
                  Ask questions, get help with calculations, or explore your connected tools.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                  {['Calculate my budget', 'Help me sleep better', 'What\'s my trading risk?', 'Convert units'].map(suggestion => (
                    <button key={suggestion} onClick={() => setMessage(suggestion)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '0.5rem 1rem', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '0.85rem' }}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Area */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Message ${selectedModelData?.name}...`}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.875rem 1rem', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
                  />
                  <button style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', borderRadius: '12px', padding: '0 1.5rem', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Send <span>→</span>
                  </button>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.75rem' }}>
                  This is a mockup. Full functionality coming soon.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Banner */}
        <AdBanner slot={ADS_CONFIG.slots.chatBottom} format="horizontal" style={{ marginTop: '1.5rem' }} />
        <Footer />
      </View>
    </View>
  );
};

