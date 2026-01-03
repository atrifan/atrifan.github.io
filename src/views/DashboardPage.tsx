'use client';

import { useState, useEffect } from 'react';
import { View } from '@adobe/react-spectrum';
import { useUser, useClerk, useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';
import { isBillingEnabled } from '../config/billing.config';

// Dashboard Icon
const DashboardIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#dashGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="dashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#667eea" />
        <stop offset="100%" stopColor="#764ba2" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// Key Icon
const KeyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

interface DashboardCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, icon, children }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: 'clamp(1.25rem, 4vw, 2rem)',
    marginBottom: '1.5rem',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {icon}
      <h2 style={{ color: '#fff', fontSize: 'clamp(1.1rem, 3vw, 1.35rem)', fontWeight: 700, margin: 0 }}>{title}</h2>
    </div>
    {children}
  </div>
);

// Get time-based greeting
const getGreeting = (): { text: string; emoji: string } => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return { text: 'Good morning', emoji: '🌅' };
  } else if (hour >= 12 && hour < 17) {
    return { text: 'Good afternoon', emoji: '☀️' };
  } else if (hour >= 17 && hour < 21) {
    return { text: 'Good evening', emoji: '🌆' };
  } else {
    return { text: 'Good night', emoji: '🌙' };
  }
};

export const DashboardPage: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { has } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting());

  // Check if user has Pro plan using Clerk Billing's has() helper
  // This checks for an active subscription with the 'pro' plan feature
  const isPro = has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;

  // Update greeting every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user?.unsafeMetadata?.apiKey) {
      setApiKey(user.unsafeMetadata.apiKey as string);
    }
  }, [user]);

  const generateApiKey = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      // Call server-side API to generate encrypted key
      const response = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to generate API key');
      }

      const data = await response.json();
      setApiKey(data.apiKey);
      setShowApiKey(true);
    } catch (error) {
      console.error('Failed to generate API key:', error);
    }
    setGenerating(false);
  };

  const copyToClipboard = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMcpUrl = async () => {
    if (!apiKey) return;
    const mcpUrl = `https://tulzo.vercel.app/api/mcp/${apiKey}`;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isLoaded) {
    return (
      <View UNSAFE_style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: '#fff', fontSize: '1.25rem' }}>Loading...</div>
      </View>
    );
  }

  return (
    <View UNSAFE_style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      <Header />
      
      <main style={{ paddingTop: '5rem', paddingBottom: '3rem', maxWidth: '800px', margin: '0 auto', padding: '5rem 1rem 3rem' }}>
        {/* Welcome Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <DashboardIcon />
          <h1 style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0.75rem 0 0.5rem',
          }}>
            {greeting.emoji} {greeting.text}{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem', margin: 0 }}>
            {user?.primaryEmailAddress?.emailAddress}
          </p>
        </div>

        {/* Upgrade Banner - Only for Free users when billing is enabled */}
        {!isPro && isBillingEnabled() && (
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
            borderRadius: '16px',
            padding: '1.5rem 2rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
          }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
                ⭐ Unlock Pro Features
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', margin: 0 }}>
                Get API access, MCP server, and all premium tools
              </p>
            </div>
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <button style={{
                background: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '0.85rem 2rem',
                color: '#667eea',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                transition: 'transform 0.2s ease',
              }}>
                Get Pro Now
              </button>
            </Link>
          </div>
        )}

        {/* Ad Banner */}
        <AdBanner slot={ADS_CONFIG.slots.dashboardTop} style={{ marginBottom: '2rem' }} />

        {/* Current Plan Card */}
        <DashboardCard title="Your Plan" icon={
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: isPro ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
          }}>
            {isPro ? '⭐' : '🆓'}
          </div>
        }>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{
                display: 'inline-block',
                padding: '0.35rem 1rem',
                borderRadius: '20px',
                background: isPro ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
              }}>
                {isPro ? 'Pro' : 'Free'}
              </span>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>
                {isPro ? 'Full access to all features' : 'Basic tools only'}
              </p>
            </div>
            {isPro && isBillingEnabled() ? (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}>
                  Manage Subscription
                </button>
              </Link>
            ) : !isPro && isBillingEnabled() ? (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: '#fff',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}>
                  Upgrade to Pro
                </button>
              </Link>
            ) : null}
          </div>
        </DashboardCard>

        {/* API Keys Card */}
        <DashboardCard title="API Keys" icon={<KeyIcon />}>
          {isPro ? (
            <div>
              {apiKey ? (
                <div>
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '10px',
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: 'clamp(0.75rem, 2.5vw, 0.9rem)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ wordBreak: 'break-all' }}>
                      {showApiKey ? apiKey : '•'.repeat(32)}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.4rem 0.75rem',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {showApiKey ? '👁️ Hide' : '👁️ Show'}
                      </button>
                      <button
                        onClick={copyToClipboard}
                        style={{
                          background: copied ? '#10b981' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.4rem 0.75rem',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {copied ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                  </div>
                  
                  {/* MCP URL */}
                  <div style={{ marginTop: '1.25rem' }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
                      MCP Server URL (for Claude Desktop, Cursor, etc.):
                    </p>
                    <div style={{
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '10px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}>
                      <code style={{ color: '#60a5fa', fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', wordBreak: 'break-all' }}>
                        https://tulzo.vercel.app/api/mcp/{'<api_key>'}
                      </code>
                      <button
                        onClick={copyMcpUrl}
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.4rem 0.75rem',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        📋 Copy URL
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={generateApiKey}
                    disabled={generating}
                    style={{
                      marginTop: '1.25rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      borderRadius: '8px',
                      padding: '0.6rem 1.25rem',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                    }}
                  >
                    {generating ? 'Regenerating...' : '🔄 Regenerate Key'}
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>
                    Generate an API key to use Tulzo tools in your AI assistants.
                  </p>
                  <button
                    onClick={generateApiKey}
                    disabled={generating}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.75rem 2rem',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
                  >
                    {generating ? 'Generating...' : '🔑 Generate API Key'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Blurred section for free users */
            <div style={{
              filter: 'blur(6px)',
              opacity: 0.4,
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '10px',
                padding: '1rem',
                fontFamily: 'monospace',
                color: '#10b981',
                marginBottom: '1rem',
              }}>
                tlz_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
              }}>
                <code style={{ color: '#60a5fa', fontSize: '0.85rem' }}>
                  https://tulzo.vercel.app/api/mcp/...
                </code>
              </div>
            </div>
          )}
        </DashboardCard>

        {/* MCP Server Card (blurred for free) */}
        <DashboardCard title="MCP Server" icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        }>
          {isPro ? (
            <div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.95rem', margin: '0 0 1rem' }}>
                Use Tulzo tools directly in ChatGPT, Claude, Cursor, and other AI assistants.
              </p>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#10b981', fontSize: '1.25rem' }}>●</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Server Active</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
                  30+ tools available • Real-time calculations
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              filter: 'blur(6px)',
              opacity: 0.4,
              pointerEvents: 'none',
              userSelect: 'none',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.95rem', margin: '0 0 1rem' }}>
                Use Tulzo tools directly in ChatGPT, Claude, Cursor, and other AI assistants.
              </p>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#10b981', fontSize: '1.25rem' }}>●</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Server Active</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
                  30+ tools available • Real-time calculations
                </p>
              </div>
            </div>
          )}
        </DashboardCard>

        {/* Account Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '10px',
              padding: '0.75rem 1.5rem',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Bottom Ad */}
        <AdBanner slot={ADS_CONFIG.slots.dashboardFooter} style={{ marginTop: '3rem' }} />
      </main>

      <Footer />
    </View>
  );
};

