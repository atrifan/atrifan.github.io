'use client';

// The chat surface: one device's chats in a drawer (a sidebar from 960px), a header
// with the open chat's title and the assistant's presence, and the conversation.
// `?device=<api_key_id>` picks the device and `?session=<id>` the chat; both are
// kept in the URL so a reload or a shared link reopens the same chat.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJsonRetrying } from './get-json-retrying';
import { RemoteChat } from './RemoteChat';
import { SessionsDrawer } from './SessionsDrawer';
import type { RelaySession } from './frames';
import { pickDevice, presenceOf, type DeviceLike } from './model/presence';
import { preserveNativeOrigin, sortActivity } from './model/session-list';
import { parseCatalog, parseSession, record, type Catalog } from './session-contract';
import { supportsWatch } from './model/session-attachment';
import { NativeSessionChat } from './NativeSessionChat';
import { useKeyboardInset } from './useKeyboardInset';
import { extensionBridge } from '../../lib/extension-bridge';
import { surfaceUrl } from '../../lib/surface-url';
import './RemoteChat.css';
import './ChatApp.css';
import './SessionDiscovery.css';

export interface ChatDevice extends DeviceLike {
  platform: string | null;
  model: string | null;
}

const MOBILE_QUERY = '(max-width: 959px)';

function isChatDevice(value: unknown): value is ChatDevice {
  return record(value) && typeof value.id === 'string' && value.id.length > 0 && typeof value.device_name === 'string'
    && ['online', 'offline', 'never_connected'].includes(String(value.status))
    && (value.last_seen_at === null || typeof value.last_seen_at === 'string')
    && (value.platform === null || typeof value.platform === 'string') && (value.model === null || typeof value.model === 'string');
}

function readParams(): { device: string | null; session: string | null } {
  const p = new URLSearchParams(window.location.search);
  return { device: p.get('device'), session: p.get('session') };
}

function writeParams(device: string | null, session: string | null) {
  const url = new URL(window.location.href);
  if (device) url.searchParams.set('device', device);
  else url.searchParams.delete('device');
  if (session) url.searchParams.set('session', session);
  else url.searchParams.delete('session');
  window.history.replaceState(window.history.state, '', url);
}

function ChatsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h10M4 18h16" />
    </svg>
  );
}

