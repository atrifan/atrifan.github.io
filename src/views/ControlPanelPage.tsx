'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';

interface ApiKeyData {
  apiKey: string;
  plan: string;
  provider: string;
  createdAt: string;
}

interface ApiKeyListItem {
  id: string;
  api_key_suffix: string;
  plan: string;
  provider: string;
  is_active: boolean;
  created_at: string;
}

interface UsageStats {
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  lastRequestAt: string | null;
}

export const ControlPanelPage: React.FC = () => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'overview' | 'apikey' | 'usage' | 'docs'>('overview');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageStats | null>(null);

  const plan = (user?.publicMetadata?.plan as string) || 'free';

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys/list');
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch (e) {
      console.error('Failed to fetch keys:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/usage/stats');
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (e) {
      console.error('Failed to fetch usage:', e);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    fetchUsage();
  }, [fetchKeys, fetchUsage]);

  const generateKey = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/keys/generate', { method: 'POST' });
      if (res.ok) {
        const data: ApiKeyData = await res.json();
        setApiKey(data.apiKey);
        fetchKeys();
      }
    } catch (e) {
      console.error('Failed to generate key:', e);
    } finally {
      setGenerating(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      const res = await fetch('/api/keys/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: id }),
      });
      if (res.ok) {
        fetchKeys();
        setApiKey(null);
      }
    } catch (e) {
      console.error('Failed to revoke key:', e);
    }
  };

  const copyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tabStyle = (tab: string) => ({
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500 as const,
    background: activeTab === tab ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
    color: activeTab === tab ? '#667eea' : 'rgba(255,255,255,0.6)',
    transition: 'all 0.2s',
  });

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      <main style={{ maxWidth: '56rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: '#fff',
            margin: '0 0 0.5rem',
          }}>
            Control Panel
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.9rem' }}>
            Manage your subscription, API keys, and monitor usage.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('overview')} style={tabStyle('overview')}>Overview</button>
          <button onClick={() => setActiveTab('apikey')} style={tabStyle('apikey')}>API Keys</button>
          <button onClick={() => setActiveTab('usage')} style={tabStyle('usage')}>Usage</button>
          <button onClick={() => setActiveTab('docs')} style={tabStyle('docs')}>Installation</button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Plan Card */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    Current Plan
                  </div>
                  <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </div>
                </div>
                {plan === 'free' && (
                  <a href="/pricing" style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '8px',
                    padding: '0.6rem 1.25rem',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                  }}>
                    Upgrade
                  </a>
                )}
              </div>
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>API Access</div>
                    <div style={{ color: plan === 'free' ? '#ef4444' : '#22c55e', fontSize: '0.9rem', fontWeight: 500 }}>
                      {plan === 'free' ? 'Disabled' : 'Active'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Rate Limit</div>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                      {plan === 'free' ? '—' : plan === 'pro' ? '100 req/hr' : '500 req/hr'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Browser Sessions</div>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                      {plan === 'free' ? '—' : plan === 'pro' ? '5 concurrent' : 'Unlimited'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1rem' }}>
              <div style={cardStyle}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Requests Today</div>
                <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{usage?.requestsToday ?? '—'}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>This Month</div>
                <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{usage?.requestsThisMonth ?? '—'}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>API Keys</div>
                <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{apiKeys.length}</div>
              </div>
            </div>
          </>
        )}

        {/* API Keys Tab */}
        {activeTab === 'apikey' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
                API Key Management
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
                Your API key authenticates the Chrome extension and native host with Tulzo.
                {plan === 'free' && ' Upgrade to Pro to enable API access.'}
              </p>

              {plan !== 'free' && (
                <button
                  onClick={generateKey}
                  disabled={generating}
                  style={{
                    background: generating ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.6rem 1.25rem',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: generating ? 'not-allowed' : 'pointer',
                    marginBottom: '1rem',
                  }}
                >
                  {generating ? 'Generating...' : 'Generate New Key'}
                </button>
              )}

              {apiKey && (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ color: '#22c55e', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    New key generated — copy it now, it won't be shown again:
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <code style={{
                      flex: 1,
                      background: 'rgba(0,0,0,0.3)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.8rem',
                      wordBreak: 'break-all',
                    }}>
                      {apiKey}
                    </code>
                    <button onClick={copyKey} style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                    }}>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Existing keys list */}
            {apiKeys.length > 0 && (
              <div style={cardStyle}>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 1rem' }}>
                  Active Keys
                </h4>
                {apiKeys.map((key) => (
                  <div key={key.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div>
                      <code style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                        ****{key.api_key_suffix}
                      </code>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginLeft: '0.75rem' }}>
                        {key.provider} · {key.plan} · {new Date(key.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button onClick={() => revokeKey(key.id)} style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                    }}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Loading keys...</p>
            )}
          </>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Usage Statistics
              </h3>
              {usage ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '1.25rem' }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Requests</div>
                    <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 700 }}>{usage.totalRequests.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Today</div>
                    <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 700 }}>{usage.requestsToday}</div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>This Month</div>
                    <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 700 }}>{usage.requestsThisMonth.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Last Request</div>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                      {usage.lastRequestAt ? new Date(usage.lastRequestAt).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Loading usage data...</p>
              )}
            </div>

            <div style={cardStyle}>
              <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
                Plan Limits
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Limit</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Free</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Pro</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Plus</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['API Access', '—', '100 req/hr', '500 req/hr'],
                    ['Browser Sessions', '—', '5 concurrent', 'Unlimited'],
                    ['Scheduled Tasks', '—', '10', 'Unlimited'],
                    ['Skill Storage', '—', '50 MB', '500 MB'],
                  ].map(([label, free, pro, plus], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.6rem 0', color: '#fff', fontSize: '0.85rem' }}>{label}</td>
                      <td style={{ padding: '0.6rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{free}</td>
                      <td style={{ padding: '0.6rem 0', color: plan === 'pro' ? '#667eea' : 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: plan === 'pro' ? 600 : 400 }}>{pro}</td>
                      <td style={{ padding: '0.6rem 0', color: plan === 'plus' ? '#667eea' : 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: plan === 'plus' ? 600 : 400 }}>{plus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Docs Tab */}
        {activeTab === 'docs' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Installation Guide
              </h3>

              {/* Chrome Extension */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🧩</span> Chrome Extension
                </h4>
                <ol style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
                  <li>Download the extension from the <a href="#" style={{ color: '#667eea' }}>releases page</a></li>
                  <li>Open Chrome → <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>chrome://extensions</code></li>
                  <li>Enable "Developer mode" (top right toggle)</li>
                  <li>Click "Load unpacked" → select the <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>plugin/dist</code> folder</li>
                  <li>Click the extension icon → enter your API key from the API Keys tab</li>
                </ol>
              </div>

              {/* Native Host */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>⌨️</span> Native Host (CLI)
                </h4>
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  padding: '1rem',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'rgba(255,255,255,0.8)',
                  lineHeight: 1.8,
                  overflow: 'auto',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)' }}># Clone and set up</div>
                  <div>git clone https://github.com/user/assistant-plugin.git</div>
                  <div>cd assistant-plugin</div>
                  <div>node bin/cli.js setup</div>
                  <div style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.4)' }}># Configure your API key</div>
                  <div>echo {'"'}TULZO_API_KEY=your-key-here{'"'} {'>'} .env</div>
                  <div style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.4)' }}># Start the native host</div>
                  <div>node bin/cli.js start</div>
                </div>
              </div>

              {/* Authentication */}
              <div>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🔐</span> Authentication Flow
                </h4>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                  When the plugin starts without authentication, it opens a browser window to Tulzo's login page.
                  After signing in, your session is verified and the plugin receives a token that confirms your plan and quotas.
                </p>
                <div style={{
                  background: 'rgba(102, 126, 234, 0.1)',
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8rem',
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 1.6,
                }}>
                  Plugin → Opens <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>/api/oauth/plugin/authorize</code> → User logs in → Token returned to plugin → API key validated on each request
                </div>
              </div>
            </div>

            <AdBanner slot={ADS_CONFIG.slots.pricingFooter} style={{ marginTop: '1rem' }} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};
