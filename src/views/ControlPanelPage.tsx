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
  const [liveUsage, setLiveUsage] = useState<{ tokensIn: number; tokensOut: number } | null>(null);
  const [liveProvider, setLiveProvider] = useState<{ provider: string; model: string } | null>(null);

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

  // Fetch live data from extension when connected and activated
  useEffect(() => {
    if (extensionBridge.state !== 'connected') return;
    if (!keySentToExtension && !extensionBridge.activated) return;

    let cancelled = false;

    const fetchLiveData = async () => {
      try {
        const [usage, providers] = await Promise.allSettled([
          extensionBridge.send<{ tokensIn: number; tokensOut: number }>('GET_USAGE'),
          extensionBridge.send<{ provider: string; model: string }>('GET_PROVIDERS'),
        ]);
        if (cancelled) return;
        if (usage.status === 'fulfilled') setLiveUsage(usage.value);
        if (providers.status === 'fulfilled') setLiveProvider(providers.value);
      } catch {
        // Extension commands failed — not critical
      }
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [keySentToExtension, extensionDetected]);

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

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return '#22c55e';
      case 'offline': return '#6b7280';
      default: return '#9ca3af';
    }
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
                }}>
                  Browser extension detected — keys can be sent directly.
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
                          {liveUsage && extensionBridge.deviceName === device.device_name && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', gap: '0.75rem' }}>
                              <span style={{ color: '#667eea' }}>Live: {formatTokens(liveUsage.tokensIn)} in / {formatTokens(liveUsage.tokensOut)} out</span>
                              {liveProvider && <span>{liveProvider.provider} / {liveProvider.model}</span>}
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
