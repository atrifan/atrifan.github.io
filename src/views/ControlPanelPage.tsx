'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';
import { extensionBridge } from '../lib/extension-bridge';

interface DeviceItem {
  id: string;
  device_name: string;
  api_key_suffix: string;
  plan: string;
  provider: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  status: 'online' | 'offline' | 'never_connected';
  last_seen_at: string | null;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  model: string | null;
  tokens_today_input: number;
  tokens_today_output: number;
  schedules_count: number;
  active_tasks_count: number;
  skills_loaded: number;
}

interface UsageStats {
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  lastRequestAt: string | null;
}

interface LiveUsage {
  monthly_cost?: number;
  tokens?: { input: number; output: number };
  calls_by_provider?: Record<string, number>;
  daily_breakdown?: Array<{ date: string; cost: number; tokens: number }>;
}

interface LiveProvider {
  name: string;
  models: string[];
  active: boolean;
}

interface LiveProviders {
  providers?: LiveProvider[];
  active_provider?: string;
  active_model?: string;
}

interface LiveSkill {
  id: string;
  name: string;
  description?: string;
  matches?: string[];
}

interface LiveMCPServer {
  name: string;
  url?: string;
  status: string;
  tools_count?: number;
}

interface LiveMCPTool {
  name: string;
  description?: string;
  server?: string;
}

interface LiveSchedule {
  id: string;
  name?: string;
  cron: string;
  next_run?: string;
  status: string;
}

interface LiveBrowserStatus {
  running: boolean;
  pages_open?: number;
  memory_mb?: number;
}

interface LiveNotificationConfig {
  telegram?: { enabled: boolean; chat_id?: string };
  webhook?: { enabled: boolean; url?: string };
}

interface LiveData {
  usage: LiveUsage | null;
  providers: LiveProviders | null;
  skills: LiveSkill[] | null;
  mcpServers: LiveMCPServer[] | null;
  mcpTools: LiveMCPTool[] | null;
  schedules: LiveSchedule[] | null;
  browserStatus: LiveBrowserStatus | null;
  notifications: LiveNotificationConfig | null;
  loading: boolean;
  lastFetched: number | null;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function generateDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  let os = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  return `${browser} on ${os}`;
}

