'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { extensionBridge } from '@/src/lib/extension-bridge';
import { request, type BridgeRequest } from '@/src/lib/bridge-commands';
import { summarizeDeviceInfo, type DeviceSummary } from '@/src/lib/ai-device-data';

/**
 * Shared state of the ai. control panel, mounted once in the (ai) layout so it survives moving between
 * sections: the user's devices and Tulzo usage (server), and the extension bridge (connection, a typed
 * `send`, the message log and the connected device's snapshot).
 */

export interface DeviceItem {
  id: string;
  device_name: string;
  api_key_suffix: string;
  plan: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  status: 'online' | 'offline' | 'never_connected';
  last_seen_at: string | null;
  platform: string | null;
  arch: string | null;
  model: string | null;
}

export interface UsageStats {
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  lastRequestAt: string | null;
}

export interface Activity {
  timeline: Array<{ event_type: string; created_at: string }>;
  event_counts: Record<string, number>;
}

export interface BridgeLogEntry {
  ts: number;
  direction: 'in' | 'out';
  message: string;
}

export interface ControlPanelData {
  /** Link base inside the surface: '/ai' in path-prefix mode, '' on the ai. host. */
  base: string;
  showDownloads: boolean;
  devices: DeviceItem[];
  deviceLimit: number;
  plan: string;
  devicesLoaded: boolean;
  refreshDevices: () => Promise<void>;
  usageStats: UsageStats | null;
  activity: Activity | null;
  latestVersion: string | null;
  connected: boolean;
  deviceName: string | null;
  send: <T = unknown>(req: BridgeRequest) => Promise<T>;
  bridgeLog: BridgeLogEntry[];
  clearBridgeLog: () => void;
  deviceSummary: DeviceSummary | null;
  refreshDeviceSummary: () => Promise<void>;
  /** Posts the key to the extension so it pairs with this account. */
  activateDevice: (apiKey: string, deviceName: string) => void;
}

const Ctx = createContext<ControlPanelData | null>(null);

export function useControlPanelData(): ControlPanelData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useControlPanelData outside ControlPanelDataProvider');
  return v;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = ua.includes('Edg') ? 'Edge' : ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Browser';
  const os = /Mac OS X|Macintosh/.test(ua) ? 'macOS' : ua.includes('Windows') ? 'Windows' : ua.includes('Linux') ? 'Linux' : 'Unknown';
  return `${browser} on ${os}`;
}

