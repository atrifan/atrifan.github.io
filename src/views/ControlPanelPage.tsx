'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

interface LiveUsageRaw {
  ok?: boolean;
  data?: {
    month?: string;
    totalCost?: number;
    providers?: Record<string, { totalCost: number; inputTokens: number; outputTokens: number; calls: number }>;
    today?: Record<string, { totalCost: number; inputTokens: number; outputTokens: number; calls: number }>;
  };
}

interface LiveUsage {
  monthly_cost: number;
  tokens: { input: number; output: number };
  calls_by_provider: Record<string, number>;
}

interface LiveProvidersRaw {
  providers?: Record<string, { type: string; models: Record<string, string>; region?: string }>;
  activeProvider?: string;
}

interface LiveProviderDisplay {
  name: string;
  models: string[];
  active: boolean;
}

interface LiveProviders {
  providers: LiveProviderDisplay[];
  active_provider: string;
  active_model: string;
}

interface LiveSkillsRaw {
  skills?: Array<{ name: string; id?: string; description?: string; matches?: string[]; autoActivate?: boolean; hasCode?: boolean; mcpServers?: string[]; practitionerId?: string; pluginId?: string }>;
  practitioners?: Array<{ id: string; name: string; pluginCount?: number; skillCount?: number; plugins?: Array<{ id: string; name: string; description?: string; matches?: string[]; startUrl?: string; mcpServers?: string[]; skillCount?: number }> }>;
  plugins?: Array<{ id: string; name: string; description?: string; matches?: string[]; startUrl?: string; mcpServers?: string[]; skillCount?: number; bindings?: Array<{ practitionerId: string; priority?: string }>; skills?: Array<{ id: string; name: string; description?: string; matches?: string[] }> }>;
}

interface LiveSkill {
  id: string;
  name: string;
  description?: string;
  matches?: string[];
  autoActivate?: boolean;
  hasCode?: boolean;
  mcpServers?: string[];
  practitionerId?: string;
  pluginId?: string;
}

interface LivePlugin {
  id: string;
  name: string;
  description?: string;
  matches?: string[];
  startUrl?: string;
  mcpServers?: string[];
  skillCount?: number;
  bindings?: Array<{ practitionerId: string; priority?: string }>;
  skills?: Array<{ id: string; name: string; description?: string; matches?: string[] }>;
}

interface LivePractitioner {
  id: string;
  name: string;
  pluginCount?: number;
  skillCount?: number;
  plugins: LivePlugin[];
}

interface LiveMCPServersRaw {
  servers?: Array<{ id: string; name: string; transport?: string; connected: boolean; toolCount?: number; authStatus?: string }>;
}

interface LiveMCPServer {
  name: string;
  status: string;
  tools_count?: number;
}

interface LiveMCPToolsRaw {
  tools?: Array<{ serverId?: string; name: string; description?: string }>;
}

interface LiveMCPTool {
  name: string;
  description?: string;
  server?: string;
}

interface LiveSchedulesRaw {
  schedules?: Array<{ id: string; cron: string; prompt: string; enabled: boolean; last_run?: string | null; source?: string }>;
}

interface LiveSchedule {
  id: string;
  name?: string;
  cron: string;
  next_run?: string;
  status: string;
}

interface LiveBrowserStatusRaw {
  running?: boolean;
}

interface LiveBrowserStatus {
  running: boolean;
}

interface LiveNotificationConfigRaw {
  config?: {
    channels?: {
      telegram?: { enabled: boolean; chat_id?: string };
      slack?: { enabled: boolean; webhook_url?: string };
    };
  };
}

interface LiveNotificationConfig {
  telegram?: { enabled: boolean; chat_id?: string };
  webhook?: { enabled: boolean; url?: string };
}

interface LiveVersionRaw {
  ok?: boolean;
  data?: { version?: string; gitCommit?: string; platform?: string; arch?: string; nodeVersion?: string };
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
  practitioners: LivePractitioner[] | null;
  plugins: LivePlugin[] | null;
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

interface InstalledPkg {
  id: string;
  type: string;
  version?: string;
  name?: string;
}

interface AvailablePkg {
  id: string;
  name: string;
  description: string | null;
  type: string;
  latest_version: string;
  blob_url: string;
  config_json?: Record<string, unknown> | null;
}

interface ExtBridge {
  state: string;
  send<T = unknown>(command: string, params: Record<string, unknown>): Promise<T>;
}

function PackagesTab({ extensionBridge: bridge, extensionDetected }: { extensionBridge: ExtBridge; extensionDetected: boolean }) {
  const [packages, setPackages] = useState<AvailablePkg[]>([]);
  const [installed, setInstalled] = useState<InstalledPkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await fetch('/api/packages');
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; connected: boolean }>>([]);

  const fetchInstalled = useCallback(async () => {
    if (!extensionDetected || bridge.state !== 'connected') return;
    try {
      const result = await bridge.send<{ packages?: InstalledPkg[] }>('LIST_INSTALLED', {});
      setInstalled(result?.packages || []);
    } catch { /* device may not support command yet */ }
    try {
      const mcpResult = await bridge.send<{ servers?: Array<{ id: string; name: string; connected: boolean }> }>('MCP_LIST_SERVERS', {});
      setMcpServers(mcpResult?.servers || []);
    } catch { /* ignore */ }
  }, [bridge, extensionDetected]);

  useEffect(() => {
    fetchAvailable();
  }, [fetchAvailable]);

  useEffect(() => {
    fetchInstalled();
  }, [fetchInstalled]);

  const getStatus = (pkg: AvailablePkg) => {
    if (pkg.type === 'mcp') {
      const mcpId = `marketplace__${pkg.id}`;
      return mcpServers.some(s => s.id === mcpId) ? 'installed' : 'not_installed';
    }
    const inst = installed.find(i => i.id === pkg.id);
    if (!inst) return 'not_installed';
    if (inst.version && inst.version !== pkg.latest_version) return 'update_available';
    return 'installed';
  };

  const handleInstall = async (pkg: AvailablePkg) => {
    setActionId(pkg.id);
    setActionErr(null);
    try {
      if (pkg.type === 'mcp' && pkg.config_json) {
        const cfg = pkg.config_json as any;
        await bridge.send('MCP_ADD_SERVER', {
          name: pkg.name,
          id: `marketplace__${pkg.id}`,
          transport: cfg.transport,
          url: cfg.url,
          command: cfg.command,
          args: cfg.args,
          env: cfg.env,
          source: 'marketplace',
          packageId: pkg.id,
        });
      } else {
        await bridge.send('INSTALL_PACKAGE', {
          type: pkg.type,
          id: pkg.id,
          source: pkg.blob_url,
          sourceType: 'archive',
        });
      }
      await fetchInstalled();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Install failed');
    }
    setActionId(null);
  };

  const handleUpdate = async (pkg: AvailablePkg) => {
    setActionId(pkg.id);
    setActionErr(null);
    try {
      await bridge.send('INSTALL_PACKAGE', {
        type: pkg.type,
        id: pkg.id,
        source: pkg.blob_url,
        sourceType: 'archive',
        update: true,
      });
      await fetchInstalled();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Update failed');
    }
    setActionId(null);
  };

