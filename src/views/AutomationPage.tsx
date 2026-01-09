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

interface AutomationPageProps {
  isLoggedIn: boolean;
  isPro: boolean;
  isPlus: boolean;
}

// Available tools for automation - all types
const AVAILABLE_TOOLS = [
  { id: 'cut', name: 'Weight Loss Planner', icon: '📉', category: 'Health', type: 'native' },
  { id: 'sleep', name: 'Sleep Calculator', icon: '😴', category: 'Health', type: 'native' },
  { id: 'stack', name: 'Budget Calculator', icon: '💰', category: 'Money', type: 'native' },
  { id: 'tip', name: 'Tip Calculator', icon: '🍽️', category: 'Money', type: 'native' },
  { id: 'risk', name: 'Trading Risk', icon: '⚠️', category: 'Money', type: 'native' },
  { id: 'zone', name: 'Time Zone Converter', icon: '🌍', category: 'Time', type: 'native' },
  { id: 'convert', name: 'Unit Converter', icon: '🔄', category: 'Utilities', type: 'native' },
  { id: 'decide', name: 'Decision Maker', icon: '🤔', category: 'Fun', type: 'native' },
];

// Mock saved automations with schedule
const SAVED_AUTOMATIONS = [
  { id: '1', name: 'Morning Routine', description: 'Calculate sleep, check weather, plan day', tools: ['sleep', 'zone'], runs: 45, schedule: 'Daily at 7:00 AM' },
  { id: '2', name: 'Trading Setup', description: 'Calculate position size and risk for trades', tools: ['risk', 'percent'], runs: 23, schedule: null },
];

// Schedule options
const SCHEDULE_OPTIONS = [
  { id: 'manual', label: 'Manual (Run on demand)', icon: '▶️' },
  { id: 'daily', label: 'Daily', icon: '📅' },
  { id: 'weekly', label: 'Weekly', icon: '📆' },
  { id: 'monthly', label: 'Monthly', icon: '🗓️' },
  { id: 'cron', label: 'Custom (Cron)', icon: '⚙️' },
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
  const [selectedSchedule, setSelectedSchedule] = useState('manual');

  const canAccessPro = isPro || isPlus;

  useEffect(() => {
    applySEO('automation');
  }, []);

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

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <UpgradeModal
          isOpen={true}
          title="Automation - Pro Feature"
          featureName="Workflow Automation"
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
              background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              AUTOMATION
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
        <AdBanner slot={ADS_CONFIG.slots.automationTop} format="horizontal" />

        {/* Hero Header - Centered like CUT */}
        <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
          <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
            {/* Automation Icon */}
            <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="autoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="50%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="url(#autoGradient)" opacity="0.2" />
              <path d="M35 30L50 20L65 30V45L50 55L35 45V30Z" stroke="url(#autoGradient)" strokeWidth="3" fill="none" />
              <path d="M35 55L50 45L65 55V70L50 80L35 70V55Z" stroke="url(#autoGradient)" strokeWidth="3" fill="none" />
              <circle cx="50" cy="50" r="5" fill="url(#autoGradient)" />
              <path d="M50 35V45M50 55V65" stroke="url(#autoGradient)" strokeWidth="2" />
            </svg>
          </div>

          <h1 style={{
            fontSize: 'clamp(1.75rem, 6vw, 4rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em',
          }}>
            AUTOMATION
          </h1>

          <p style={{
            fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.7)',
            maxWidth: '500px',
            margin: '0 auto 1rem',
          }}>
            Build workflows with natural language and schedule them to run automatically
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

        {/* Suggested Tools Result */}
        {showSuggestion && (
          <div style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(234, 88, 12, 0.1))', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#f59e0b', fontSize: '1rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚡ Suggested Tools for Your Automation
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              {suggestedTools.map(toolId => {
                const tool = AVAILABLE_TOOLS.find(t => t.id === toolId);
                if (!tool) return null;
                return (
                  <div key={toolId} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{tool.icon}</span>
                    <div>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{tool.name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>{tool.category}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scheduler Section */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <h4 style={{ color: '#fff', fontSize: '0.85rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⏰ Schedule
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {SCHEDULE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedSchedule(opt.id)}
                    style={{
                      background: selectedSchedule === opt.id ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : 'rgba(255,255,255,0.08)',
                      border: selectedSchedule === opt.id ? 'none' : '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {selectedSchedule !== 'manual' && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="time"
                    defaultValue="09:00"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.5rem', color: '#fff', fontSize: '0.85rem' }}
                  />
                  {selectedSchedule === 'weekly' && (
                    <select style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.5rem', color: '#fff', fontSize: '0.85rem' }}>
                      <option value="mon">Monday</option>
                      <option value="tue">Tuesday</option>
                      <option value="wed">Wednesday</option>
                      <option value="thu">Thursday</option>
                      <option value="fri">Friday</option>
                      <option value="sat">Saturday</option>
                      <option value="sun">Sunday</option>
                    </select>
                  )}
                  {selectedSchedule === 'cron' && (
                    <input
                      type="text"
                      placeholder="0 9 * * *"
                      style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.5rem', color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}
                    />
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                placeholder="Name your automation..."
                style={{ flex: 1, minWidth: '200px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              />
              <button style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', padding: '0.75rem 1.5rem', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                💾 Save Automation
              </button>
              <button onClick={() => setShowSuggestion(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', padding: '0.75rem 1rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
              This is a mockup. Full functionality coming soon.
            </p>
          </div>
        )}

        {/* Saved Automations */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📁 Your Automations
          </h2>
          {SAVED_AUTOMATIONS.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {SAVED_AUTOMATIONS.map(auto => (
                <div key={auto.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ color: '#fff', fontSize: '1rem', margin: 0, fontWeight: 600 }}>{auto.name}</h3>
                    <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.7rem' }}>
                      {auto.runs} runs
                    </span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{auto.description}</p>
                  {/* Schedule indicator */}
                  {auto.schedule && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem' }}>⏰</span>
                      <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>{auto.schedule}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {auto.tools.map(toolId => {
                      const tool = AVAILABLE_TOOLS.find(t => t.id === toolId);
                      return tool ? (
                        <span key={toolId} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                          {tool.icon} {tool.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b, #ea580c)', border: 'none', borderRadius: '8px', padding: '0.5rem', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                      ▶ Run
                    </button>
                    <button style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.8rem' }} title="Schedule">
                      ⏰
                    </button>
                    <button style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.8rem' }} title="Edit">
                      ✏️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.5)' }}>
              <p>No automations yet. Create your first one above!</p>
            </div>
          )}
        </div>

        {/* Available Tools */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 1rem' }}>🔧 Available Tools</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
            Native tools, MCP servers, GraphQL, Swagger/OpenAPI, REST APIs, and A2A agents
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {AVAILABLE_TOOLS.map(tool => (
              <div key={tool.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{tool.icon}</span>
                <div>
                  <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>{tool.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>{tool.category}</span>
                    <span style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea', padding: '0.1rem 0.3rem', borderRadius: '4px', fontSize: '0.55rem' }}>{tool.type}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Banner */}
        <AdBanner slot={ADS_CONFIG.slots.automationBottom} format="horizontal" style={{ marginTop: '1.5rem' }} />
        <Footer />
      </View>
    </View>
  );
};

