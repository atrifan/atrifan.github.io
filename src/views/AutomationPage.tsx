'use client';

import { useState } from 'react';
import Link from 'next/link';
import { View } from '@adobe/react-spectrum';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';

interface AutomationPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

// Available tools for automation
const AVAILABLE_TOOLS = [
  { id: 'cut', name: 'Weight Loss Planner', icon: '📉', category: 'Health' },
  { id: 'sleep', name: 'Sleep Calculator', icon: '😴', category: 'Health' },
  { id: 'stack', name: 'Budget Calculator', icon: '💰', category: 'Money' },
  { id: 'tip', name: 'Tip Calculator', icon: '🍽️', category: 'Money' },
  { id: 'risk', name: 'Trading Risk', icon: '⚠️', category: 'Money' },
  { id: 'zone', name: 'Time Zone Converter', icon: '🌍', category: 'Time' },
  { id: 'convert', name: 'Unit Converter', icon: '🔄', category: 'Utilities' },
  { id: 'decide', name: 'Decision Maker', icon: '🤔', category: 'Fun' },
];

// Mock saved automations
const SAVED_AUTOMATIONS = [
  { id: '1', name: 'Morning Routine', description: 'Calculate sleep, check weather, plan day', tools: ['sleep', 'zone'], runs: 45 },
  { id: '2', name: 'Trading Setup', description: 'Calculate position size and risk for trades', tools: ['risk', 'percent'], runs: 23 },
];

// Suggested automations based on natural language
const SUGGESTIONS = [
  { query: 'Help me plan my weight loss journey', tools: ['cut', 'sleep', 'stack'], description: 'Combines weight loss planning with sleep optimization and budget for healthy food' },
  { query: 'Calculate my trading risk and position size', tools: ['risk', 'percent', 'convert'], description: 'Full trading risk management with position sizing and currency conversion' },
  { query: 'Plan my international meeting schedule', tools: ['zone', 'days', 'when'], description: 'Time zone conversion with countdown and date calculations' },
];

export const AutomationPage: React.FC<AutomationPageProps> = ({ isLoggedIn, isPro, isPlus }) => {
  const [query, setQuery] = useState('');
  const [suggestedTools, setSuggestedTools] = useState<string[]>([]);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [automationName, setAutomationName] = useState('');

  const canAccessPro = isPro || isPlus;

  const handleQuerySubmit = () => {
    if (!query.trim()) return;
    // Mock AI suggestion - in real implementation, this would call an AI endpoint
    const matchedSuggestion = SUGGESTIONS.find(s => 
      query.toLowerCase().includes('weight') || query.toLowerCase().includes('trading') || query.toLowerCase().includes('meeting')
    );
    if (matchedSuggestion) {
      setSuggestedTools(matchedSuggestion.tools);
      setShowSuggestion(true);
    } else {
      // Default suggestion
      setSuggestedTools(['stack', 'convert', 'decide']);
      setShowSuggestion(true);
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src="/tulzo-logo.png" alt="Tulzo" width={32} height={32} style={{ borderRadius: '6px' }} />
          </Link>
          <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, background: 'linear-gradient(135deg, #f59e0b, #ea580c, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Automation
          </h1>
          {!canAccessPro && (
            <span style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>PRO</span>
          )}
        </div>

        {/* Pro Access Required Banner */}
        {!canAccessPro && (
          <div style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.2))', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <h2 style={{ color: '#fff', fontSize: '1.25rem', margin: '0 0 0.5rem' }}>🔒 Pro Subscription Required</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem' }}>
              {isLoggedIn ? 'Upgrade to Pro to create and run automations.' : 'Sign in and upgrade to Pro to unlock Automation.'}
            </p>
            <Link href={isLoggedIn ? '/pricing' : '/sign-in'} style={{ textDecoration: 'none' }}>
              <button style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '10px', padding: '0.75rem 2rem', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                {isLoggedIn ? 'Upgrade to Pro' : 'Sign In'}
              </button>
            </Link>
          </div>
        )}

        {/* Natural Language Input */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>✨ Describe your automation</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
            Tell us what you want to automate in plain English, and we'll suggest the right tools.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Help me track my weight loss and budget for healthy meals..."
              style={{ flex: 1, minWidth: '250px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.875rem 1rem', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
              onKeyDown={(e) => e.key === 'Enter' && handleQuerySubmit()}
            />
            <button onClick={handleQuerySubmit} style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '12px', padding: '0 1.5rem', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Suggest Tools ⚡
            </button>
          </div>

          {/* Quick suggestions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => { setQuery(s.query); setSuggestedTools(s.tools); setShowSuggestion(true); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '0.4rem 0.8rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.8rem' }}>
                {s.query}
              </button>
            ))}
          </div>
        </div>

