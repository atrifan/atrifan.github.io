'use client';

import { useState } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';

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

// Mock connectors
const CONNECTORS = [
  { id: 'tulzo', name: 'Tulzo Tools', icon: '🔧', connected: true },
  { id: 'google', name: 'Google Drive', icon: '📁', connected: false },
  { id: 'notion', name: 'Notion', icon: '📝', connected: false },
  { id: 'slack', name: 'Slack', icon: '💬', connected: false },
];

export const ChatPage: React.FC<ChatPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  const [selectedModel, setSelectedModel] = useState('llama-3.1');
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);

  const canAccessPro = isPro || isPlus;
  const selectedModelData = AI_MODELS.find(m => m.id === selectedModel);

  return (
    <View minHeight="100vh" UNSAFE_style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '1rem' }}>
        {/* Top Banner */}
        <AdBanner slot={ADS_CONFIG.slots.toolTop} format="horizontal" style={{ marginBottom: '1rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img src="/tulzo-logo.png" alt="Tulzo" width={32} height={32} style={{ borderRadius: '6px' }} />
            </Link>
            <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, background: 'linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              AI Chat
            </h1>
            {!canAccessPro && (
              <span style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>PRO</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowHistory(!showHistory)} style={{ background: showHistory ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
              📜 History
            </button>
            <button onClick={() => setShowConnectors(!showConnectors)} style={{ background: showConnectors ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
              🔌 Connectors
            </button>
          </div>
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
                  <h3 style={{ color: '#fff', fontSize: '0.9rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🔌 Connectors</h3>
                  {CONNECTORS.map(conn => (
                    <div key={conn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{conn.icon}</span>
                        <span style={{ color: '#fff', fontSize: '0.85rem' }}>{conn.name}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '10px', background: conn.connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: conn.connected ? '#10b981' : 'rgba(255,255,255,0.5)' }}>
                        {conn.connected ? 'Connected' : 'Connect'}
                      </span>
                    </div>
                  ))}
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

