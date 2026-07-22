'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RemoteChat } from './remote-chat/RemoteChat';
import type { RelaySession } from './remote-chat/frames';
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

  // A device id passed via ?device= auto-opens that device's chat on load.
  const autoOpenedRef = useRef(false);

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

      setActive({
        sessionId: session.id,
        deviceId: device.id,
        deviceName: device.device_name,
        deviceOnline: device.status === 'online',
        deviceModel: device.model,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open chat');
    } finally {
      setBusy(null);
    }
  }, []);

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
        const online = d.status === 'online';
        setActive((prev) =>
          prev && prev.deviceId === active.deviceId && (prev.deviceOnline !== online || prev.deviceModel !== d.model)
            ? { ...prev, deviceOnline: online, deviceModel: d.model }
            : prev
        );
      } catch {
        /* best-effort presence refresh */
      }
    };
    const interval = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);

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

  // Online devices first, then by most-recently-seen.
  const sortedDevices = [...devices].sort((a, b) => {
    const onlineDelta = Number(b.status === 'online') - Number(a.status === 'online');
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
            const online = d.status === 'online';
            const meta = busy === d.id
              ? 'opening…'
              : online
                ? (d.model || d.platform || 'ready')
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