export function ControlPanelDataProvider({ base, showDownloads, children }: { base: string; showDownloads: boolean; children: React.ReactNode }) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [plan, setPlan] = useState('free');
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [bridgeLog, setBridgeLog] = useState<BridgeLogEntry[]>([]);
  const [deviceSummary, setDeviceSummary] = useState<DeviceSummary | null>(null);
  const autoActivated = useRef(false);

  const refreshDevices = useCallback(async () => {
    const d = await getJson<{ devices?: DeviceItem[]; limit?: number; plan?: string }>('/api/keys/list');
    if (d) {
      setDevices(d.devices ?? []);
      setDeviceLimit(d.limit ?? 1);
      if (d.plan) setPlan(d.plan);
    }
    setDevicesLoaded(true);
  }, []);

  useEffect(() => {
    refreshDevices();
    getJson<UsageStats>('/api/usage/stats').then((d) => d && setUsageStats(d));
    getJson<Activity>('/api/dashboard/activity').then((d) => d && setActivity({ timeline: d.timeline ?? [], event_counts: d.event_counts ?? {} }));
    getJson<{ latest?: string }>('/api/plugin/version').then((d) => d?.latest && setLatestVersion(d.latest));
  }, [refreshDevices]);

  const log = useCallback((direction: 'in' | 'out', message: string) => {
    setBridgeLog((prev) => {
      const next = [...prev, { ts: Date.now(), direction, message }];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  // Bridge connection and the message log.
  useEffect(() => {
    extensionBridge.start();
    const sync = () => {
      setConnected(extensionBridge.state === 'connected');
      setDeviceName(extensionBridge.deviceName);
    };
    sync();
    const unsub = extensionBridge.onStateChange(sync);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data as { source?: string; action?: string; command?: string; ok?: boolean; error?: string } | null;
      if (!d || typeof d !== 'object' || d.action === 'heartbeat' || d.action === 'heartbeat_ack' || d.action === 'discover') return;
      if (d.source === 'tulzo') log('out', d.action === 'command' ? `${d.command}` : String(d.action));
      else if (d.source === 'tex-extension') {
        if (d.action === 'discover_ack') sync();
        log('in', d.action === 'command_response' ? `${d.ok ? 'ok' : `error: ${d.error ?? 'failed'}`}` : String(d.action));
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      unsub();
      window.removeEventListener('message', onMessage);
    };
  }, [log]);

  const send = useCallback(<T,>(req: BridgeRequest) => extensionBridge.send<T>(req.command, req.params), []);

  const refreshDeviceSummary = useCallback(async () => {
    try {
      setDeviceSummary(summarizeDeviceInfo(await send(request('GET_DEVICE_INFO'))));
    } catch {
      setDeviceSummary(null);
    }
  }, [send]);

  useEffect(() => {
    if (connected) refreshDeviceSummary();
    else setDeviceSummary(null);
  }, [connected, refreshDeviceSummary]);

  const activateDevice = useCallback((apiKey: string, name: string) => {
    window.postMessage({ source: 'tulzo', action: 'activate_device', apiKey, deviceName: name }, '*');
  }, []);

  // A paid user whose extension is here but unpaired, with no devices yet, is paired automatically.
  useEffect(() => {
    if (autoActivated.current || !connected || extensionBridge.activated || !devicesLoaded || devices.length > 0 || plan === 'free') return;
    autoActivated.current = true;
    const name = defaultDeviceName();
    (async () => {
      try {
        const res = await fetch('/api/keys/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_name: name }),
        });
        const data = (await res.json()) as { apiKey?: string };
        if (res.ok && data.apiKey) {
          activateDevice(data.apiKey, name);
          setTimeout(() => refreshDevices(), 1000);
        }
      } catch {
        /* the user can still add a device by hand */
      }
    })();
  }, [connected, devicesLoaded, devices.length, plan, activateDevice, refreshDevices]);

  // Presence beacon: this tab sees the device live; tell the server so other devices (a phone) do too.
  useEffect(() => {
    if (!connected) return;
    const match = devices.find((d) => d.device_name === deviceName) ?? (devices.length === 1 ? devices[0] : undefined);
    if (!match) return;
    const beacon = () => {
      fetch('/api/plugin/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key_id: match.id,
          ...(deviceSummary?.activeModel ? { model: deviceSummary.activeModel } : {}),
          stats: deviceSummary
            ? { skills_loaded: deviceSummary.skills, schedules_count: deviceSummary.activeSchedules, mcp_servers_connected: deviceSummary.mcpConnected }
            : {},
        }),
      }).catch(() => {});
    };
    beacon();
    const t = setInterval(beacon, 30000);
    return () => clearInterval(t);
  }, [connected, devices, deviceName, deviceSummary]);

  const value = useMemo<ControlPanelData>(
    () => ({
      base,
      showDownloads,
      devices,
      deviceLimit,
      plan,
      devicesLoaded,
      refreshDevices,
      usageStats,
      activity,
      latestVersion,
      connected,
      deviceName,
      send,
      bridgeLog,
      clearBridgeLog: () => setBridgeLog([]),
      deviceSummary,
      refreshDeviceSummary,
      activateDevice,
    }),
    [base, showDownloads, devices, deviceLimit, plan, devicesLoaded, refreshDevices, usageStats, activity, latestVersion, connected, deviceName, send, bridgeLog, deviceSummary, refreshDeviceSummary, activateDevice],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