export const ControlPanelPage: React.FC = () => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'usage' | 'docs'>('overview');
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageStats | null>(null);

  // Add device modal state
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [addingDevice, setAddingDevice] = useState(false);
  const [newDeviceKey, setNewDeviceKey] = useState<string | null>(null);
  const [addDeviceError, setAddDeviceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Extension detection
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [keySentToExtension, setKeySentToExtension] = useState(false);

  // Auto-activation
  const [autoActivating, setAutoActivating] = useState(false);
  const autoActivateAttempted = useRef(false);

  // Live extension data
  const [liveData, setLiveData] = useState<LiveData>({
    usage: null,
    providers: null,
    skills: null,
    mcpServers: null,
    mcpTools: null,
    schedules: null,
    browserStatus: null,
    notifications: null,
    loading: false,
    lastFetched: null,
  });

  // Revoke confirmation
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const [serverPlan, setServerPlan] = useState<string | null>(null);
  const plan = serverPlan || (user?.publicMetadata?.plan as string) || 'free';

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/keys/list');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setDeviceLimit(data.limit || 1);
        if (data.plan) setServerPlan(data.plan);
      }
    } catch (e) {
      console.error('Failed to fetch devices:', e);
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
    fetchDevices();
    fetchUsage();
  }, [fetchDevices, fetchUsage]);

  // Extension detection via bridge
  useEffect(() => {
    extensionBridge.start();

    if (extensionBridge.state === 'connected') {
      setExtensionDetected(true);
    }

    const unsub = extensionBridge.onStateChange((state) => {
      setExtensionDetected(state === 'connected');
    });

    // Also listen for key delivery ack
    const handler = (e: MessageEvent) => {
      if (e.data?.source === 'tex-extension' && e.data.action === 'device_activated' && e.data.success) {
        setKeySentToExtension(true);
      }
    };
    window.addEventListener('message', handler);

    return () => {
      unsub();
      window.removeEventListener('message', handler);
    };
  }, []);

  // Auto-activation: extension present + not already paired + user has 0 devices + paid plan
  useEffect(() => {
    if (autoActivateAttempted.current) return;
    if (!extensionDetected) return;
    if (extensionBridge.activated) return;
    if (loading) return;
    if (devices.length > 0) return;
    if (plan === 'free') return;

    autoActivateAttempted.current = true;
    setAutoActivating(true);

    const deviceName = generateDeviceName();

    (async () => {
      try {
        const res = await fetch('/api/keys/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_name: deviceName }),
        });
        const data = await res.json();

        if (!res.ok) {
          setAutoActivating(false);
          return;
        }

        window.postMessage({
          source: 'tulzo',
          action: 'activate_device',
          apiKey: data.apiKey,
          deviceName: deviceName,
        }, '*');

        setTimeout(() => {
          setKeySentToExtension(true);
          setAutoActivating(false);
          fetchDevices();
        }, 1000);
      } catch {
        setAutoActivating(false);
      }
    })();
  }, [extensionDetected, loading, devices.length, plan, fetchDevices]);

  // Fetch all live data from extension when connected and activated
  const fetchLiveData = useCallback(async () => {
    if (extensionBridge.state !== 'connected') return;

    setLiveData(prev => ({ ...prev, loading: true }));

    const results = await Promise.allSettled([
      extensionBridge.send<LiveUsage>('GET_USAGE'),
      extensionBridge.send<LiveProviders>('GET_PROVIDERS'),
      extensionBridge.send<LiveSkill[]>('LIST_SKILLS'),
      extensionBridge.send<LiveMCPServer[]>('MCP_LIST_SERVERS'),
      extensionBridge.send<LiveMCPTool[]>('MCP_LIST_TOOLS'),
      extensionBridge.send<LiveSchedule[]>('SCHEDULE_LIST'),
      extensionBridge.send<LiveBrowserStatus>('DAEMON_BROWSER_STATUS'),
      extensionBridge.send<LiveNotificationConfig>('NOTIFICATION_GET_CONFIG'),
    ]);

    setLiveData({
      usage: results[0].status === 'fulfilled' ? results[0].value : null,
      providers: results[1].status === 'fulfilled' ? results[1].value : null,
      skills: results[2].status === 'fulfilled' ? results[2].value : null,
      mcpServers: results[3].status === 'fulfilled' ? results[3].value : null,
      mcpTools: results[4].status === 'fulfilled' ? results[4].value : null,
      schedules: results[5].status === 'fulfilled' ? results[5].value : null,
      browserStatus: results[6].status === 'fulfilled' ? results[6].value : null,
      notifications: results[7].status === 'fulfilled' ? results[7].value : null,
      loading: false,
      lastFetched: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!extensionDetected) return;
    if (!keySentToExtension && !extensionBridge.activated) return;

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 30000);
    return () => clearInterval(interval);
  }, [keySentToExtension, extensionDetected, fetchLiveData]);

  const addDevice = async () => {
    if (!newDeviceName.trim()) return;
    setAddingDevice(true);
    setAddDeviceError(null);
    setNewDeviceKey(null);
    setKeySentToExtension(false);
    try {
      const res = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: newDeviceName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'device_limit_reached') {
          setAddDeviceError(`Device limit reached (${data.limit}). Upgrade your plan to add more devices.`);
        } else if (data.error === 'device_name_exists') {
          setAddDeviceError(`A device named "${newDeviceName}" already exists.`);
        } else {
          setAddDeviceError(data.error || 'Failed to add device');
        }
        return;
      }
      setNewDeviceKey(data.apiKey);
      fetchDevices();
    } catch (e) {
      setAddDeviceError('Network error. Please try again.');
    } finally {
      setAddingDevice(false);
    }
  };

  const revokeDevice = async (id: string) => {
    try {
      const res = await fetch('/api/keys/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: id }),
      });
      if (res.ok) {
        fetchDevices();
        setConfirmRevoke(null);
      }
    } catch (e) {
      console.error('Failed to revoke device:', e);
    }
  };

  const sendKeyToExtension = () => {
    if (newDeviceKey) {
      window.postMessage({
        source: 'tulzo',
        action: 'activate_device',
        apiKey: newDeviceKey,
        deviceName: newDeviceName.trim(),
      }, '*');
      setTimeout(() => {
        if (!keySentToExtension) {
          // Extension didn't respond — fallback to manual copy
        }
      }, 2000);
    }
  };

  const copyKey = () => {
    if (newDeviceKey) {
      navigator.clipboard.writeText(newDeviceKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasLiveData = extensionDetected && (keySentToExtension || extensionBridge.activated);

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

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: 600,
    margin: '0 0 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.25rem 0.6rem',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: 500,
    background: active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.06)',
    color: active ? '#22c55e' : 'rgba(255,255,255,0.5)',
    border: `1px solid ${active ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.08)'}`,
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': case 'connected': case 'active': return '#22c55e';
      case 'offline': case 'disconnected': case 'paused': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const statusDot = (status: string) => (
    <span style={{
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: statusColor(status),
      display: 'inline-block',
      flexShrink: 0,
    }} />
  );

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
            Manage your devices, subscription, and monitor usage.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('overview')} style={tabStyle('overview')}>Overview</button>
          <button onClick={() => setActiveTab('devices')} style={tabStyle('devices')}>Devices</button>
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
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Devices</div>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                      {devices.length} / {deviceLimit}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Rate Limit</div>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                      {plan === 'free' ? '—' : plan === 'pro' ? '100 req/hr' : '500 req/hr'}
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
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Devices</div>
                <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{devices.length}</div>
              </div>
            </div>

            {/* Live Extension Summary (only when connected) */}
            {hasLiveData && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ ...sectionHeaderStyle, margin: 0 }}>
                    {statusDot('online')}
                    Extension Live
                  </h3>
                  {liveData.lastFetched && (
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
                      Updated {relativeTime(new Date(liveData.lastFetched).toISOString())}
                    </span>
                  )}
                </div>

                {liveData.loading && !liveData.lastFetched ? (
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>Fetching live data...</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '1rem' }}>
                    {liveData.providers?.active_provider && (
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>Active Model</div>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                          {liveData.providers.active_model || liveData.providers.active_provider}
                        </div>
                      </div>
                    )}
                    {liveData.usage?.monthly_cost != null && (
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>Monthly Cost</div>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                          {formatCost(liveData.usage.monthly_cost)}
                        </div>
                      </div>
                    )}
                    {liveData.skills && (
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>Skills Loaded</div>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{liveData.skills.length}</div>
                      </div>
                    )}
                    {liveData.mcpServers && (
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>MCP Servers</div>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                          {liveData.mcpServers.filter(s => s.status === 'connected').length}/{liveData.mcpServers.length}
                        </div>
                      </div>
                    )}
                    {liveData.schedules && (
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>Active Schedules</div>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                          {liveData.schedules.filter(s => s.status === 'active').length}
                        </div>
                      </div>
                    )}
                    {liveData.browserStatus && (
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>Browser</div>
                        <div style={{ color: liveData.browserStatus.running ? '#22c55e' : 'rgba(255,255,255,0.5)', fontSize: '0.9rem', fontWeight: 500 }}>
                          {liveData.browserStatus.running ? 'Running' : 'Stopped'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Devices Tab */}
        {activeTab === 'devices' && (
          <>
            <div style={{ ...cardStyle, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                    Devices ({devices.length} of {deviceLimit})
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                    Each device connects via its own API key.
                    {plan === 'free' && ' Upgrade to Pro for up to 3 devices.'}
                  </p>
                </div>
                {plan !== 'free' && (
                  <button
                    onClick={() => { setShowAddDevice(true); setNewDeviceName(''); setNewDeviceKey(null); setAddDeviceError(null); setKeySentToExtension(false); }}
                    disabled={devices.length >= deviceLimit}
                    style={{
                      background: devices.length >= deviceLimit ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.6rem 1.25rem',
                      color: devices.length >= deviceLimit ? 'rgba(255,255,255,0.3)' : '#fff',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: devices.length >= deviceLimit ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Add Device
                  </button>
                )}
              </div>

              {/* Extension detection banner */}
              {extensionDetected && (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                  color: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  {statusDot('online')}
                  Browser extension connected{extensionBridge.version ? ` (v${extensionBridge.version})` : ''} — keys can be sent directly.
                </div>
              )}

              {/* Device list */}
              {loading ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Loading devices...</p>
              ) : devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  {autoActivating ? (
                    <>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
                        Connecting your device...
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', margin: 0 }}>
                        Sending API key to extension automatically.
                      </p>
                    </>
                  ) : keySentToExtension ? (
                    <>
                      <p style={{ color: '#22c55e', fontSize: '0.9rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
                        Device auto-connected!
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', margin: 0 }}>
                        Your extension is now paired. Refreshing...
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
                        No devices connected yet.
                      </p>
                      {plan !== 'free' && (
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', margin: 0 }}>
                          Click &quot;+ Add Device&quot; to generate an API key for your first device.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {devices.map((device) => (
                    <div key={device.id} style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: statusColor(device.status),
                              display: 'inline-block',
                            }} />
                            <span style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600 }}>
                              {device.device_name}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
                              ****{device.api_key_suffix}
                            </span>
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {device.platform && (
                              <span>{device.platform}{device.arch ? ` · ${device.arch}` : ''}</span>
                            )}
                            {device.model && (
                              <span>{device.model.split('/').pop()?.split('.').pop() || device.model}</span>
                            )}
                            <span>
                              {device.status === 'online' ? 'Active now' :
                               device.status === 'offline' ? `Last seen: ${relativeTime(device.last_seen_at)}` :
                               'Never connected'}
                            </span>
                          </div>
                          {device.status === 'online' && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', gap: '0.75rem' }}>
                              <span>Tokens: {formatTokens(device.tokens_today_input)} in / {formatTokens(device.tokens_today_output)} out</span>
                              {device.schedules_count > 0 && <span>{device.schedules_count} schedules</span>}
                              {device.skills_loaded > 0 && <span>{device.skills_loaded} skills</span>}
                            </div>
                          )}
                          {/* Live data for this device */}
                          {extensionBridge.deviceName === device.device_name && liveData.providers?.active_model && (
                            <div style={{ color: '#667eea', fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                              {statusDot('online')}
                              <span>Live: {liveData.providers.active_provider}/{liveData.providers.active_model}</span>
                              {liveData.usage?.tokens && (
                                <span>{formatTokens(liveData.usage.tokens.input)} in / {formatTokens(liveData.usage.tokens.output)} out</span>
                              )}
                              {liveData.usage?.monthly_cost != null && (
                                <span>{formatCost(liveData.usage.monthly_cost)} this month</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          {confirmRevoke === device.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <button
                                onClick={() => revokeDevice(device.id)}
                                style={{
                                  background: '#ef4444',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.75rem',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmRevoke(null)}
                                style={{
                                  background: 'rgba(255,255,255,0.1)',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.75rem',
                                  color: 'rgba(255,255,255,0.6)',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRevoke(device.id)}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                padding: '0.35rem 0.75rem',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Extension Panels — shown when connected */}
            {hasLiveData && liveData.lastFetched && (
              <>
                {/* Providers */}
                {liveData.providers?.providers && liveData.providers.providers.length > 0 && (
                  <div style={cardStyle}>
                    <h4 style={sectionHeaderStyle}>
                      Providers
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {liveData.providers.providers.map((p, i) => (
                        <div key={i} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.6rem 0.75rem',
                          background: p.active ? 'rgba(102, 126, 234, 0.08)' : 'transparent',
                          border: p.active ? '1px solid rgba(102, 126, 234, 0.2)' : '1px solid rgba(255,255,255,0.04)',
                          borderRadius: '8px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {statusDot(p.active ? 'online' : 'offline')}
                            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: p.active ? 600 : 400 }}>
                              {p.name}
                            </span>
                            {p.active && <span style={pillStyle(true)}>Active</span>}
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                            {p.models.length} model{p.models.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {liveData.skills && liveData.skills.length > 0 && (
                  <div style={cardStyle}>
                    <h4 style={sectionHeaderStyle}>
                      Skills ({liveData.skills.length})
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '0.5rem' }}>
                      {liveData.skills.map((skill) => (
                        <div key={skill.id} style={{
                          padding: '0.6rem 0.75rem',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                        }}>
                          <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>
                            {skill.name}
                          </div>
                          {skill.description && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', lineHeight: 1.4 }}>
                              {skill.description.length > 60 ? skill.description.slice(0, 60) + '...' : skill.description}
                            </div>
                          )}
                          {skill.matches && skill.matches.length > 0 && (
                            <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {skill.matches.slice(0, 3).map((m, i) => (
                                <span key={i} style={{
                                  fontSize: '0.6rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '4px',
                                  background: 'rgba(102, 126, 234, 0.15)',
                                  color: 'rgba(102, 126, 234, 0.8)',
                                }}>
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* MCP Servers */}
                {liveData.mcpServers && liveData.mcpServers.length > 0 && (
                  <div style={cardStyle}>
                    <h4 style={sectionHeaderStyle}>
                      MCP Integrations ({liveData.mcpServers.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {liveData.mcpServers.map((server, i) => (
                        <div key={i} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.6rem 0.75rem',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {statusDot(server.status)}
                            <span style={{ color: '#fff', fontSize: '0.85rem' }}>{server.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {server.tools_count != null && (
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                                {server.tools_count} tool{server.tools_count !== 1 ? 's' : ''}
                              </span>
                            )}
                            <span style={pillStyle(server.status === 'connected')}>
                              {server.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {liveData.mcpTools && liveData.mcpTools.length > 0 && (
                      <details style={{ marginTop: '0.75rem' }}>
                        <summary style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none' }}>
                          View all tools ({liveData.mcpTools.length})
                        </summary>
                        <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: '0.35rem' }}>
                          {liveData.mcpTools.map((tool, i) => (
                            <div key={i} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>
                              <span style={{ color: '#fff' }}>{tool.name}</span>
                              {tool.server && <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '0.35rem' }}>({tool.server})</span>}
                              {tool.description && (
                                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', marginTop: '0.1rem' }}>
                                  {tool.description.length > 80 ? tool.description.slice(0, 80) + '...' : tool.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Schedules */}
                {liveData.schedules && liveData.schedules.length > 0 && (
                  <div style={cardStyle}>
                    <h4 style={sectionHeaderStyle}>
                      Scheduled Tasks ({liveData.schedules.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {liveData.schedules.map((schedule) => (
                        <div key={schedule.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.75rem',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {statusDot(schedule.status)}
                            <span style={{ color: '#fff', fontSize: '0.85rem' }}>
                              {schedule.name || schedule.id}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <code style={{
                              color: 'rgba(255,255,255,0.5)',
                              fontSize: '0.7rem',
                              background: 'rgba(255,255,255,0.05)',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                            }}>
                              {schedule.cron}
                            </code>
                            {schedule.next_run && (
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                                Next: {relativeTime(schedule.next_run)}
                              </span>
                            )}
                            <span style={pillStyle(schedule.status === 'active')}>
                              {schedule.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Browser + Notifications row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '1rem' }}>
                  {/* Headless Browser */}
                  {liveData.browserStatus && (
                    <div style={cardStyle}>
                      <h4 style={sectionHeaderStyle}>
                        Headless Browser
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {statusDot(liveData.browserStatus.running ? 'online' : 'offline')}
                        <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                          {liveData.browserStatus.running ? 'Running' : 'Stopped'}
                        </span>
                      </div>
                      {liveData.browserStatus.running && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                          {liveData.browserStatus.pages_open != null && (
                            <div>{liveData.browserStatus.pages_open} page{liveData.browserStatus.pages_open !== 1 ? 's' : ''} open</div>
                          )}
                          {liveData.browserStatus.memory_mb != null && (
                            <div>{liveData.browserStatus.memory_mb} MB memory</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notifications */}
                  {liveData.notifications && (
                    <div style={cardStyle}>
                      <h4 style={sectionHeaderStyle}>
                        Notifications
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Telegram</span>
                          <span style={pillStyle(!!liveData.notifications.telegram?.enabled)}>
                            {liveData.notifications.telegram?.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Webhook</span>
                          <span style={pillStyle(!!liveData.notifications.webhook?.enabled)}>
                            {liveData.notifications.webhook?.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Refresh button */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <button
                    onClick={fetchLiveData}
                    disabled={liveData.loading}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      padding: '0.5rem 1.25rem',
                      color: 'rgba(255,255,255,0.6)',
                      cursor: liveData.loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    {liveData.loading ? 'Refreshing...' : 'Refresh Live Data'}
                  </button>
                </div>
              </>
            )}

            {/* Add Device Modal */}
            {showAddDevice && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem',
              }}>
                <div style={{
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '2rem',
                  maxWidth: '28rem',
                  width: '100%',
                }}>
                  {!newDeviceKey ? (
                    <>
                      <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                        Add Device
                      </h3>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1.25rem' }}>
                        Give your device a name to identify it in the dashboard.
                      </p>
                      <input
                        type="text"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder="e.g. Work Macbook, Home PC"
                        maxLength={32}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          padding: '0.7rem 0.9rem',
                          color: '#fff',
                          fontSize: '0.9rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') addDevice(); }}
                        autoFocus
                      />
                      {addDeviceError && (
                        <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '0.75rem 0 0' }}>
                          {addDeviceError}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setShowAddDevice(false)}
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.6rem 1.25rem',
                            color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addDevice}
                          disabled={addingDevice || !newDeviceName.trim()}
                          style={{
                            background: (!newDeviceName.trim() || addingDevice) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.6rem 1.25rem',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: (!newDeviceName.trim() || addingDevice) ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          {addingDevice ? 'Generating...' : 'Generate Key'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 style={{ color: '#22c55e', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                        Device Added
                      </h3>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
                        Copy this API key now — it won&apos;t be shown again.
                      </p>
                      <div style={{
                        background: 'rgba(0,0,0,0.4)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        marginBottom: '1rem',
                      }}>
                        <code style={{
                          color: '#fff',
                          fontSize: '0.8rem',
                          wordBreak: 'break-all',
                          lineHeight: 1.5,
                        }}>
                          {newDeviceKey}
                        </code>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={copyKey}
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            padding: '0.6rem 1rem',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          {copied ? 'Copied!' : 'Copy Key'}
                        </button>
                        {extensionDetected && !keySentToExtension && (
                          <button
                            onClick={sendKeyToExtension}
                            style={{
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '0.6rem 1rem',
                              color: '#fff',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                            }}
                          >
                            Send to Extension
                          </button>
                        )}
                        {keySentToExtension && (
                          <span style={{ color: '#22c55e', fontSize: '0.85rem', alignSelf: 'center' }}>
                            Sent to extension
                          </span>
                        )}
                      </div>
                      {!extensionDetected && (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', margin: '0.75rem 0 0' }}>
                          Extension not detected. Copy the key and paste it in the extension settings.
                        </p>
                      )}
                      <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
                        <button
                          onClick={() => setShowAddDevice(false)}
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.6rem 1.25rem',
                            color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          Done
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
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

            {/* Live Usage from Extension */}
            {hasLiveData && liveData.usage && (
              <div style={cardStyle}>
                <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {statusDot('online')}
                  Live Device Usage
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1.25rem' }}>
                  {liveData.usage.monthly_cost != null && (
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Monthly Cost</div>
                      <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{formatCost(liveData.usage.monthly_cost)}</div>
                    </div>
                  )}
                  {liveData.usage.tokens && (
                    <>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Tokens In</div>
                        <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{formatTokens(liveData.usage.tokens.input)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Tokens Out</div>
                        <div style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700 }}>{formatTokens(liveData.usage.tokens.output)}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Cost by provider */}
                {liveData.usage.calls_by_provider && Object.keys(liveData.usage.calls_by_provider).length > 0 && (
                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Calls by Provider</div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {Object.entries(liveData.usage.calls_by_provider).map(([provider, calls]) => (
                        <div key={provider} style={{
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                        }}>
                          <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>{calls}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>{provider}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily breakdown */}
                {liveData.usage.daily_breakdown && liveData.usage.daily_breakdown.length > 0 && (
                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Daily Breakdown (Last 7 Days)</div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '4rem' }}>
                      {liveData.usage.daily_breakdown.slice(-7).map((day, i) => {
                        const max = Math.max(...liveData.usage!.daily_breakdown!.slice(-7).map(d => d.tokens));
                        const height = max > 0 ? (day.tokens / max) * 100 : 0;
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                            <div style={{
                              width: '100%',
                              maxWidth: '2rem',
                              height: `${Math.max(height, 4)}%`,
                              background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
                              borderRadius: '3px 3px 0 0',
                              minHeight: '2px',
                            }} />
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}>
                              {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                    ['Devices', '1', '3', '10'],
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

        {/* Installation Tab */}
        {activeTab === 'docs' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Installation Guide
              </h3>

              {/* Chrome Extension */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Chrome Extension
                </h4>
                <ol style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
                  <li>Download the extension from the releases page</li>
                  <li>Open Chrome → <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>chrome://extensions</code></li>
                  <li>Enable &quot;Developer mode&quot; (top right toggle)</li>
                  <li>Click &quot;Load unpacked&quot; → select the <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>plugin/dist</code> folder</li>
                  <li>Add a device in the Devices tab — the key will be sent to the extension automatically</li>
                </ol>
              </div>

              {/* Native Host */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Native Host (CLI)
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
                  Authentication Flow
                </h4>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                  When the plugin starts without authentication, it opens a browser window to Tulzo&apos;s login page.
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