export function ChatApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  useKeyboardInset(rootRef);

  const [devices, setDevices] = useState<ChatDevice[] | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RelaySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unavailableRequest, setUnavailableRequest] = useState(false);
  // Bumped when the user opens another chat or starts a new one: remounts the
  // conversation. Not bumped when a new chat gets its id on the first send.
  const [chatKey, setChatKey] = useState(0);
  const [freshSession, setFreshSession] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<{ device: string | null; session: string | null } | null>(null);
  const chatsButtonRef = useRef<HTMLButtonElement>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('history');
  const [visible, setVisible] = useState(true);
  const selectionGeneration = useRef(0);
  const currentDevice = useRef(deviceId);
  currentDevice.current = deviceId;
  const listRequest = useRef<AbortController | null>(null);
  const listGeneration = useRef(0);
  const createRequest = useRef<AbortController | null>(null);
  const devicesRequest = useRef<AbortController | null>(null);
  const laterPageIds = useRef(new Set<string>());

  // Live in-browser bridge: when the assistant runs in THIS browser it is online now,
  // whatever the server heartbeat says, and it knows its live model.
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeDeviceName, setBridgeDeviceName] = useState<string | null>(null);
  const [bridgeModel, setBridgeModel] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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
        .then((res) => setBridgeModel(res?.providers?.[res?.activeProvider || '']?.models?.orchestrator || null))
        .catch(() => setBridgeModel(null));
    };
    sync();
    return extensionBridge.onStateChange(sync);
  }, []);

  const isLive = useCallback(
    (d: ChatDevice) => bridgeConnected && (bridgeDeviceName === d.device_name || (devices?.length ?? 0) === 1),
    [bridgeConnected, bridgeDeviceName, devices],
  );

  const loadDevices = useCallback(async () => {
    if (devicesRequest.current) return;
    const controller = new AbortController();
    devicesRequest.current = controller;
    // A failed load (e.g. a 401 while the session token refreshes) is retried; only a real answer
    // can say the user has no devices.
    const body = await getJsonRetrying<unknown>('/api/plugin/devices', { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (record(body) && Array.isArray(body.devices) && body.devices.every(isChatDevice)) {
      setDevices(body.devices);
      setDeviceError(null);
    } else setDeviceError('Could not load your assistant.');
    if (devicesRequest.current === controller) devicesRequest.current = null;
  }, []);

  useEffect(() => {
    requested.current = readParams();
    void loadDevices();
    // Presence can change while the page is open (the device's heartbeat is ~60s).
    const t = setInterval(() => void loadDevices(), 15_000);
    return () => { clearInterval(t); devicesRequest.current?.abort(); devicesRequest.current = null; };
  }, [loadDevices]);

  // Choose the device once the list arrives: the requested one, else the best one.
  useEffect(() => {
    if (!devices || deviceId) return;
    const picked = pickDevice(devices, requested.current?.device ?? null, isLive);
    if (!picked) return;
    setDeviceId(picked.id);
    const wanted = requested.current?.session ?? null;
    setUnavailableRequest(!!wanted && !!requested.current?.device && picked.id !== requested.current.device);
    setSessionId(wanted);
    writeParams(picked.id, wanted);
  }, [devices, deviceId, isLive]);

  const device = devices?.find((d) => d.id === deviceId) ?? null;

  const loadSessions = useCallback(async (id: string, cursor?: string) => {
    if (listRequest.current || currentDevice.current !== id) return;
    const request = new AbortController();
    listRequest.current = request;
    const generation = listGeneration.current;
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(), 15_000);
    setSessionsLoading(true);
    try {
      const response = await fetch(`/api/plugin/chat/sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: AbortSignal.any([request.signal, deadline.signal]), cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load chats.');
      const body: unknown = await response.json();
      if (request.signal.aborted || generation !== listGeneration.current || currentDevice.current !== id) return;
      if (!record(body) || !Array.isArray(body.sessions)) throw new Error('Could not load chats.');
      const rows = body.sessions.map(parseSession).filter((row): row is RelaySession => !!row && row.api_key_id === id);
      if (cursor) for (const row of rows) laterPageIds.current.add(row.id);
      setSessions((previous) => {
        // Refresh the advertised first page without discarding already loaded later pages.
        const prior = new Map(previous.map((row) => [row.id, row]));
        const returnedIds = new Set(rows.map((row) => row.id));
        const refreshed = rows.map((row) => preserveNativeOrigin(row, prior.get(row.id)));
        const merged = cursor ? [...previous, ...refreshed] : [...refreshed, ...previous.filter((row) => laterPageIds.current.has(row.id) && !returnedIds.has(row.id))];
        return Array.from(new Map(merged.map((row) => [row.id, row])).values());
      });
      setCatalog(parseCatalog(body.catalog));
      setListError(null);
    } catch {
      if (!request.signal.aborted && generation === listGeneration.current && currentDevice.current === id) setListError('Could not load chats.');
    } finally {
      clearTimeout(timeout);
      if (listRequest.current === request) { listRequest.current = null; setSessionsLoading(false); }
    }
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    void loadSessions(deviceId);
    return () => { listGeneration.current += 1; listRequest.current?.abort(); listRequest.current = null; };
  }, [deviceId, loadSessions]);

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  const hasCatalog = catalog?.version === 1;
  useEffect(() => {
    if (!deviceId || tab !== 'active' || !visible || !hasCatalog) return;
    const timer = setInterval(() => void loadSessions(deviceId), 3000);
    return () => {
      clearInterval(timer);
      listGeneration.current += 1;
      listRequest.current?.abort();
      listRequest.current = null;
      setSessionsLoading(false);
    };
  }, [deviceId, tab, visible, hasCatalog, loadSessions]);
  useEffect(() => () => { selectionGeneration.current += 1; createRequest.current?.abort(); }, []);

  // Presence beacon: a tab with the live bridge freshens the device's server heartbeat
  // so the phone (which only sees the server) shows it online too.
  useEffect(() => {
    if (!bridgeConnected || !devices) return;
    const match = devices.find((d) => isLive(d));
    if (!match) return;
    const beacon = () =>
      void fetch('/api/plugin/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key_id: match.id, ...(bridgeModel ? { model: bridgeModel } : {}) }),
      }).catch(() => {});
    beacon();
    const t = setInterval(beacon, 30_000);
    return () => clearInterval(t);
  }, [bridgeConnected, bridgeModel, devices, isLive]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    chatsButtonRef.current?.focus();
  }, []);

  const openSession = useCallback(
    (id: string | null) => {
      if (id !== null && id === sessionId) { if (isMobile) closeDrawer(); return; }
      selectionGeneration.current += 1;
      createRequest.current?.abort();
      createRequest.current = null;
      setSessionId(id);
      setUnavailableRequest(false);
      setError(null);
      setFreshSession(false);
      setChatKey((k) => k + 1);
      writeParams(deviceId, id);
      if (isMobile) closeDrawer();
    },
    [deviceId, sessionId, isMobile, closeDrawer],
  );

  const chooseDevice = useCallback((id: string) => {
    selectionGeneration.current += 1;
    listGeneration.current += 1;
    currentDevice.current = id;
    listRequest.current?.abort();
    listRequest.current = null;
    createRequest.current?.abort();
    createRequest.current = null;
    setCatalog(null);
    laterPageIds.current.clear();
    setListError(null);
    setDeviceId(id);
    setSessions([]);
    setSessionId(null);
    setUnavailableRequest(false);
    setFreshSession(false);
    setChatKey((k) => k + 1);
    writeParams(id, null);
  }, []);

  // A new chat gets its session on the first send (RemoteChat calls this).
  const createSession = useCallback(async (): Promise<string | null> => {
    if (!deviceId) return null;
    const generation = selectionGeneration.current;
    const request = new AbortController();
    createRequest.current = request;
    setError(null);
    try {
      const res = await fetch('/api/plugin/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key_id: deviceId }),
        signal: request.signal,
      });
      const body: unknown = await res.json().catch(() => null);
      if (request.signal.aborted || selectionGeneration.current !== generation || currentDevice.current !== deviceId) return null;
      if (!res.ok) throw new Error(record(body) && typeof body.error === 'string' ? body.error : 'Could not start the chat');
      const session = parseSession(record(body) ? body.session : null);
      if (!session || session.api_key_id !== deviceId || session.native) throw new Error('Could not start the chat');
      // A pre-create list response must not erase the just-created row and unmount its queued send.
      listGeneration.current += 1;
      listRequest.current?.abort();
      listRequest.current = null;
      setSessionsLoading(false);
      setSessions((prev) => [session, ...prev]);
      setFreshSession(true);
      setSessionId(session.id);
      writeParams(deviceId, session.id);
      return session.id;
    } catch (e) {
      if (request.signal.aborted || selectionGeneration.current !== generation || currentDevice.current !== deviceId) return null;
      setError(e instanceof Error ? e.message : 'Could not start the chat');
      return null;
    }
  }, [deviceId]);

  // After a send the server may have titled the chat; refresh the list (and its order).
  const onSent = useCallback(() => {
    if (deviceId) void loadSessions(deviceId);
  }, [deviceId, loadSessions]);

  const renameSession = useCallback(async (id: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    await fetch(`/api/plugin/chat/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === sessionId) openSession(null);
      await fetch(`/api/plugin/chat/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    },
    [sessionId, openSession],
  );

  const sorted = useMemo(() => sortActivity(sessions), [sessions]);
  const active = sessions.find((s) => s.id === sessionId) ?? null;
  const missing = unavailableRequest || (!!sessionId && !active);
  const title = missing ? 'Unavailable chat' : active?.title?.trim() || 'New chat';
  const live = device ? isLive(device) : false;
  const presence = presenceOf(device, { now, live });
  const model = (live ? bridgeModel : null) || device?.model || null;

  const drawer = (
    <SessionsDrawer
      devices={devices ?? []}
      deviceId={deviceId}
      onChooseDevice={chooseDevice}
      sessions={sorted}
      loading={sessionsLoading}
      activeId={sessionId}
      now={now}
      onOpen={openSession}
      onNew={() => openSession(null)}
      onRename={renameSession}
      onDelete={deleteSession}
      modal={isMobile}
      open={!isMobile || drawerOpen}
      onClose={closeDrawer}
      tab={tab}
      onTab={setTab}
      nextCursor={catalog?.nextCursor ?? null}
      incomplete={catalog?.complete === false}
      unavailable={!active && !sessionsLoading && !catalog && !sessions.some((row) => !!row.native)}
      onMore={() => { if (deviceId && catalog?.nextCursor) void loadSessions(deviceId, catalog.nextCursor); }}
      listError={listError}
      onRetry={() => { if (deviceId) void loadSessions(deviceId); }}
    />
  );

  return (
    <div className="rc-root chat-app" ref={rootRef}>
      <section className="chat-main" aria-labelledby="chat-title">
        <header className="chat-header">
          {devices && devices.length > 0 && (
            <button
              ref={chatsButtonRef}
              type="button"
              className="chat-icon-btn chat-drawer-toggle"
              aria-expanded={drawerOpen}
              aria-controls="chat-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <ChatsIcon />
              <span className="visually-hidden">Chats</span>
            </button>
          )}
          <div className="chat-heading">
            <h1 id="chat-title" className="chat-title">
              {devices && devices.length === 0 ? 'Chat' : title}
            </h1>
            {device && (
              <div className="chat-device">
                <span className="chat-device-name">{device.device_name}</span>
                <p role="status" className={`chat-presence is-${presence.state}`}>
                  <span className="chat-presence-dot" aria-hidden="true" />
                  <span>{presence.label}</span>
                  {presence.detail && <span className="chat-presence-detail"> · {presence.detail}</span>}
                </p>
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="chat-banner is-danger" role="alert">
            {error}
          </div>
        )}
        {deviceError && <div className="chat-banner is-danger" role="alert">{deviceError} <button type="button" className="btn btn-secondary" onClick={() => void loadDevices()}>Retry assistant</button></div>}

        {devices === null ? (
          <div className="chat-empty-device" role="log" aria-label="Conversation" aria-live="polite">
            {!deviceError && <p>Loading your assistant…</p>}
          </div>
        ) : devices.length === 0 ? (
          <div className="chat-empty-device">
            <h2>Connect your assistant</h2>
            <p>
              Chat drives the Tex assistant running in your browser. Install it and add a device key, then come back
              here to send it messages from any device.
            </p>
            <a className="btn btn-primary" href={surfaceUrl('ai', '/')}>
              Set up a device
            </a>
          </div>
        ) : missing ? <div className="chat-empty-device" role="status">{sessionsLoading ? 'Loading conversation…' : 'Conversation unavailable'}</div>
        : device && active?.native ? <NativeSessionChat key={`${deviceId}:${chatKey}:${active.id}`} session={active} deviceOnline={presence.state === 'online'} supported={supportsWatch(active.native)} />
        : device ? (
          <RemoteChat
            key={`${deviceId}:${chatKey}`}
            sessionId={sessionId}
            freshSession={freshSession}
            deviceName={device.device_name}
            deviceId={device.id}
            deviceOnline={presence.state === 'online'}
            deviceModel={model}
            onCreateSession={createSession}
            onSent={onSent}
          />
        ) : null}
      </section>
      {/* After the conversation in the DOM (main content first); placed left by the grid. */}
      {devices && devices.length > 0 && drawer}
    </div>
  );
}
