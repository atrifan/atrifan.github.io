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

interface LiveVersion {
  version: string;
  gitCommit: string;
  platform: string;
  arch: string;
  nodeVersion: string;
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
  version: LiveVersion | null;
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

function isVersionOutdated(current: string | undefined, latest: string | undefined): boolean {
  if (!current || !latest) return false;
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < 3; i++) {
    if ((c[i] || 0) < (l[i] || 0)) return true;
    if ((c[i] || 0) > (l[i] || 0)) return false;
  }
  return false;
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
    version: null,
    loading: false,
    lastFetched: null,
  });
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  // Revoke confirmation
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

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
    fetch('/api/plugin/version').then(r => r.json()).then(d => {
      if (d.latest) setLatestVersion(d.latest);
    }).catch(() => {});
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
      extensionBridge.send<LiveVersion>('GET_VERSION'),
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
      version: results[8].status === 'fulfilled' ? results[8].value : null,
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
                  {devices.map((device) => {
                    const isExpanded = expandedDevice === device.id;
                    const isLiveDevice = extensionDetected && (
                      extensionBridge.deviceName === device.device_name ||
                      devices.length === 1
                    );
                    return (
                    <div key={device.id} style={{
                      background: isExpanded ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                      border: isExpanded ? '1px solid rgba(102, 126, 234, 0.2)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                      transition: 'all 0.2s',
                    }}>
                      <div
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}
                        onClick={() => setExpandedDevice(isExpanded ? null : device.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedDevice(isExpanded ? null : device.id); } }}
                      >
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
                            {isLiveDevice && liveData.version && latestVersion && isVersionOutdated(liveData.version.version, latestVersion) && (
                              <span style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.3)', color: '#fbbf24', fontSize: '0.6rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '999px' }}>
                                Update available
                              </span>
                            )}
                            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', marginLeft: 'auto' }}>
                              {isExpanded ? '▾' : '▸'}
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
                            {isLiveDevice && liveData.providers?.active_model && (
                              <span style={{ color: '#667eea' }}>{liveData.providers.active_provider}/{liveData.providers.active_model}</span>
                            )}
                          </div>
                          {device.status === 'online' && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', gap: '0.75rem' }}>
                              <span>Tokens: {formatTokens(device.tokens_today_input)} in / {formatTokens(device.tokens_today_output)} out</span>
                              {device.schedules_count > 0 && <span>{device.schedules_count} schedules</span>}
                              {device.skills_loaded > 0 && <span>{device.skills_loaded} skills</span>}
                            </div>
                          )}
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          {confirmRevoke === device.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <button onClick={() => revokeDevice(device.id)} style={{ background: '#ef4444', border: 'none', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500 }}>Confirm</button>
                              <button onClick={() => setConfirmRevoke(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.75rem', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.75rem' }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmRevoke(device.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}>Revoke</button>
                          )}
                        </div>
                      </div>

                      {/* Expanded device details */}
                      {isExpanded && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {/* Version info */}
                          {isLiveDevice && liveData.version && (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.8rem' }}>
                              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Version: </span><span style={{ color: '#fff' }}>v{liveData.version.version}</span></div>
                              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Commit: </span><span style={{ color: '#fff' }}>{liveData.version.gitCommit}</span></div>
                              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Platform: </span><span style={{ color: '#fff' }}>{liveData.version.platform}/{liveData.version.arch}</span></div>
                              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Node: </span><span style={{ color: '#fff' }}>{liveData.version.nodeVersion}</span></div>
                            </div>
                          )}

                          {/* Usage */}
                          {isLiveDevice && liveData.usage && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Usage</div>
                              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                {liveData.usage.monthly_cost != null && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Cost: </span><span style={{ color: '#fff', fontWeight: 600 }}>{formatCost(liveData.usage.monthly_cost)}/mo</span></div>}
                                {liveData.usage.tokens && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Tokens: </span><span style={{ color: '#fff' }}>{formatTokens(liveData.usage.tokens.input)} in / {formatTokens(liveData.usage.tokens.output)} out</span></div>}
                              </div>
                              {liveData.usage.calls_by_provider && Object.keys(liveData.usage.calls_by_provider).length > 0 && (
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                  {Object.entries(liveData.usage.calls_by_provider).map(([provider, calls]) => (
                                    <span key={provider} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
                                      {provider}: {calls} calls
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Providers */}
                          {isLiveDevice && liveData.providers?.providers && liveData.providers.providers.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Providers</div>
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {liveData.providers.providers.map((p, i) => (
                                  <span key={i} style={pillStyle(p.active)}>
                                    {p.name} ({p.models.length})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Skills */}
                          {isLiveDevice && liveData.skills && liveData.skills.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Skills ({liveData.skills.length})</div>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {liveData.skills.map((skill) => (
                                  <span key={skill.id} style={{ background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)' }} title={skill.description}>
                                    {skill.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* MCP Servers */}
                          {isLiveDevice && liveData.mcpServers && liveData.mcpServers.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>MCP Servers ({liveData.mcpServers.length})</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {liveData.mcpServers.map((server, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                    {statusDot(server.status)}
                                    <span style={{ color: '#fff' }}>{server.name}</span>
                                    {server.tools_count != null && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>{server.tools_count} tools</span>}
                                  </div>
                                ))}
                              </div>
                              {liveData.mcpTools && liveData.mcpTools.length > 0 && (
                                <details style={{ marginTop: '0.5rem' }}>
                                  <summary style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', cursor: 'pointer' }}>All tools ({liveData.mcpTools.length})</summary>
                                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                    {liveData.mcpTools.map((tool, i) => (
                                      <span key={i} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }} title={tool.description}>
                                        {tool.name}
                                      </span>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}

                          {/* Schedules */}
                          {isLiveDevice && liveData.schedules && liveData.schedules.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Schedules ({liveData.schedules.length})</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {liveData.schedules.map((s) => (
                                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                    {statusDot(s.status)}
                                    <span style={{ color: '#fff' }}>{s.name || s.id}</span>
                                    <code style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{s.cron}</code>
                                    {s.next_run && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>next: {relativeTime(s.next_run)}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Browser + Notifications */}
                          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            {isLiveDevice && liveData.browserStatus && (
                              <div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Browser</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                  {statusDot(liveData.browserStatus.running ? 'online' : 'offline')}
                                  <span style={{ color: '#fff' }}>{liveData.browserStatus.running ? 'Running' : 'Stopped'}</span>
                                  {liveData.browserStatus.pages_open != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>({liveData.browserStatus.pages_open} pages)</span>}
                                </div>
                              </div>
                            )}
                            {isLiveDevice && liveData.notifications && (
                              <div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Notifications</div>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <span style={pillStyle(!!liveData.notifications.telegram?.enabled)}>Telegram</span>
                                  <span style={pillStyle(!!liveData.notifications.webhook?.enabled)}>Webhook</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Refresh */}
                          {isLiveDevice && (
                            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <button onClick={(e) => { e.stopPropagation(); fetchLiveData(); }} disabled={liveData.loading} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.35rem 0.75rem', color: 'rgba(255,255,255,0.5)', cursor: liveData.loading ? 'not-allowed' : 'pointer', fontSize: '0.7rem' }}>
                                {liveData.loading ? 'Refreshing...' : 'Refresh'}
                              </button>
                              {liveData.lastFetched && <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem', marginLeft: '0.5rem' }}>Updated {relativeTime(new Date(liveData.lastFetched).toISOString())}</span>}
                            </div>
                          )}

                          {/* Non-live device: basic info */}
                          {!isLiveDevice && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Created: </span><span style={{ color: '#fff' }}>{new Date(device.created_at).toLocaleDateString()}</span></div>
                                {device.last_used_at && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Last used: </span><span style={{ color: '#fff' }}>{relativeTime(device.last_used_at)}</span></div>}
                              </div>
                              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
                                Connect the browser extension on this device to see live data.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>


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

        {/* Docs Tab */}
        {activeTab === 'docs' && (
          <>
            {/* Getting Started */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Getting Started
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
                A personal AI assistant that lives in your browser, your terminal, and your Telegram.
                It sees what you see, operates web pages on your behalf, runs shell commands, calls APIs,
                and learns your preferences over time.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: 'rgba(102, 126, 234, 0.08)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ color: '#667eea', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Chrome Side Panel</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Interactive work on the current tab (forms, navigation, visual tasks)</div>
                </div>
                <div style={{ background: 'rgba(102, 126, 234, 0.08)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ color: '#667eea', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Telegram Bot</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Tasks while away, scheduled jobs, quick questions</div>
                </div>
                <div style={{ background: 'rgba(102, 126, 234, 0.08)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ color: '#667eea', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>CLI</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Scripting, automation from other tools (Claude Code, cron, shell)</div>
                </div>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: 0 }}>
                All three channels share the same headless browser, skills, and memory.
              </p>
            </div>

            {/* Installation */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Installation
              </h3>

              <details style={{ marginBottom: '1.25rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem' }}>
                  Chrome Extension
                </summary>
                <ol style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
                  <li>Download the extension from the releases page</li>
                  <li>Open Chrome → <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>chrome://extensions</code></li>
                  <li>Enable &quot;Developer mode&quot; (top right toggle)</li>
                  <li>Click &quot;Load unpacked&quot; → select the <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>plugin/dist</code> folder</li>
                  <li>The extension auto-pairs with your Tulzo account when you visit this page</li>
                </ol>
              </details>

              <details style={{ marginBottom: '1.25rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem' }}>
                  Native Host (CLI)
                </summary>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.8, overflow: 'auto' }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)' }}># Clone and set up</div>
                  <div>git clone https://github.com/user/assistant-plugin.git</div>
                  <div>cd assistant-plugin</div>
                  <div>node bin/cli.js setup</div>
                  <div style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.4)' }}># Start (opens browser for Tulzo login on first run)</div>
                  <div>node bin/cli.js start</div>
                </div>
              </details>

              <details style={{ marginBottom: '1.25rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem' }}>
                  API Credentials (Claude / Bedrock)
                </summary>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.5rem', lineHeight: 1.6 }}>
                  Open the panel, click the gear icon, paste your API key, select a model, and save.
                  Or edit <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>native-host/data/config/claude_credential.json</code>:
                </p>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                  {`{ "credential": "sk-ant-api03-...", "model": "claude-sonnet-4-6" }`}
                </div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                  For AWS Bedrock, use the access key (starts with ABSK) and a Bedrock model ID.
                </p>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem' }}>
                  Tulzo Authentication
                </summary>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.5rem', lineHeight: 1.6 }}>
                  On first startup, the native host opens a browser window to Tulzo&apos;s login page.
                  After signing in, a token is returned that confirms your plan and quotas.
                </p>
                <div style={{ background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                  Native Host → Opens browser → User signs in → Token sent to localhost callback → Saved to <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>tulzo_auth.json</code>
                </div>
              </details>
            </div>

            {/* Using the Plugin Panel */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Using the Plugin Panel
              </h3>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Sending Messages and Context
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem' }}>Type in the input box and press Enter. The assistant sees your message plus page context (URL, title, key elements).</p>
                  <p style={{ margin: '0 0 0.5rem' }}>Attach files by dragging onto the input or clicking the attachment button. Images use vision; text files are included as content.</p>
                  <p style={{ margin: '0 0 0.5rem' }}><strong>Auto-context:</strong> First turn gets a screenshot + DOM summary. After navigation, a fresh screenshot is taken automatically.</p>
                </div>
              </details>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Features
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                    <li><strong>Tab isolation</strong> — Each tab has its own conversation. Switch tabs and back seamlessly.</li>
                    <li><strong>Background tasks</strong> — Prefix with <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>/background</code> to run without blocking the panel.</li>
                    <li><strong>Inline buttons</strong> — Clickable choices for confirmations or decisions.</li>
                    <li><strong>Charts and diagrams</strong> — Interactive Chart.js and Mermaid diagrams inline.</li>
                    <li><strong>Plans</strong> — Multi-step tasks show a plan with approval before execution.</li>
                    <li><strong>Interactive forms</strong> — Tabbed forms for structured input when needed.</li>
                    <li><strong>Stop button</strong> — Cancel current operation immediately.</li>
                  </ul>
                </div>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Slash Commands (Plugin)
                </summary>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      {[
                        ['/background <task>', 'Run task in headless browser (non-blocking)'],
                        ['/schedule <time> <when> <task>', 'Create a scheduled task'],
                        ['/schedule list', 'List all scheduled tasks'],
                        ['/schedule pause|resume|delete <id>', 'Manage schedules'],
                        ['/stop', 'Stop the current running task'],
                        ['/help', 'Show available commands'],
                      ].map(([cmd, desc], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: '#667eea', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{cmd}</td>
                          <td style={{ padding: '0.4rem 0', color: 'rgba(255,255,255,0.5)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            {/* Telegram */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Telegram
              </h3>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Setup
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <ol style={{ margin: 0, paddingLeft: '1rem' }}>
                    <li>Create a bot via <strong>@BotFather</strong> — save the token</li>
                    <li>Get your chat ID (send a message, then check <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>)</li>
                    <li>Edit <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>native-host/data/config/notifications.json</code></li>
                    <li>Restart the native host — you should see <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>[telegram] Polling started</code></li>
                  </ol>
                </div>
              </details>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Commands
                </summary>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      {[
                        ['/task <description>', 'Run a full workflow (skills, tools, browser)'],
                        ['/ask <question>', 'Quick answer with full agent capabilities'],
                        ['/chat', 'Start a multi-turn conversation'],
                        ['/end [#chatId]', 'End a chat session'],
                        ['/stop [#taskId]', 'Stop a running task'],
                        ['/status', 'Show active tasks, chats, pending questions'],
                        ['/schedule ...', 'Create/manage scheduled tasks'],
                        ['/help', 'Show command reference'],
                      ].map(([cmd, desc], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: '#667eea', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{cmd}</td>
                          <td style={{ padding: '0.4rem 0', color: 'rgba(255,255,255,0.5)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Escalation (5-minute rule)
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem' }}>When the assistant asks a question in the plugin and you don&apos;t respond within 5 minutes, the question appears on Telegram. Reply there and the plugin task continues.</p>
                  <p style={{ margin: '0 0 0.5rem' }}>Reply with <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>#ticketId your answer</code> to respond to a specific question.</p>
                  <p style={{ margin: 0 }}>You only receive completion notifications on Telegram if the task was escalated (you were away) or originated from Telegram.</p>
                </div>
              </details>
            </div>

            {/* Skills and Practitioners */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Skills &amp; Practitioners
              </h3>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  What are Skills?
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem' }}>Skills are automation modules giving the assistant domain-specific capabilities. Each skill defines which pages it handles, available actions, and execution logic.</p>
                  <p style={{ margin: '0 0 0.5rem' }}><strong>Structure:</strong> <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>skills/my-skill/SKILL.md</code> (definition) + <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>scripts/index.ts</code> (code)</p>
                  <p style={{ margin: '0 0 0.5rem' }}><strong>Auto-activation:</strong> Skills activate on URL match, keyword detection, or explicit selection.</p>
                  <p style={{ margin: 0 }}><strong>Creating:</strong> Ask the assistant &quot;create a skill for example.com&quot; — it generates the scaffold, writes it, and hot-reloads in ~1 second.</p>
                </div>
              </details>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Core Skills (Always Available)
                </summary>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      {[
                        ['DateTime & Profile', 'Current time, timezone; update operator profile'],
                        ['File Manager', 'Read/write/copy/move/delete local files'],
                        ['HTTP & GraphQL', 'REST and GraphQL calls via curl'],
                        ['Skill Manager', 'Create, update, inspect, and list skills'],
                      ].map(([name, desc], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: '#fff', fontWeight: 500, whiteSpace: 'nowrap' }}>{name}</td>
                          <td style={{ padding: '0.4rem 0', color: 'rgba(255,255,255,0.5)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Practitioners (Domain Personas)
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem' }}>Practitioners shape HOW the assistant thinks — defining approach, vocabulary, memory rules, and owning a set of skills.</p>
                  <p style={{ margin: '0 0 0.5rem' }}><strong>Structure:</strong> <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>practitioners/name/CLAUDE.md</code> + <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>memory/</code> + <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>skills/</code></p>
                  <p style={{ margin: 0 }}>Activated by URL match (via owned skill), vocabulary keyword detection, or explicitly.</p>
                </div>
              </details>
            </div>

            {/* MCP Servers */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                MCP Servers
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
                External tool servers that expose APIs as callable tools (GitHub, Gmail, databases, custom services).
                The assistant discovers tools automatically and uses them alongside skills.
              </p>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Configuration
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                  <p style={{ margin: '0 0 0.5rem' }}>Edit <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>native-host/data/config/mcp-servers.json</code>. Supported transports: <strong>stdio</strong> (subprocess), <strong>http</strong> (POST), <strong>sse</strong> (Server-Sent Events).</p>
                  <p style={{ margin: '0 0 0.5rem' }}>Config is hot-reloaded — save and servers reconnect automatically.</p>
                  <p style={{ margin: 0 }}>For OAuth servers: open the MCP panel → click &quot;Authenticate&quot; → complete OAuth in popup → auto-reconnects.</p>
                </div>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Usage
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                  <p style={{ margin: '0 0 0.5rem' }}>MCP tools appear as <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>mcp__serverId__toolName</code>. Just ask the assistant to do something and it picks the best tool:</p>
                  <ul style={{ margin: 0, paddingLeft: '1rem', color: 'rgba(255,255,255,0.5)' }}>
                    <li>&quot;List my open GitHub PRs&quot; → <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>mcp__github__list_pull_requests</code></li>
                    <li>&quot;Send an email to Alex&quot; → <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>mcp__gmail__send_email</code></li>
                  </ul>
                </div>
              </details>
            </div>

            {/* File System and Shell */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                File System &amp; Shell
              </h3>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  FS Actions (Native, Fast)
                </summary>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      {[
                        ['FS_READ_FILE', 'Read file contents (supports ~ expansion)'],
                        ['FS_WRITE_FILE', 'Write content to a file (creates parent dirs)'],
                        ['FS_LIST_DIR', 'List directory with sizes and dates'],
                        ['FS_STAT', 'Check if path exists, get size/type'],
                        ['FS_COPY / FS_MOVE', 'Copy or move/rename a file'],
                        ['FS_CREATE_DIR', 'Create directory tree'],
                        ['FS_DELETE', 'Delete a single file'],
                      ].map(([action, desc], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: '#667eea', fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{action}</td>
                          <td style={{ padding: '0.4rem 0', color: 'rgba(255,255,255,0.5)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  CLI_EXEC (Shell Commands)
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                  <p style={{ margin: '0 0 0.5rem' }}>For complex operations, pipes, git, npm, python. The shell session is persistent within a conversation — <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>cd</code>, <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>export</code>, <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>source</code> all carry over.</p>
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                    CLI_EXEC: git status<br/>
                    CLI_EXEC: ls -la ~/projects | grep myapp<br/>
                    CLI_EXEC: npm run build
                  </div>
                </div>
              </details>
            </div>

            {/* Scheduling */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Scheduling
              </h3>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 0.75rem' }}>Create recurring tasks from either the plugin panel or Telegram:</p>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.75rem' }}>
                  /schedule 10:00 daily check efacturi intrari<br/>
                  /schedule 09:00 weekdays validate intrari<br/>
                  /schedule 08:00 Mon,Wed,Fri run payroll report<br/>
                  /schedule list<br/>
                  /schedule pause abc123<br/>
                  /schedule resume abc123<br/>
                  /schedule delete abc123
                </div>
                <p style={{ margin: '0 0 0.5rem' }}><strong>Formats:</strong> <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>HH:MM daily</code>, <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>HH:MM weekdays</code>, <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>HH:MM Mon,Wed,Fri</code>, or standard 5-field cron.</p>
                <p style={{ margin: 0 }}>Schedules persist across restarts. Results are always sent to Telegram.</p>
              </div>
            </div>

            {/* Memory and Learning */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Memory &amp; Learning
              </h3>

              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Memory Levels
                </summary>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      {[
                        ['Operator Profile', 'data/profile.md', 'Language, style, timezone, preferences'],
                        ['Practitioner Memory', 'practitioners/*/memory/', 'Domain patterns, corrections, best practices'],
                        ['Client Learnings', 'practitioners/*/firme/*/', 'Client-specific rules, mappings, exceptions'],
                      ].map(([level, file, desc], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: '#fff', fontWeight: 500, whiteSpace: 'nowrap' }}>{level}</td>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{file}</td>
                          <td style={{ padding: '0.4rem 0', color: 'rgba(255,255,255,0.5)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  How the Assistant Learns
                </summary>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '0.5rem' }}>
                  <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                    <li><strong>Corrections</strong> — &quot;No, the correct code is 628&quot; → saved immediately, prefixed CORRECTION:</li>
                    <li><strong>Confirmed patterns</strong> — When you proceed without objecting, validated patterns are saved</li>
                    <li><strong>Explicit teaching</strong> — &quot;Remember that LDM always uses code 371&quot; → saved to firm learnings</li>
                    <li><strong>Profile updates</strong> — &quot;Always respond in English&quot; → saved to operator profile</li>
                  </ul>
                </div>
              </details>
            </div>

            {/* Tool Priority */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                Tool Priority Order
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  ['1', 'MCP tools', 'API calls, no browser needed'],
                  ['2', 'Skill actions', 'Pre-built patterns for specific sites'],
                  ['3', 'CLI_EXEC', 'Shell commands for file/system operations'],
                  ['4', 'EXEC', 'Raw JavaScript in the browser tab'],
                  ['5', 'Browser visual', 'Scroll + screenshot + click (last resort)'],
                ].map(([num, name, desc]) => (
                  <div key={num} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0' }}>
                    <span style={{ color: '#667eea', fontWeight: 700, fontSize: '0.9rem', minWidth: '1.25rem' }}>{num}</span>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, minWidth: '7rem' }}>{name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CLI Socket */}
            <div style={cardStyle}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
                CLI &amp; Socket Interface
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                The native host exposes a Unix socket at <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>/tmp/horia-browser.sock</code>.
                Any process can send commands to the running headless browser.
              </p>
              <details>
                <summary style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Available Commands
                </summary>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      {[
                        ['navigate [url]', 'Navigate to URL'],
                        ['eval [jsExpression]', 'Evaluate JS in page'],
                        ['click [selector]', 'Click element'],
                        ['fill [selector, value]', 'Fill input field'],
                        ['screenshot [path?]', 'Capture page (save or base64)'],
                        ['wait [selector, timeout?]', 'Wait for element'],
                        ['url / title', 'Get current URL or title'],
                        ['ping', 'Health check'],
                      ].map(([cmd, desc], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: '#667eea', fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{cmd}</td>
                          <td style={{ padding: '0.4rem 0', color: 'rgba(255,255,255,0.5)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            <AdBanner slot={ADS_CONFIG.slots.pricingFooter} style={{ marginTop: '1rem' }} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};
