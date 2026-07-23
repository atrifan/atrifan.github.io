'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RemoteChat } from './remote-chat/RemoteChat';
import type { RelaySession } from './remote-chat/frames';
import { extensionBridge } from '../lib/extension-bridge';
import './remote-chat/RemoteChat.css';

interface Device {
  id: string; // api_key_id
  device_name: string;
  status: 'online' | 'offline' | 'never_connected';
  platform: string | null;
  last_seen_at: string | null;
  model: string | null;
}

interface ActiveChat {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  deviceOnline: boolean;
  deviceModel: string | null;
}

// Short, human-friendly "last seen" for the picker meta.
function relativeSeen(iso: string | null): string {
  if (!iso) return 'never connected';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function RemoteChatPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveChat | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live in-browser bridge to the Horia assistant, when this page is open in the
  // SAME browser the assistant runs in (e.g. the control-panel machine). It's the
  // source of truth for "is it connected right now" — far fresher than the server
  // heartbeat's 10-min window — and carries the live active model. Mirrors the
  // control panel's `isLiveDevice` detection so a locally-connected device shows
  // online immediately instead of waiting on (or missing) a server heartbeat.
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeDeviceName, setBridgeDeviceName] = useState<string | null>(null);
  const [bridgeModel, setBridgeModel] = useState<string | null>(null);

  // A device id passed via ?device= auto-opens that device's chat on load.
  const autoOpenedRef = useRef(false);

  // Start the extension bridge and track its connection + live model. When it
  // connects we ask the assistant for its active model via GET_PROVIDERS so the
  // composer seeds the real model rather than the default.
  useEffect(() => {
    extensionBridge.start();
    const sync = () => {
      const connected = extensionBridge.state === 'connected';
      setBridgeConnected(connected);
      setBridgeDeviceName(extensionBridge.deviceName);
      if (!connected) {
        setBridgeModel(null);
        return;
      }
      extensionBridge
        .send<{ activeProvider?: string; providers?: Record<string, { models?: { orchestrator?: string } }> }>('GET_PROVIDERS')
        .then((res) => {
          const active = res?.activeProvider || '';
          const model = res?.providers?.[active]?.models?.orchestrator || null;
          setBridgeModel(model);
        })
        .catch(() => setBridgeModel(null));
    };
    sync();
    const unsub = extensionBridge.onStateChange(sync);
    return unsub;
  }, []);

  // True when the live bridge is connected to THIS device — deviceName match, or
  // the sole connected device (same heuristic the control panel uses).
  const bridgeMatches = useCallback(
    (device: Device): boolean =>
      bridgeConnected && (bridgeDeviceName === device.device_name || devices.length === 1),
    [bridgeConnected, bridgeDeviceName, devices.length]
  );

  // `silent` skips the loading state so the background presence poll doesn't
  // flash the picker between refreshes.
  const loadDevices = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/plugin/devices');
      const body = res.ok ? await res.json() : { devices: [] };
      setDevices((body.devices as Device[]) ?? []);
    } catch {
      if (!silent) setDevices([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // While the picker is showing (no active chat), refresh presence every 15s so a
  // device coming online (its ~60s heartbeat) flips to "online" without a reload.
  useEffect(() => {
    if (active) return;
    const interval = setInterval(() => loadDevices(true), 15000);
    return () => clearInterval(interval);
  }, [active, loadDevices]);

  const openChat = useCallback(async (device: Device) => {
    setBusy(device.id);
    setError(null);
    try {
      // Reuse the newest existing session for this device, else create one.
      const listRes = await fetch('/api/plugin/chat/sessions');
      const listBody = listRes.ok ? await listRes.json() : { sessions: [] };
      const existing = ((listBody.sessions as RelaySession[]) ?? []).find(
        (s) => s.api_key_id === device.id
      );

      let session = existing;
      if (!session) {
        const createRes = await fetch('/api/plugin/chat/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key_id: device.id }),
        });
        if (!createRes.ok) {
          const b = await createRes.json().catch(() => ({}));
          throw new Error(b.error || 'Failed to open chat');
        }
        session = (await createRes.json()).session as RelaySession;
      }

      const live = bridgeMatches(device);
      setActive({
        sessionId: session.id,
        deviceId: device.id,
        deviceName: device.device_name,
        deviceOnline: live || device.status === 'online',
        deviceModel: (live ? bridgeModel : null) || device.model,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open chat');
    } finally {
      setBusy(null);
    }
  }, [bridgeMatches, bridgeModel]);

  // Auto-open the device named in ?device= (e.g. the control panel "Chat" button).
  useEffect(() => {
    if (autoOpenedRef.current || loading || active) return;
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get('device');
    if (!deviceId) return;
    const target = devices.find((d) => d.id === deviceId);
    if (target) {
      autoOpenedRef.current = true;
      openChat(target);
    }
  }, [loading, active, devices, openChat]);

  // While a chat is open, keep the device's online status + active model fresh.
  // deviceOnline/deviceModel captured at open time is a snapshot; the device can
  // come online or switch models mid-session, so re-read /api/plugin/devices.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/plugin/devices');
        if (!res.ok) return;
        const body = await res.json();
        const d = ((body.devices as Device[]) ?? []).find((x) => x.id === active.deviceId);
        if (!d || cancelled) return;
        // Live bridge wins over the server heartbeat: a same-browser device is
        // online now regardless of when its last heartbeat landed, and its live
        // model is more current than the persisted one.
        const live = bridgeMatches(d);
        const online = live || d.status === 'online';
        const model = (live ? bridgeModel : null) || d.model;
        setActive((prev) =>
          prev && prev.deviceId === active.deviceId && (prev.deviceOnline !== online || prev.deviceModel !== model)
            ? { ...prev, deviceOnline: online, deviceModel: model }
            : prev
        );
      } catch {
        /* best-effort presence refresh */
      }
    };
    tick();
    const interval = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, bridgeMatches, bridgeModel]);

  if (active) {
    return (
      <RemoteChat
        sessionId={active.sessionId}
        deviceName={active.deviceName}
        deviceOnline={active.deviceOnline}
        deviceModel={active.deviceModel}
        onBack={() => {
          setActive(null);
          loadDevices();
        }}
      />
    );
  }

  // Effective online status: server heartbeat OR the live in-browser bridge.
  const isOnline = (d: Device) => d.status === 'online' || bridgeMatches(d);

  // Online devices first, then by most-recently-seen.
  const sortedDevices = [...devices].sort((a, b) => {
    const onlineDelta = Number(isOnline(b)) - Number(isOnline(a));
    if (onlineDelta !== 0) return onlineDelta;
    return new Date(b.last_seen_at ?? 0).getTime() - new Date(a.last_seen_at ?? 0).getTime();
  });

  return (
    <div className="rc-root">
      <div className="rc-header">
        <span className="rc-logo">◆</span>
        <span className="rc-title">Chat with a device</span>
        <button
          className="rc-refresh"
          onClick={() => loadDevices()}
          disabled={loading}
          aria-label="Refresh devices"
          title="Refresh devices"
          type="button"
        >
          ↻
        </button>
      </div>
      <div className="rc-picker">
        <h2>Your connected devices</h2>
        {error && <div className="rc-banner">{error}</div>}
        {loading ? (
          <div className="rc-empty">Loading devices…</div>
        ) : devices.length === 0 ? (
          <div className="rc-empty">No devices yet. Connect the Horia assistant to get started.</div>
        ) : (
          sortedDevices.map((d) => {
            const online = isOnline(d);
            const liveModel = bridgeMatches(d) ? bridgeModel : null;
            const meta = busy === d.id
              ? 'opening…'
              : online
                ? (liveModel || d.model || d.platform || 'ready')
                : `offline · ${relativeSeen(d.last_seen_at)}`;
            return (
              <button
                key={d.id}
                className={`rc-device ${online ? 'online' : ''}`}
                onClick={() => openChat(d)}
                disabled={busy === d.id}
              >
                <span className="rc-dot" />
                <span className="rc-dname">{d.device_name}</span>
                <span className="rc-dmeta">{meta}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