  const handleRemove = async (pkg: AvailablePkg) => {
    setActionId(pkg.id);
    setActionErr(null);
    try {
      if (pkg.type === 'mcp') {
        await bridge.send('MCP_REMOVE_SERVER', { serverId: `marketplace__${pkg.id}` });
      } else {
        await bridge.send('UNINSTALL_PACKAGE', { id: pkg.id, type: pkg.type });
      }
      await fetchInstalled();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Remove failed');
    }
    setActionId(null);
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const typeBadgeStyle = (type: string): React.CSSProperties => {
    const colors: Record<string, { bg: string; fg: string; border: string }> = {
      plugin: { bg: 'rgba(59, 130, 246, 0.15)', fg: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      skill: { bg: 'rgba(34, 197, 94, 0.15)', fg: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
      practitioner: { bg: 'rgba(168, 85, 247, 0.15)', fg: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
      mcp: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    };
    const c = colors[type] || colors.plugin;
    return {
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: 500,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
    };
  };

  if (loading) {
    return <div style={cardStyle}><p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>Loading packages...</p></div>;
  }

  if (packages.length === 0) {
    return <div style={cardStyle}><p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>No packages available yet.</p></div>;
  }

  return (
    <>
      {!extensionDetected && (
        <div style={{ ...cardStyle, background: 'rgba(234, 179, 8, 0.06)', borderColor: 'rgba(234, 179, 8, 0.2)' }}>
          <p style={{ color: '#eab308', fontSize: '0.85rem', margin: 0 }}>
            Extension not connected. Install the browser extension and refresh this page to install packages on your device.
          </p>
        </div>
      )}

      {actionErr && (
        <div style={{ ...cardStyle, background: 'rgba(239, 68, 68, 0.06)', borderColor: 'rgba(239, 68, 68, 0.2)', padding: '0.75rem 1rem' }}>
          <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>{actionErr}</span>
        </div>
      )}

      <div style={cardStyle}>
        <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Available Packages
          <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontSize: '0.8rem' }}>({packages.length})</span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {packages.map(pkg => {
            const status = getStatus(pkg);
            const busy = actionId === pkg.id;
            const instVersion = installed.find(i => i.id === pkg.id)?.version;

            return (
              <div key={pkg.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem 1rem',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>{pkg.name}</span>
                    <span style={typeBadgeStyle(pkg.type)}>{pkg.type}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>v{pkg.latest_version}</span>
                  </div>
                  {pkg.description && (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pkg.description}
                    </div>
                  )}
                  {status === 'installed' && (
                    <div style={{ color: '#22c55e', fontSize: '0.7rem', marginTop: '0.2rem' }}>Installed{instVersion ? ` (v${instVersion})` : ''}</div>
                  )}
                  {status === 'update_available' && (
                    <div style={{ color: '#eab308', fontSize: '0.7rem', marginTop: '0.2rem' }}>Update available: v{instVersion} → v{pkg.latest_version}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {status === 'not_installed' && (
                    <button
                      onClick={() => handleInstall(pkg)}
                      disabled={!extensionDetected || busy}
                      style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: extensionDetected && !busy ? 'pointer' : 'not-allowed',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff',
                        opacity: !extensionDetected || busy ? 0.5 : 1,
                      }}
                    >
                      {busy ? '...' : 'Install'}
                    </button>
                  )}
                  {status === 'update_available' && (
                    <button
                      onClick={() => handleUpdate(pkg)}
                      disabled={!extensionDetected || busy}
                      style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: extensionDetected && !busy ? 'pointer' : 'not-allowed',
                        background: 'rgba(234, 179, 8, 0.2)',
                        color: '#eab308',
                        opacity: !extensionDetected || busy ? 0.5 : 1,
                      }}
                    >
                      {busy ? '...' : 'Update'}
                    </button>
                  )}
                  {(status === 'installed' || status === 'update_available') && (
                    <button
                      onClick={() => handleRemove(pkg)}
                      disabled={!extensionDetected || busy}
                      style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: extensionDetected && !busy ? 'pointer' : 'not-allowed',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        opacity: !extensionDetected || busy ? 0.5 : 1,
                      }}
                    >
                      {busy ? '...' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

interface ControlPanelPageProps {
  showDownloads?: boolean;
}

export const ControlPanelPage: React.FC<ControlPanelPageProps> = ({ showDownloads }) => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'usage' | 'logs' | 'docs' | 'packages' | 'budget'>('overview');
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
    practitioners: null,
    plugins: null,
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
  const [deviceSubTab, setDeviceSubTab] = useState<'info' | 'logs' | 'usage'>('info');

  // Logs
  interface LogEntry { ts: number; source: 'bridge' | 'native'; direction: 'in' | 'out'; message: string; data?: unknown; level?: string; category?: string }
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'bridge' | 'native'>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Native host logs (from GET_LOGS)
  interface NativeLogEntry { ts: number; level: 'info' | 'warn' | 'error'; category: string; message: string; data?: unknown }
  const [nativeLogs, setNativeLogs] = useState<NativeLogEntry[]>([]);
  const [nativeLogDays, setNativeLogDays] = useState<string[]>([]);
  const [selectedLogDay, setSelectedLogDay] = useState<string>('');
  const [nativeLogCategories, setNativeLogCategories] = useState<Set<string>>(new Set());
  const [nativeLogLevels, setNativeLogLevels] = useState<Set<string>>(new Set(['info', 'warn', 'error']));
  const [logSearch, setLogSearch] = useState('');
  const [nativeLogsLoading, setNativeLogsLoading] = useState(false);
  const [nativeLogAutoRefresh, setNativeLogAutoRefresh] = useState(true);
  const lastNativeLogTs = useRef<number>(0);

  const [serverPlan, setServerPlan] = useState<string>('free');
  const plan = serverPlan;

  // Budget analytics state
  interface BudgetAnalytics {
    remainingBalance: number;
    totalSpent: number;
    totalDeposited: number;
    modelSummaries: Array<{ provider: string; model: string; totalCost: number; totalTokens: number; count: number }>;
    deviceSummaries: Array<{ apiKeyId: string; deviceName: string; totalCost: number; totalTokens: number; count: number }>;
    purchaseHistory: Array<{ id: number; amount: number; type: string; description: string; createdAt: string }>;
    dailySpending: Array<{ date: string; cost: number; tokens: number; count: number }>;
    rawDeviceLogs: Array<{ apiKeyId: string | null; deviceName: string | null; provider: string; model: string; tokensUsed: number; costDeducted: number; createdAt: string }>;
  }
  const [budgetData, setBudgetData] = useState<BudgetAnalytics | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetMonth, setBudgetMonth] = useState<string>('all');
  const [budgetDevice, setBudgetDevice] = useState<string>('all');
  const [budgetModel, setBudgetModel] = useState<string>('all');
  const [buyAmount, setBuyAmount] = useState(5);
  const [buyLoading, setBuyLoading] = useState(false);

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

  const fetchBudgetData = useCallback(async () => {
    setBudgetLoading(true);
    try {
      const res = await fetch('/api/dashboard/paid-stats');
      if (res.ok) {
        const data = await res.json();
        setBudgetData(data);
      }
    } catch (e) {
      console.error('Failed to fetch budget data:', e);
    } finally {
      setBudgetLoading(false);
    }
  }, []);

  useEffect(() => {
    const needsBudget = activeTab === 'budget' || (activeTab === 'devices' && deviceSubTab === 'usage');
    if (needsBudget && !budgetData && !budgetLoading) {
      fetchBudgetData();
    }
  }, [activeTab, deviceSubTab, budgetData, budgetLoading, fetchBudgetData]);

  const filteredBudgetLogs = useMemo(() => {
    if (!budgetData) return [];
    let logs = budgetData.rawDeviceLogs;
    if (budgetMonth !== 'all') {
      logs = logs.filter(l => l.createdAt.startsWith(budgetMonth));
    }
    if (budgetDevice !== 'all') {
      logs = logs.filter(l => (l.apiKeyId || '') === budgetDevice);
    }
    if (budgetModel !== 'all') {
      logs = logs.filter(l => l.model === budgetModel);
    }
    return logs;
  }, [budgetData, budgetMonth, budgetDevice, budgetModel]);

  const filteredModelSummaries = useMemo(() => {
    const map = new Map<string, { provider: string; model: string; totalCost: number; totalTokens: number; count: number }>();
    for (const log of filteredBudgetLogs) {
      const key = `${log.provider}/${log.model}`;
      const existing = map.get(key) || { provider: log.provider, model: log.model, totalCost: 0, totalTokens: 0, count: 0 };
      existing.totalCost += parseFloat(String(log.costDeducted || '0'));
      existing.totalTokens += log.tokensUsed;
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredBudgetLogs]);

  const filteredDailySpending = useMemo(() => {
    const map = new Map<string, { date: string; cost: number; tokens: number; count: number }>();
    for (const log of filteredBudgetLogs) {
      const date = new Date(log.createdAt).toISOString().split('T')[0];
      const existing = map.get(date) || { date, cost: 0, tokens: 0, count: 0 };
      existing.cost += parseFloat(String(log.costDeducted || '0'));
      existing.tokens += log.tokensUsed;
      existing.count += 1;
      map.set(date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredBudgetLogs]);

  const filteredDeviceSummaries = useMemo(() => {
    const map = new Map<string, { apiKeyId: string; deviceName: string; totalCost: number; totalTokens: number; count: number }>();
    for (const log of filteredBudgetLogs) {
      const key = log.apiKeyId || 'unknown';
      const existing = map.get(key) || { apiKeyId: log.apiKeyId || '', deviceName: log.deviceName || 'Unknown', totalCost: 0, totalTokens: 0, count: 0 };
      existing.totalCost += parseFloat(String(log.costDeducted || '0'));
      existing.totalTokens += log.tokensUsed;
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredBudgetLogs]);

  const availableMonths = useMemo(() => {
    if (!budgetData) return [];
    const months = new Set<string>();
    for (const log of budgetData.rawDeviceLogs) {
      months.add(log.createdAt.slice(0, 7));
    }
    return Array.from(months).sort().reverse();
  }, [budgetData]);

  useEffect(() => {
    fetchDevices();
    fetchUsage();
    fetch('/api/plugin/version').then(r => r.json()).then(d => {
      if (d.latest) setLatestVersion(d.latest);
    }).catch(() => {});
  }, [fetchDevices, fetchUsage]);

  const addLog = useCallback((source: 'bridge' | 'native', direction: 'in' | 'out', message: string, data?: unknown) => {
    setLogs(prev => {
      const next = [...prev, { ts: Date.now(), source, direction, message, data }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  const fetchNativeLogs = useCallback(async (params?: { date?: string; since?: number }) => {
    if (extensionBridge.state !== 'connected') return;
    try {
      setNativeLogsLoading(true);
      const result = await extensionBridge.send<{ ok?: boolean; files?: string[]; logs?: NativeLogEntry[]; date?: string }>('GET_LOGS', params || {});
      if (result?.files) {
        setNativeLogDays(result.files.map(f => f.replace('.jsonl', '')));
      }
      if (result?.logs && result.logs.length > 0) {
        if (params?.since) {
          setNativeLogs(prev => [...prev, ...result.logs!]);
        } else {
          setNativeLogs(result.logs);
        }
        const maxTs = Math.max(...result.logs.map(l => l.ts));
        if (maxTs > lastNativeLogTs.current) lastNativeLogTs.current = maxTs;
        const cats = new Set(result.logs.map(l => l.category));
        setNativeLogCategories(prev => new Set([...prev, ...cats]));
      } else if (!params?.since) {
        setNativeLogs([]);
      }
    } catch {
      // GET_LOGS not available
    } finally {
      setNativeLogsLoading(false);
    }
  }, []);

  // Auto-refresh native logs
  useEffect(() => {
    const logsVisible = activeTab === 'logs' || (activeTab === 'devices' && expandedDevice !== null && deviceSubTab === 'logs');
    if (!extensionDetected || !logsVisible || !nativeLogAutoRefresh) return;
    const interval = setInterval(() => {
      if (lastNativeLogTs.current > 0) {
        fetchNativeLogs({ since: lastNativeLogTs.current });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [extensionDetected, activeTab, deviceSubTab, expandedDevice, nativeLogAutoRefresh, fetchNativeLogs]);

  // Fetch logs on tab/sub-tab open
  useEffect(() => {
    if (!extensionDetected) return;
    const logsVisible = activeTab === 'logs' || (activeTab === 'devices' && expandedDevice !== null && deviceSubTab === 'logs');
    if (logsVisible) fetchNativeLogs();
  }, [activeTab, deviceSubTab, expandedDevice, extensionDetected, fetchNativeLogs]);

  // Extension detection via bridge + log capture
  useEffect(() => {
    extensionBridge.start();
    addLog('bridge', 'out', 'discover (start)');

    if (extensionBridge.state === 'connected') {
      setExtensionDetected(true);
    }

    const unsub = extensionBridge.onStateChange((state) => {
      setExtensionDetected(state === 'connected');
      addLog('bridge', 'in', `state → ${state}`);
    });

    // Capture all messages for logging
    const logHandler = (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.source === 'tex-extension') {
        addLog('bridge', 'in', d.action, d.action === 'command_response' ? { id: d.id, ok: d.ok, error: d.error } : undefined);
        if (d.action === 'device_activated' && d.success) {
          setKeySentToExtension(true);
        }
      } else if (d.source === 'tulzo') {
        addLog('bridge', 'out', d.action, d.action === 'command' ? { command: d.command, id: d.id } : undefined);
      }
    };
    window.addEventListener('message', logHandler);

    return () => {
      unsub();
      window.removeEventListener('message', logHandler);
    };
  }, [addLog]);

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

  // Transform raw responses into display-ready state
  const transformRawData = useCallback((raw: {
    usage?: LiveUsageRaw | { month?: string; totalCost?: number; providers?: Record<string, { totalCost: number; inputTokens: number; outputTokens: number; calls: number }>; today?: Record<string, { totalCost: number; inputTokens: number; outputTokens: number; calls: number }> };
    providers?: LiveProvidersRaw;
    skills?: LiveSkillsRaw;
    mcpServers?: LiveMCPServersRaw | Array<{ id: string; name: string; connected: boolean; toolCount?: number }>;
    mcpTools?: LiveMCPToolsRaw | Array<{ name: string; description?: string; serverId?: string }>;
    schedules?: LiveSchedulesRaw | Array<{ id: string; cron: string; prompt: string; enabled: boolean }>;
    browser?: LiveBrowserStatusRaw;
    notifications?: LiveNotificationConfigRaw | { channels?: { telegram?: { enabled: boolean; chat_id?: string }; slack?: { enabled: boolean; webhook_url?: string } } };
    version?: LiveVersionRaw | { version?: string; gitCommit?: string; platform?: string; arch?: string; nodeVersion?: string };
    practitioners?: Array<{ id: string; name: string; pluginCount?: number; skillCount?: number; plugins?: Array<{ id: string; name: string; description?: string; matches?: string[] }> }>;
  }): Omit<LiveData, 'loading' | 'lastFetched'> => {
    // Usage
    let usage: LiveUsage | null = null;
    const usageData = (raw.usage && 'data' in raw.usage) ? raw.usage.data : raw.usage;
    if (usageData && ('totalCost' in usageData || 'providers' in usageData)) {
      let totalIn = 0, totalOut = 0;
      const callsByProvider: Record<string, number> = {};
      const providers = (usageData as { providers?: Record<string, { inputTokens: number; outputTokens: number; calls: number }> }).providers;
      if (providers) {
        for (const [name, p] of Object.entries(providers)) {
          totalIn += p.inputTokens || 0;
          totalOut += p.outputTokens || 0;
          callsByProvider[name] = p.calls || 0;
        }
      }
      usage = { monthly_cost: (usageData as { totalCost?: number }).totalCost || 0, tokens: { input: totalIn, output: totalOut }, calls_by_provider: callsByProvider };
    }

    // Providers
    let providersResult: LiveProviders | null = null;
    if (raw.providers?.providers && Object.keys(raw.providers.providers).length > 0) {
      const active = raw.providers.activeProvider || '';
      const list: LiveProviderDisplay[] = Object.entries(raw.providers.providers).map(([name, p]) => ({
        name,
        models: Object.values(p.models || {}),
        active: name === active,
      }));
      const activeModels = raw.providers.providers[active]?.models;
      providersResult = { providers: list, active_provider: active, active_model: activeModels?.orchestrator || '' };
    }

    // Skills + Practitioners + Plugins
    let skills: LiveSkill[] | null = null;
    let practitioners: LivePractitioner[] | null = null;
    let plugins: LivePlugin[] | null = null;
    const rawSkillsObj = raw.skills && 'skills' in raw.skills ? raw.skills : null;
    if (rawSkillsObj?.skills && rawSkillsObj.skills.length > 0) {
      skills = rawSkillsObj.skills.map(s => ({
        id: s.id || s.name, name: s.name, description: s.description,
        matches: s.matches, autoActivate: s.autoActivate, hasCode: s.hasCode,
        mcpServers: s.mcpServers, practitionerId: s.practitionerId, pluginId: s.pluginId,
      }));
    }
    if (rawSkillsObj?.practitioners && rawSkillsObj.practitioners.length > 0) {
      practitioners = rawSkillsObj.practitioners.map(p => ({
        id: p.id, name: p.name, pluginCount: p.pluginCount, skillCount: p.skillCount,
        plugins: (p.plugins || []).map(pl => ({
          id: pl.id, name: pl.name, description: pl.description,
          matches: pl.matches, startUrl: pl.startUrl, mcpServers: pl.mcpServers, skillCount: pl.skillCount,
        })),
      }));
    }
    if (rawSkillsObj?.plugins && rawSkillsObj.plugins.length > 0) {
      plugins = rawSkillsObj.plugins.map(pl => ({
        id: pl.id, name: pl.name, description: pl.description,
        matches: pl.matches, startUrl: pl.startUrl, mcpServers: pl.mcpServers, skillCount: pl.skillCount,
        bindings: pl.bindings, skills: pl.skills,
      }));
    }

    // MCP Servers
    let mcpServers: LiveMCPServer[] | null = null;
    const serversList = raw.mcpServers && 'servers' in raw.mcpServers ? raw.mcpServers.servers : Array.isArray(raw.mcpServers) ? raw.mcpServers : null;
    if (serversList && serversList.length > 0) {
      mcpServers = serversList.map(s => ({ name: s.name, status: s.connected ? 'connected' : 'disconnected', tools_count: s.toolCount }));
    }

    // MCP Tools
    let mcpTools: LiveMCPTool[] | null = null;
    const toolsList = raw.mcpTools && 'tools' in raw.mcpTools ? raw.mcpTools.tools : Array.isArray(raw.mcpTools) ? raw.mcpTools : null;
    if (toolsList && toolsList.length > 0) {
      mcpTools = toolsList.map(t => ({ name: t.name, description: t.description, server: t.serverId }));
    }

    // Schedules
    let schedules: LiveSchedule[] | null = null;
    const schedList = raw.schedules && 'schedules' in raw.schedules ? raw.schedules.schedules : Array.isArray(raw.schedules) ? raw.schedules : null;
    if (schedList && schedList.length > 0) {
      schedules = schedList.map(s => ({ id: s.id, name: s.prompt, cron: s.cron, status: s.enabled ? 'active' : 'paused' }));
    }

    // Browser
    let browserStatus: LiveBrowserStatus | null = null;
    const bRaw = raw.browser;
    if (bRaw && bRaw.running != null) {
      browserStatus = { running: bRaw.running };
    }

    // Notifications
    let notifications: LiveNotificationConfig | null = null;
    const nRaw = raw.notifications && 'config' in raw.notifications ? raw.notifications.config : raw.notifications;
    const channels = nRaw && 'channels' in (nRaw as object) ? (nRaw as { channels?: { telegram?: { enabled: boolean; chat_id?: string }; slack?: { enabled: boolean; webhook_url?: string } } }).channels : null;
    if (channels) {
      notifications = {};
      if (channels.telegram) notifications.telegram = { enabled: channels.telegram.enabled, chat_id: channels.telegram.chat_id };
      if (channels.slack) notifications.webhook = { enabled: channels.slack.enabled, url: channels.slack.webhook_url };
    }

    // Version
    let version: LiveVersion | null = null;
    const vRaw = raw.version && 'data' in raw.version ? raw.version.data : raw.version;
    if (vRaw && (vRaw as { version?: string }).version) {
      const v = vRaw as { version: string; gitCommit?: string; platform?: string; arch?: string; nodeVersion?: string };
      version = { version: v.version, gitCommit: v.gitCommit || '', platform: v.platform || '', arch: v.arch || '', nodeVersion: v.nodeVersion || '' };
    }

    return { usage, providers: providersResult, skills, practitioners, plugins, mcpServers, mcpTools, schedules, browserStatus, notifications, version };
  }, []);

  // Fetch all live data — tries GET_DEVICE_INFO (single call), falls back to individual commands
  const fetchLiveData = useCallback(async () => {
    if (extensionBridge.state !== 'connected') return;

    setLiveData(prev => ({ ...prev, loading: true }));

    // Try single-call GET_DEVICE_INFO first
    try {
      addLog('native', 'out', 'GET_DEVICE_INFO');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await extensionBridge.send<{ ok?: boolean; data?: any }>('GET_DEVICE_INFO');
      addLog('native', 'in', 'GET_DEVICE_INFO response', { hasData: !!result?.data });
      if (result?.data) {
        const d = result.data;
        const transformed = transformRawData({
          usage: d.usage,
          providers: d.providers,
          skills: d.skills || d.practitioners || d.plugins ? { skills: d.skills, practitioners: d.practitioners, plugins: d.plugins } : undefined,
          mcpServers: d.mcpServers,
          mcpTools: d.mcpTools ? { tools: d.mcpTools } : undefined,
          schedules: d.schedules ? { schedules: d.schedules } : undefined,
          browser: d.browser,
          notifications: d.notifications ? { config: d.notifications } : undefined,
          version: d.version,
        });
        setLiveData({ ...transformed, loading: false, lastFetched: Date.now() });
        return;
      }
    } catch (e) {
      addLog('native', 'in', 'GET_DEVICE_INFO failed, falling back', { error: e instanceof Error ? e.message : String(e) });
    }

    // Fallback: individual commands
    addLog('native', 'out', 'Fetching 9 individual commands');
    const results = await Promise.allSettled([
      extensionBridge.send<LiveUsageRaw>('GET_USAGE'),
      extensionBridge.send<LiveProvidersRaw>('GET_PROVIDERS'),
      extensionBridge.send<LiveSkillsRaw>('LIST_SKILLS'),
      extensionBridge.send<LiveMCPServersRaw>('MCP_LIST_SERVERS'),
      extensionBridge.send<LiveMCPToolsRaw>('MCP_LIST_TOOLS'),
      extensionBridge.send<LiveSchedulesRaw>('SCHEDULE_LIST'),
      extensionBridge.send<LiveBrowserStatusRaw>('DAEMON_BROWSER_STATUS'),
      extensionBridge.send<LiveNotificationConfigRaw>('NOTIFICATION_GET_CONFIG'),
      extensionBridge.send<LiveVersionRaw>('GET_VERSION'),
    ]);

    const fulfilled = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCmds = ['GET_USAGE', 'GET_PROVIDERS', 'LIST_SKILLS', 'MCP_LIST_SERVERS', 'MCP_LIST_TOOLS', 'SCHEDULE_LIST', 'DAEMON_BROWSER_STATUS', 'NOTIFICATION_GET_CONFIG', 'GET_VERSION']
      .filter((_, i) => results[i].status === 'rejected');
    addLog('native', 'in', `${successCount}/9 commands succeeded`, failedCmds.length > 0 ? { failed: failedCmds } : undefined);

    const transformed = transformRawData({
      usage: fulfilled(results[0]) || undefined,
      providers: fulfilled(results[1]) || undefined,
      skills: fulfilled(results[2]) || undefined,
      mcpServers: fulfilled(results[3]) || undefined,
      mcpTools: fulfilled(results[4]) || undefined,
      schedules: fulfilled(results[5]) || undefined,
      browser: fulfilled(results[6]) || undefined,
      notifications: fulfilled(results[7]) || undefined,
      version: fulfilled(results[8]) || undefined,
    });

    setLiveData({ ...transformed, loading: false, lastFetched: Date.now() });
  }, [transformRawData, addLog]);

  useEffect(() => {
    if (!extensionDetected) return;
    fetchLiveData();
    fetchNativeLogs();
  }, [extensionDetected, fetchLiveData, fetchNativeLogs]);

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
          <button onClick={() => setActiveTab('logs')} style={tabStyle('logs')}>Logs</button>
          <button onClick={() => setActiveTab('docs')} style={tabStyle('docs')}>Docs</button>
          <button onClick={() => setActiveTab('packages')} style={tabStyle('packages')}>Packages</button>
          <button onClick={() => setActiveTab('budget')} style={tabStyle('budget')}>Budget</button>
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
                        onClick={() => { setExpandedDevice(isExpanded ? null : device.id); if (!isExpanded) setDeviceSubTab('info'); }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedDevice(isExpanded ? null : device.id); if (!isExpanded) setDeviceSubTab('info'); } }}
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
                          {/* Sub-tab navigation */}
                          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem' }}>
                            {(['info', ...(isLiveDevice ? ['logs'] : []), 'usage'] as const).map(tab => (
                              <button
                                key={tab}
                                onClick={(e) => { e.stopPropagation(); setDeviceSubTab(tab as 'info' | 'logs' | 'usage'); }}
                                style={{
                                  background: deviceSubTab === tab ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${deviceSubTab === tab ? 'rgba(102, 126, 234, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                                  borderRadius: '6px', padding: '0.3rem 0.7rem',
                                  color: deviceSubTab === tab ? '#667eea' : 'rgba(255,255,255,0.5)',
                                  cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500,
                                }}
                              >
                                {tab === 'info' ? 'Info' : tab === 'logs' ? 'Logs' : 'Usage'}
                              </button>
                            ))}
                          </div>

                          {/* Info sub-tab */}
                          {deviceSubTab === 'info' && (
                          <>
                          {/* Version info */}
                          {isLiveDevice && liveData.version?.version && (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.8rem' }}>
                              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Version: </span><span style={{ color: '#fff' }}>v{liveData.version.version}</span></div>
                              {liveData.version.gitCommit && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Commit: </span><span style={{ color: '#fff' }}>{liveData.version.gitCommit}</span></div>}
                              {liveData.version.platform && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Platform: </span><span style={{ color: '#fff' }}>{liveData.version.platform}{liveData.version.arch ? `/${liveData.version.arch}` : ''}</span></div>}
                              {liveData.version.nodeVersion && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Node: </span><span style={{ color: '#fff' }}>{liveData.version.nodeVersion}</span></div>}
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

                          {/* Practitioners */}
                          {isLiveDevice && liveData.practitioners && liveData.practitioners.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Practitioners ({liveData.practitioners.length})</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {liveData.practitioners.map((p) => (
                                  <div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.5rem 0.7rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: p.plugins.length > 0 ? '0.35rem' : '0' }}>
                                      <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{p.name}</span>
                                      {p.pluginCount ? (
                                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
                                          {p.pluginCount} plugins
                                        </span>
                                      ) : null}
                                    </div>
                                    {p.plugins.length > 0 && (
                                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', paddingLeft: '0.5rem' }}>
                                        {p.plugins.map(pl => (
                                          <span key={pl.id} style={{ background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.15)', borderRadius: '5px', padding: '0.2rem 0.4rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }} title={pl.description}>
                                            {pl.name}{pl.skillCount ? ` (${pl.skillCount})` : ''}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Standalone Plugins */}
                          {isLiveDevice && liveData.plugins && liveData.plugins.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Standalone Plugins ({liveData.plugins.length})</div>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {liveData.plugins.map((pl) => (
                                  <span key={pl.id} style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)' }} title={`${pl.description || ''}${pl.bindings?.length ? `\nBound to: ${pl.bindings.map(b => b.practitionerId).join(', ')}` : ''}`}>
                                    {pl.name}{pl.skillCount ? ` (${pl.skillCount} skills)` : ''}{pl.bindings?.length ? ' →' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Skills */}
                          {isLiveDevice && liveData.skills && liveData.skills.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Skills ({liveData.skills.length})</div>
                              <details>
                                <summary style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', cursor: 'pointer', marginBottom: '0.35rem' }}>
                                  {liveData.skills.length} skills · {liveData.practitioners?.length || 0} practitioners · {liveData.plugins?.length || 0} standalone plugins
                                </summary>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                  {liveData.skills.map((skill) => (
                                    <span key={skill.id} style={{
                                      background: skill.practitionerId ? 'rgba(34, 197, 94, 0.08)' : skill.pluginId ? 'rgba(168, 85, 247, 0.08)' : 'rgba(102, 126, 234, 0.08)',
                                      border: `1px solid ${skill.practitionerId ? 'rgba(34, 197, 94, 0.15)' : skill.pluginId ? 'rgba(168, 85, 247, 0.15)' : 'rgba(102, 126, 234, 0.15)'}`,
                                      borderRadius: '5px', padding: '0.2rem 0.4rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)',
                                    }} title={`${skill.description || ''}${skill.matches?.length ? `\nMatches: ${skill.matches.join(', ')}` : ''}`}>
                                      {skill.name}
                                    </span>
                                  ))}
                                </div>
                              </details>
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
                            {isLiveDevice && liveData.browserStatus && liveData.browserStatus.running != null && (
                              <div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Browser</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                  {statusDot(liveData.browserStatus.running ? 'online' : 'offline')}
                                  <span style={{ color: '#fff' }}>{liveData.browserStatus.running ? 'Running' : 'Stopped'}</span>
                                </div>
                              </div>
                            )}
                            {isLiveDevice && liveData.notifications && (liveData.notifications.telegram || liveData.notifications.webhook) && (
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

                          {/* No live data available */}
                          {isLiveDevice && !liveData.version && !liveData.providers && !liveData.skills && !liveData.mcpServers && !liveData.browserStatus && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Created: </span><span style={{ color: '#fff' }}>{new Date(device.created_at).toLocaleDateString()}</span></div>
                                {device.last_used_at && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Last used: </span><span style={{ color: '#fff' }}>{relativeTime(device.last_used_at)}</span></div>}
                              </div>
                              <div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '8px', padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: 'rgba(251, 191, 36, 0.9)' }}>
                                Extension connected but native host not responding. Start it with <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>node bin/cli.js start</code> to see live data.
                              </div>
                              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', margin: '0.5rem 0 0' }}>
                                Use Refresh to retry.
                              </p>
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
                          </>
                          )}

                          {/* Logs sub-tab */}
                          {deviceSubTab === 'logs' && isLiveDevice && (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  Native Host Logs
                                  {nativeLogAutoRefresh && (
                                    <span style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', fontSize: '0.6rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px' }}>Live</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setNativeLogAutoRefresh(!nativeLogAutoRefresh); }}
                                    style={{
                                      background: nativeLogAutoRefresh ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.05)',
                                      border: `1px solid ${nativeLogAutoRefresh ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                                      borderRadius: '6px', padding: '0.3rem 0.6rem',
                                      color: nativeLogAutoRefresh ? '#22c55e' : 'rgba(255,255,255,0.5)',
                                      cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500,
                                    }}
                                  >
                                    Auto-refresh
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); fetchNativeLogs(selectedLogDay ? { date: selectedLogDay } : undefined); }}
                                    disabled={nativeLogsLoading}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.3rem 0.6rem', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.7rem' }}
                                  >
                                    {nativeLogsLoading ? 'Loading...' : 'Refresh'}
                                  </button>
                                </div>
                              </div>

                              {/* Day picker */}
                              {nativeLogDays.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                  {nativeLogDays.map(day => (
                                    <button
                                      key={day}
                                      onClick={(e) => { e.stopPropagation(); setSelectedLogDay(day); fetchNativeLogs({ date: day }); }}
                                      style={{
                                        background: selectedLogDay === day ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${selectedLogDay === day ? 'rgba(102, 126, 234, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                                        borderRadius: '6px', padding: '0.25rem 0.5rem',
                                        color: selectedLogDay === day ? '#667eea' : 'rgba(255,255,255,0.5)',
                                        cursor: 'pointer', fontSize: '0.65rem',
                                      }}
                                    >
                                      {day}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Filters row */}
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                  {['agent', 'mcp', 'skill', 'schedule', 'telegram', 'browser', 'system'].map(cat => {
                                    const active = nativeLogCategories.size === 0 || nativeLogCategories.has(cat);
                                    const catColors: Record<string, string> = { agent: '#667eea', mcp: '#22c55e', skill: '#a855f7', schedule: '#f59e0b', telegram: '#06b6d4', browser: '#ec4899', system: '#6b7280' };
                                    return (
                                      <button
                                        key={cat}
                                        onClick={(e) => { e.stopPropagation(); setNativeLogCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); }}
                                        style={{
                                          background: active ? `${catColors[cat]}15` : 'transparent',
                                          border: `1px solid ${active ? `${catColors[cat]}40` : 'rgba(255,255,255,0.06)'}`,
                                          borderRadius: '4px', padding: '0.2rem 0.4rem',
                                          color: active ? catColors[cat] : 'rgba(255,255,255,0.3)',
                                          cursor: 'pointer', fontSize: '0.6rem',
                                        }}
                                      >
                                        {cat}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                                  {(['info', 'warn', 'error'] as const).map(lvl => {
                                    const active = nativeLogLevels.has(lvl);
                                    const lvlColor = lvl === 'error' ? '#ef4444' : lvl === 'warn' ? '#f59e0b' : 'rgba(255,255,255,0.5)';
                                    return (
                                      <button
                                        key={lvl}
                                        onClick={(e) => { e.stopPropagation(); setNativeLogLevels(prev => { const next = new Set(prev); if (next.has(lvl)) next.delete(lvl); else next.add(lvl); return next; }); }}
                                        style={{
                                          background: active ? `${lvlColor}15` : 'transparent',
                                          border: `1px solid ${active ? `${lvlColor}40` : 'rgba(255,255,255,0.06)'}`,
                                          borderRadius: '4px', padding: '0.2rem 0.4rem',
                                          color: active ? lvlColor : 'rgba(255,255,255,0.3)',
                                          cursor: 'pointer', fontSize: '0.6rem',
                                        }}
                                      >
                                        {lvl}
                                      </button>
                                    );
                                  })}
                                </div>
                                <input
                                  type="text"
                                  value={logSearch}
                                  onChange={(e) => setLogSearch(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Search logs..."
                                  style={{
                                    marginLeft: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px', padding: '0.3rem 0.6rem', color: '#fff', fontSize: '0.7rem', outline: 'none', width: '10rem',
                                  }}
                                />
                              </div>

                              {/* Stats bar */}
                              {nativeLogs.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>
                                  {Object.entries(nativeLogs.reduce((acc, l) => { acc[l.category] = (acc[l.category] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([cat, count]) => (
                                    <span key={cat}>{cat}: {count}</span>
                                  ))}
                                  <span style={{ color: '#ef4444' }}>errors: {nativeLogs.filter(l => l.level === 'error').length}</span>
                                </div>
                              )}

                              {/* Log entries */}
                              <div style={{
                                background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem',
                                maxHeight: '24rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: 1.6,
                              }}>
                                {(() => {
                                  const filtered = nativeLogs
                                    .filter(l => nativeLogLevels.has(l.level))
                                    .filter(l => nativeLogCategories.size === 0 || nativeLogCategories.has(l.category))
                                    .filter(l => !logSearch || l.message.toLowerCase().includes(logSearch.toLowerCase()));
                                  if (filtered.length === 0) {
                                    return <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>
                                      {nativeLogs.length === 0 ? 'No native host logs available.' : 'No logs match current filters.'}
                                    </div>;
                                  }
                                  return filtered.map((log, i) => {
                                    const lvlColor = log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : 'rgba(255,255,255,0.4)';
                                    const catColors: Record<string, string> = { agent: '#667eea', mcp: '#22c55e', skill: '#a855f7', schedule: '#f59e0b', telegram: '#06b6d4', browser: '#ec4899', system: '#6b7280' };
                                    return (
                                      <div key={`${log.ts}-${i}`} style={{ display: 'flex', gap: '0.4rem', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'flex-start' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.2)', minWidth: '5.5rem', flexShrink: 0 }}>
                                          {new Date(log.ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{String(log.ts % 1000).padStart(3, '0')}
                                        </span>
                                        <span style={{ color: lvlColor, minWidth: '0.5rem', flexShrink: 0 }}>
                                          {log.level === 'error' ? '!' : log.level === 'warn' ? '*' : ' '}
                                        </span>
                                        <span style={{ color: catColors[log.category] || '#6b7280', minWidth: '4.5rem', flexShrink: 0, fontSize: '0.6rem', paddingTop: '0.1rem' }}>
                                          {log.category}
                                        </span>
                                        <span style={{ color: log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fde68a' : 'rgba(255,255,255,0.75)', wordBreak: 'break-all', flex: 1 }}>
                                          {log.message}
                                          {log.data != null && (
                                            <details style={{ display: 'inline' }}>
                                              <summary style={{ color: 'rgba(255,255,255,0.25)', cursor: 'pointer', display: 'inline', marginLeft: '0.35rem' }}>[data]</summary>
                                              <pre style={{ color: 'rgba(255,255,255,0.3)', margin: '0.2rem 0 0', fontSize: '0.6rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(log.data, null, 2)}</pre>
                                            </details>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Usage sub-tab */}
                          {deviceSubTab === 'usage' && (
                            <div>
                              {budgetLoading && !budgetData ? (
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: 0 }}>Loading usage data...</p>
                              ) : !budgetData ? (
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: 0 }}>No usage data available yet.</p>
                              ) : (() => {
                                const deviceLogs = budgetData.rawDeviceLogs.filter(l => l.apiKeyId === device.id);
                                if (deviceLogs.length === 0) {
                                  return <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: 0 }}>No AI usage recorded for this device yet.</p>;
                                }
                                const totalCost = deviceLogs.reduce((s, l) => s + parseFloat(String(l.costDeducted || '0')), 0);
                                const totalTokens = deviceLogs.reduce((s, l) => s + l.tokensUsed, 0);
                                const totalRequests = deviceLogs.length;

                                const modelMap = new Map<string, { model: string; cost: number; tokens: number; count: number }>();
                                const dailyMap = new Map<string, { date: string; cost: number; count: number }>();
                                for (const log of deviceLogs) {
                                  const mKey = log.model || 'unknown';
                                  const mEx = modelMap.get(mKey) || { model: mKey, cost: 0, tokens: 0, count: 0 };
                                  mEx.cost += parseFloat(String(log.costDeducted || '0'));
                                  mEx.tokens += log.tokensUsed;
                                  mEx.count += 1;
                                  modelMap.set(mKey, mEx);

                                  const date = new Date(log.createdAt).toISOString().split('T')[0];
                                  const dEx = dailyMap.get(date) || { date, cost: 0, count: 0 };
                                  dEx.cost += parseFloat(String(log.costDeducted || '0'));
                                  dEx.count += 1;
                                  dailyMap.set(date, dEx);
                                }
                                const modelList = Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost);
                                const dailyList = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
                                const colors = ['#667eea', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6'];

                                return (
                                  <>
                                    {/* Summary stats */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                      <div>
                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cost</div>
                                        <div style={{ color: '#667eea', fontSize: '1.25rem', fontWeight: 700 }}>${totalCost.toFixed(4)}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tokens</div>
                                        <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>{formatTokens(totalTokens)}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requests</div>
                                        <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>{totalRequests}</div>
                                      </div>
                                    </div>

                                    {/* Model breakdown */}
                                    {modelList.length > 0 && (
                                      <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>By Model</div>
                                        {(() => {
                                          const maxCost = Math.max(...modelList.map(m => m.cost), 0.001);
                                          return modelList.map((m, i) => (
                                            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                              <div style={{ width: '90px', fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model}</div>
                                              <div style={{ flex: 1, height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${(m.cost / maxCost) * 100}%`, height: '100%', background: colors[i % colors.length], borderRadius: '3px' }} />
                                              </div>
                                              <div style={{ width: '55px', fontSize: '0.68rem', color: colors[i % colors.length], fontWeight: 600, textAlign: 'right' }}>${m.cost.toFixed(4)}</div>
                                              <div style={{ width: '40px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>{m.count}x</div>
                                            </div>
                                          ));
                                        })()}
                                      </div>
                                    )}

                                    {/* Daily trend mini-chart */}
                                    {dailyList.length > 1 && (
                                      <div>
                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Daily Trend</div>
                                        {(() => {
                                          const maxCost = Math.max(...dailyList.map(d => d.cost), 0.001);
                                          const chartH = 60;
                                          const pts = dailyList.map((d, i) => ({
                                            x: (i / Math.max(dailyList.length - 1, 1)) * 100,
                                            y: chartH - 5 - ((d.cost / maxCost) * (chartH - 15)),
                                          }));
                                          const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                          const areaD = `${pathD} L 100 ${chartH - 5} L 0 ${chartH - 5} Z`;
                                          return (
                                            <div>
                                              <svg width="100%" height={chartH} viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none">
                                                <defs>
                                                  <linearGradient id={`devTrend-${device.id.slice(0, 8)}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#667eea" stopOpacity="0.25" />
                                                    <stop offset="100%" stopColor="#667eea" stopOpacity="0" />
                                                  </linearGradient>
                                                </defs>
                                                <path d={areaD} fill={`url(#devTrend-${device.id.slice(0, 8)})`} />
                                                <path d={pathD} fill="none" stroke="#667eea" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                              </svg>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
                                                <span>{dailyList[0].date}</span>
                                                <span>{dailyList[dailyList.length - 1].date}</span>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {/* Recent activity */}
                                    <details style={{ marginTop: '0.75rem' }}>
                                      <summary style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', cursor: 'pointer' }}>Recent requests ({Math.min(deviceLogs.length, 20)} of {deviceLogs.length})</summary>
                                      <div style={{ marginTop: '0.4rem', maxHeight: '12rem', overflowY: 'auto' }}>
                                        {deviceLogs.slice(0, 20).map((log, i) => (
                                          <div key={i} style={{ display: 'flex', gap: '0.5rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.68rem' }}>
                                            <span style={{ color: 'rgba(255,255,255,0.3)', minWidth: '5.5rem' }}>{new Date(log.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            <span style={{ color: 'rgba(255,255,255,0.6)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.model}</span>
                                            <span style={{ color: '#667eea', fontWeight: 600, minWidth: '3.5rem', textAlign: 'right' }}>${parseFloat(String(log.costDeducted || '0')).toFixed(4)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </details>
                                  </>
                                );
                              })()}
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

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <>
            {/* Native Host Logs */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Native Host Logs
                  {nativeLogAutoRefresh && extensionDetected && (
                    <span style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', fontSize: '0.6rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px' }}>
                      Live
                    </span>
                  )}
                </h3>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <button
                    onClick={() => setNativeLogAutoRefresh(!nativeLogAutoRefresh)}
                    style={{
                      background: nativeLogAutoRefresh ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${nativeLogAutoRefresh ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '6px', padding: '0.3rem 0.6rem',
                      color: nativeLogAutoRefresh ? '#22c55e' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', fontSize: '0.7rem', fontWeight: 500,
                    }}
                  >
                    Auto-refresh
                  </button>
                  <button
                    onClick={() => fetchNativeLogs(selectedLogDay ? { date: selectedLogDay } : undefined)}
                    disabled={nativeLogsLoading}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.3rem 0.6rem', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.7rem' }}
                  >
                    {nativeLogsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {!extensionDetected ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>
                  Device offline — logs unavailable
                </div>
              ) : (
                <>
                  {/* Day picker */}
                  {nativeLogDays.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      {nativeLogDays.map(day => (
                        <button
                          key={day}
                          onClick={() => { setSelectedLogDay(day); fetchNativeLogs({ date: day }); }}
                          style={{
                            background: selectedLogDay === day ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${selectedLogDay === day ? 'rgba(102, 126, 234, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                            borderRadius: '6px', padding: '0.25rem 0.5rem',
                            color: selectedLogDay === day ? '#667eea' : 'rgba(255,255,255,0.5)',
                            cursor: 'pointer', fontSize: '0.65rem',
                          }}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Filters row */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                    {/* Category filters */}
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {['agent', 'mcp', 'skill', 'schedule', 'telegram', 'browser', 'system'].map(cat => {
                        const active = nativeLogCategories.size === 0 || nativeLogCategories.has(cat);
                        const catColors: Record<string, string> = { agent: '#667eea', mcp: '#22c55e', skill: '#a855f7', schedule: '#f59e0b', telegram: '#06b6d4', browser: '#ec4899', system: '#6b7280' };
                        return (
                          <button
                            key={cat}
                            onClick={() => setNativeLogCategories(prev => {
                              const next = new Set(prev);
                              if (next.has(cat)) next.delete(cat); else next.add(cat);
                              return next;
                            })}
                            style={{
                              background: active ? `${catColors[cat]}15` : 'transparent',
                              border: `1px solid ${active ? `${catColors[cat]}40` : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: '4px', padding: '0.2rem 0.4rem',
                              color: active ? catColors[cat] : 'rgba(255,255,255,0.3)',
                              cursor: 'pointer', fontSize: '0.6rem',
                            }}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                    {/* Level filters */}
                    <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                      {(['info', 'warn', 'error'] as const).map(lvl => {
                        const active = nativeLogLevels.has(lvl);
                        const lvlColor = lvl === 'error' ? '#ef4444' : lvl === 'warn' ? '#f59e0b' : 'rgba(255,255,255,0.5)';
                        return (
                          <button
                            key={lvl}
                            onClick={() => setNativeLogLevels(prev => {
                              const next = new Set(prev);
                              if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
                              return next;
                            })}
                            style={{
                              background: active ? `${lvlColor}15` : 'transparent',
                              border: `1px solid ${active ? `${lvlColor}40` : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: '4px', padding: '0.2rem 0.4rem',
                              color: active ? lvlColor : 'rgba(255,255,255,0.3)',
                              cursor: 'pointer', fontSize: '0.6rem',
                            }}
                          >
                            {lvl}
                          </button>
                        );
                      })}
                    </div>
                    {/* Search */}
                    <input
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Search logs..."
                      style={{
                        marginLeft: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px', padding: '0.3rem 0.6rem', color: '#fff', fontSize: '0.7rem', outline: 'none', width: '10rem',
                      }}
                    />
                  </div>

                  {/* Stats bar */}
                  {nativeLogs.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>
                      {Object.entries(nativeLogs.reduce((acc, l) => { acc[l.category] = (acc[l.category] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([cat, count]) => (
                        <span key={cat}>{cat}: {count}</span>
                      ))}
                      <span style={{ color: '#ef4444' }}>errors: {nativeLogs.filter(l => l.level === 'error').length}</span>
                    </div>
                  )}

                  {/* Log entries */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem',
                    maxHeight: '24rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: 1.6,
                  }}>
                    {(() => {
                      const filtered = nativeLogs
                        .filter(l => nativeLogLevels.has(l.level))
                        .filter(l => nativeLogCategories.size === 0 || nativeLogCategories.has(l.category))
                        .filter(l => !logSearch || l.message.toLowerCase().includes(logSearch.toLowerCase()));
                      if (filtered.length === 0) {
                        return <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>
                          {nativeLogs.length === 0 ? 'No native host logs available.' : 'No logs match current filters.'}
                        </div>;
                      }
                      return filtered.map((log, i) => {
                        const lvlColor = log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : 'rgba(255,255,255,0.4)';
                        const catColors: Record<string, string> = { agent: '#667eea', mcp: '#22c55e', skill: '#a855f7', schedule: '#f59e0b', telegram: '#06b6d4', browser: '#ec4899', system: '#6b7280' };
                        return (
                          <div key={`${log.ts}-${i}`} style={{ display: 'flex', gap: '0.4rem', padding: '0.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'flex-start' }}>
                            <span style={{ color: 'rgba(255,255,255,0.2)', minWidth: '5.5rem', flexShrink: 0 }}>
                              {new Date(log.ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{String(log.ts % 1000).padStart(3, '0')}
                            </span>
                            <span style={{ color: lvlColor, minWidth: '0.5rem', flexShrink: 0 }}>
                              {log.level === 'error' ? '!' : log.level === 'warn' ? '*' : ' '}
                            </span>
                            <span style={{ color: catColors[log.category] || '#6b7280', minWidth: '4.5rem', flexShrink: 0, fontSize: '0.6rem', paddingTop: '0.1rem' }}>
                              {log.category}
                            </span>
                            <span style={{ color: log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fde68a' : 'rgba(255,255,255,0.75)', wordBreak: 'break-all', flex: 1 }}>
                              {log.message}
                              {log.data != null && (
                                <details style={{ display: 'inline' }}>
                                  <summary style={{ color: 'rgba(255,255,255,0.25)', cursor: 'pointer', display: 'inline', marginLeft: '0.35rem' }}>[data]</summary>
                                  <pre style={{ color: 'rgba(255,255,255,0.3)', margin: '0.2rem 0 0', fontSize: '0.6rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(log.data, null, 2)}</pre>
                                </details>
                              )}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* Bridge Logs */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                  Bridge Messages
                </h3>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {(['all', 'bridge', 'native'] as const).map(f => (
                    <button key={f} onClick={() => setLogFilter(f)} style={{
                      background: logFilter === f ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: logFilter === f ? '1px solid rgba(102, 126, 234, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '6px', padding: '0.25rem 0.5rem', color: logFilter === f ? '#667eea' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.65rem',
                    }}>
                      {f === 'all' ? 'All' : f === 'bridge' ? 'Extension' : 'Commands'}
                    </button>
                  ))}
                  <button onClick={() => setLogs([])} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', padding: '0.25rem 0.5rem', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem' }}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem', maxHeight: '12rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.68rem', lineHeight: 1.6 }}>
                {logs.filter(l => logFilter === 'all' || l.source === logFilter).length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1rem 0' }}>
                    No bridge messages yet.
                  </div>
                ) : (
                  logs.filter(l => logFilter === 'all' || l.source === logFilter).map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.4rem', padding: '0.1rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ color: 'rgba(255,255,255,0.2)', minWidth: '5rem', flexShrink: 0 }}>
                        {new Date(log.ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span style={{ color: log.direction === 'out' ? 'rgba(251, 191, 36, 0.7)' : 'rgba(255,255,255,0.5)', minWidth: '1rem', flexShrink: 0 }}>
                        {log.direction === 'out' ? '→' : '←'}
                      </span>
                      <span style={{ color: log.source === 'bridge' ? '#22c55e' : '#667eea', minWidth: '2.5rem', flexShrink: 0 }}>
                        {log.source === 'bridge' ? 'EXT' : 'CMD'}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all' }}>
                        {log.message}
                        {log.data != null && <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '0.3rem' }}>{JSON.stringify(log.data)}</span>}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
              {logs.length > 0 && (
                <div style={{ marginTop: '0.35rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}>
                  {logs.length} entries | Bridge: {logs.filter(l => l.source === 'bridge').length} | Commands: {logs.filter(l => l.source === 'native').length}
                </div>
              )}
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

              {showDownloads && (
                <div style={{ marginBottom: '1.25rem', background: 'rgba(102, 126, 234, 0.08)', border: '1px solid rgba(102, 126, 234, 0.2)', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ color: '#667eea', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                    Desktop App (macOS)
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <a
                      href="https://s07musqc7iej8klq.public.blob.vercel-storage.com/HoriaAssistant-0.1.1-arm64.dmg"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '8px',
                        padding: '0.6rem 1.2rem',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Download for Apple Silicon
                    </a>
                    <a
                      href="https://s07musqc7iej8klq.public.blob.vercel-storage.com/HoriaAssistant-0.1.1-x64.dmg"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: 'rgba(102, 126, 234, 0.15)',
                        border: '1px solid rgba(102, 126, 234, 0.3)',
                        borderRadius: '8px',
                        padding: '0.6rem 1.2rem',
                        color: '#667eea',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Download for Intel
                    </a>
                  </div>
                </div>
              )}

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

        {activeTab === 'packages' && (
          <PackagesTab extensionBridge={extensionBridge} extensionDetected={extensionDetected} />
        )}

        {activeTab === 'budget' && (
          <>
            {budgetLoading && !budgetData ? (
              <div style={cardStyle}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>Loading budget data...</p>
              </div>
            ) : !budgetData ? (
              <div style={cardStyle}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>No budget data available.</p>
              </div>
            ) : (
              <>
                {/* Balance Overview */}
                <div style={cardStyle}>
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1.25rem' }}>Balance Overview</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '1.25rem' }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Remaining Balance</div>
                      <div style={{ color: '#22c55e', fontSize: '2rem', fontWeight: 700 }}>${budgetData.remainingBalance.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Deposited</div>
                      <div style={{ color: '#3b82f6', fontSize: '2rem', fontWeight: 700 }}>${budgetData.totalDeposited.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Spent</div>
                      <div style={{ color: '#a855f7', fontSize: '2rem', fontWeight: 700 }}>${budgetData.totalSpent.toFixed(4)}</div>
                    </div>
                  </div>
                  {budgetData.totalDeposited > 0 && (
                    <div style={{ marginTop: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.35rem' }}>
                        <span>Budget Used</span>
                        <span>{((budgetData.totalSpent / budgetData.totalDeposited) * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min((budgetData.totalSpent / budgetData.totalDeposited) * 100, 100)}%`, background: 'linear-gradient(90deg, #667eea, #a855f7)', borderRadius: '4px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Add tokens:</span>
                    {[5, 10, 25, 50].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setBuyAmount(amt)}
                        style={{
                          background: buyAmount === amt ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${buyAmount === amt ? 'rgba(102, 126, 234, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: '6px',
                          padding: '0.4rem 0.75rem',
                          color: buyAmount === amt ? '#667eea' : 'rgba(255,255,255,0.7)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ${amt}
                      </button>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>$</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={buyAmount}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 1 && v <= 500) setBuyAmount(v);
                        }}
                        style={{
                          width: '4rem',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '6px',
                          padding: '0.4rem 0.5rem',
                          color: '#fff',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          textAlign: 'center',
                        }}
                      />
                    </div>
                    <button
                      disabled={buyLoading}
                      onClick={async () => {
                        setBuyLoading(true);
                        try {
                          const res = await fetch('/api/billing/checkout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amount: buyAmount }),
                          });
                          const data = await res.json();
                          if (data.url) window.location.href = data.url;
                        } catch (e) {
                          console.error('Checkout error:', e);
                        } finally {
                          setBuyLoading(false);
                        }
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #667eea, #a855f7)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.5rem 1.25rem',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: buyLoading ? 'wait' : 'pointer',
                        opacity: buyLoading ? 0.6 : 1,
                      }}
                    >
                      {buyLoading ? 'Redirecting...' : `Buy $${buyAmount} tokens`}
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>You pay ${(buyAmount * 1.1).toFixed(2)} (includes 10% processing fee)</span>
                  </div>
                </div>

                {/* Filters */}
                <div style={{ ...cardStyle, padding: '1rem 1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Month</label>
                      <select
                        value={budgetMonth}
                        onChange={e => setBudgetMonth(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.8rem' }}
                      >
                        <option value="all">All Time</option>
                        {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Device</label>
                      <select
                        value={budgetDevice}
                        onChange={e => setBudgetDevice(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.8rem' }}
                      >
                        <option value="all">All Devices</option>
                        {budgetData.deviceSummaries.map(d => <option key={d.apiKeyId || d.deviceName} value={d.apiKeyId}>{d.deviceName}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Model</label>
                      <select
                        value={budgetModel}
                        onChange={e => setBudgetModel(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.8rem' }}
                      >
                        <option value="all">All Models</option>
                        {budgetData.modelSummaries.map(m => <option key={m.model} value={m.model}>{m.model}</option>)}
                      </select>
                    </div>
                    {(budgetMonth !== 'all' || budgetDevice !== 'all' || budgetModel !== 'all') && (
                      <button
                        onClick={() => { setBudgetMonth('all'); setBudgetDevice('all'); setBudgetModel('all'); }}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.4rem 0.75rem', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Spending Trend */}
                {filteredDailySpending.length > 1 && (
                  <div style={cardStyle}>
                    <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>Spending Trend</h3>
                    <div style={{ position: 'relative' }}>
                      {(() => {
                        const data = filteredDailySpending;
                        const maxCost = Math.max(...data.map(d => d.cost), 0.001);
                        const chartHeight = 120;
                        const points = data.map((d, i) => ({
                          x: (i / Math.max(data.length - 1, 1)) * 100,
                          y: chartHeight - 10 - ((d.cost / maxCost) * (chartHeight - 30)),
                        }));
                        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                        const areaD = `${pathD} L 100 ${chartHeight - 10} L 0 ${chartHeight - 10} Z`;
                        return (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', width: '50px', textAlign: 'right', paddingRight: '4px' }}>
                              <span>${maxCost.toFixed(4)}</span>
                              <span>${(maxCost / 2).toFixed(4)}</span>
                              <span>$0</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <svg width="100%" height={chartHeight} viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none">
                                <line x1="0" y1={chartHeight - 10} x2="100" y2={chartHeight - 10} stroke="rgba(255,255,255,0.1)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                <line x1="0" y1={(chartHeight - 10) / 2} x2="100" y2={(chartHeight - 10) / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
                                <defs>
                                  <linearGradient id="budgetTrendGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#667eea" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#667eea" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path d={areaD} fill="url(#budgetTrendGrad)" />
                                <path d={pathD} fill="none" stroke="#667eea" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                {points.map((p, i) => (
                                  <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#667eea" vectorEffect="non-scaling-stroke" />
                                ))}
                              </svg>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.25rem' }}>
                                <span>{data[0]?.date}</span>
                                <span>{data[data.length - 1]?.date}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Model Breakdown */}
                {filteredModelSummaries.length > 0 && (
                  <div style={cardStyle}>
                    <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>Model Breakdown</h3>
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                      {/* Donut Chart */}
                      {(() => {
                        const colors = ['#667eea', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#06b6d4'];
                        const total = filteredModelSummaries.reduce((s, m) => s + m.totalCost, 0);
                        if (total === 0) return null;
                        const size = 120;
                        const radius = size / 2;
                        const innerRadius = radius * 0.6;
                        let currentAngle = 0;
                        const segments = filteredModelSummaries.map((m, i) => {
                          const angle = (m.totalCost / total) * 360;
                          const seg = { ...m, startAngle: currentAngle, endAngle: currentAngle + angle, color: colors[i % colors.length] };
                          currentAngle += angle;
                          return seg;
                        });
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                              {segments.map((seg, i) => {
                                const startRad = (seg.startAngle - 90) * (Math.PI / 180);
                                const endRad = (seg.endAngle - 90) * (Math.PI / 180);
                                const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;
                                const x1 = radius + radius * Math.cos(startRad);
                                const y1 = radius + radius * Math.sin(startRad);
                                const x2 = radius + radius * Math.cos(endRad);
                                const y2 = radius + radius * Math.sin(endRad);
                                const x3 = radius + innerRadius * Math.cos(endRad);
                                const y3 = radius + innerRadius * Math.sin(endRad);
                                const x4 = radius + innerRadius * Math.cos(startRad);
                                const y4 = radius + innerRadius * Math.sin(startRad);
                                return (
                                  <path key={i} d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`} fill={seg.color} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
                                );
                              })}
                            </svg>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Total: ${total.toFixed(4)}</div>
                          </div>
                        );
                      })()}
                      {/* Bar list */}
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        {(() => {
                          const colors = ['#667eea', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#06b6d4'];
                          const maxCost = Math.max(...filteredModelSummaries.map(m => m.totalCost), 0.001);
                          return filteredModelSummaries.map((m, i) => (
                            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                              <div style={{ width: '110px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model}</div>
                              <div style={{ flex: 1, height: '18px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${(m.totalCost / maxCost) * 100}%`, height: '100%', background: colors[i % colors.length], borderRadius: '4px', transition: 'width 0.3s' }} />
                              </div>
                              <div style={{ width: '65px', fontSize: '0.72rem', color: colors[i % colors.length], fontWeight: 600, textAlign: 'right' }}>${m.totalCost.toFixed(4)}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Device Breakdown */}
                {filteredDeviceSummaries.length > 0 && (
                  <div style={cardStyle}>
                    <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>Per-Device Breakdown</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Device</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Requests</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Tokens</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeviceSummaries.map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.6rem 0', color: '#fff', fontSize: '0.85rem' }}>{d.deviceName}</td>
                            <td style={{ padding: '0.6rem 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', textAlign: 'right' }}>{d.count.toLocaleString()}</td>
                            <td style={{ padding: '0.6rem 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', textAlign: 'right' }}>{formatTokens(d.totalTokens)}</td>
                            <td style={{ padding: '0.6rem 0', color: '#667eea', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>${d.totalCost.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Purchase History */}
                <div style={cardStyle}>
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>Purchase History</h3>
                  {budgetData.purchaseHistory.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>No purchases recorded yet. Future deposits will appear here.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetData.purchaseHistory.map(tx => (
                          <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.6rem 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>{new Date(tx.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: '0.6rem 0', color: '#fff', fontSize: '0.85rem' }}>{tx.description || tx.type}</td>
                            <td style={{ padding: '0.6rem 0', color: tx.type === 'deposit' ? '#22c55e' : '#ef4444', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>
                              {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};
