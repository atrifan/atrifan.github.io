'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatDevice } from './ChatApp';
import { getJsonRetrying } from './get-json-retrying';
import { LiveRelayClient } from './live-relay-client';
import { LiveConversation } from './LiveConversation';
import type { SessionRow } from './live-relay-contract';
import { SessionsDrawer } from './SessionsDrawer';
import { sortActivity } from './model/session-list';
import { presenceOf } from './model/presence';
import { record } from './session-contract';
import type { RelaySession } from './frames';
import { useKeyboardInset } from './useKeyboardInset';
import { surfaceUrl } from '../../lib/surface-url';
import './RemoteChat.css';
import './ChatApp.css';
import './SessionDiscovery.css';

function deviceRecord(value: unknown): value is ChatDevice {
  return record(value) && typeof value.id === 'string' && typeof value.device_name === 'string'
    && ['online', 'offline', 'never_connected'].includes(String(value.status))
    && (value.last_seen_at === null || typeof value.last_seen_at === 'string')
    && (value.platform === null || typeof value.platform === 'string') && (value.model === null || typeof value.model === 'string');
}
function drawerRow(row: SessionRow, device: ChatDevice): RelaySession {
  return { id: row.sessionId, api_key_id: device.id, user_id: '', device_name: device.device_name, title: row.title,
    created_at: row.createdAt, updated_at: new Date(row.lastActivity).toISOString(), lastActivity: row.lastActivity,
    snippet: row.snippet, domain: row.domain,
    native: { sessionId: row.sessionId, state: row.state, surface: row.surface, protocol: 1, capabilities: row.capabilities, startedAt: row.startedAt, lastChunkAt: row.lastChunkAt, loopId: row.loopId },
  };
}

export function LiveChatApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  useKeyboardInset(rootRef);
  const [devices, setDevices] = useState<ChatDevice[] | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [client, setClient] = useState<LiveRelayClient | null>(null);
  const clientRef = useRef<LiveRelayClient | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [active, setActive] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyComplete, setHistoryComplete] = useState(true);
  const [activeComplete, setActiveComplete] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('history');
  const [visible, setVisible] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [oldLink, setOldLink] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const listBusy = useRef(false);
  const createBusy = useRef(false);
  const historyPaged = useRef(false);
  const selection = useRef(0);
  const clientId = useRef<string | null>(null);
  const requestedDevice = useRef<string | null>(null);
  const device = devices?.find((item) => item.id === deviceId) ?? null;

  const loadDevices = useCallback(async (signal: AbortSignal) => {
    const body = await getJsonRetrying<unknown>('/api/plugin/devices', { signal });
    if (signal.aborted) return;
    if (!record(body) || !Array.isArray(body.devices) || !body.devices.every(deviceRecord)) { setDeviceError('Could not load your assistant.'); return; }
    setDevices(body.devices); setDeviceError(null);
    const wanted = requestedDevice.current;
    const chosen = wanted ? body.devices.find((item: ChatDevice) => item.id === wanted) : body.devices[0];
    if (wanted && !chosen) { setConnectionError('Requested assistant is unavailable.'); return; }
    if (chosen) setDeviceId((current) => current ?? chosen.id);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    requestedDevice.current = url.searchParams.get('device');
    if (url.searchParams.has('session')) { setOldLink(true); url.searchParams.delete('session'); window.history.replaceState(window.history.state, '', url); }
    const controller = new AbortController(); void loadDevices(controller.signal);
    return () => controller.abort();
  }, [loadDevices]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 959px)');
    const update = () => setMobile(query.matches); update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { const update = () => setVisible(document.visibilityState === 'visible'); update(); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);

  useEffect(() => {
    if (!deviceId) return;
    let running = true;
    let current: LiveRelayClient | null = null;
    clientId.current = crypto.randomUUID();
    setConnectionError(null);
    const connect = () => {
      if (!running || !clientId.current) return;
      const instance = new LiveRelayClient(deviceId, clientId.current, (reason) => {
        if (!running || current !== instance) return;
        clientRef.current = null; setClient(null);
        if (reason === 'rotation') { setConnectionError('Reconnecting to your assistant…'); connect(); }
        else setConnectionError('Assistant unavailable. Retry to connect.');
      });
      current = instance;
      void instance.start().then(() => {
        if (!running || current !== instance || !instance.authorized()) return;
        clientRef.current = instance; setClient(instance); setConnectionError(null);
      }).catch(() => {
        if (running && current === instance) { instance.close('unavailable', false); setConnectionError('Assistant offline or unavailable.'); }
      });
    };
    connect();
    return () => { running = false; clientRef.current = null; setClient(null); current?.close('unavailable', false); };
  }, [deviceId, attempt]);

  const load = useCallback(async (scope: 'active' | 'history', cursor: string | null = null) => {
    const current = clientRef.current;
    if (!current || !current.authorized() || listBusy.current) return;
    listBusy.current = true; setLoading(true);
    try {
      const result = await current.request({ kind: 'catalog.list', scope, cursor, limit: 50 });
      if (clientRef.current !== current || result.type !== 'CATALOG_RESULT') return;
      if (scope === 'history') {
        setHistory((previous) => cursor ? [...previous.filter((old) => !result.sessions.some((row) => row.sessionId === old.sessionId)), ...result.sessions]
          : historyPaged.current ? [...result.sessions, ...previous.filter((old) => !result.sessions.some((row) => row.sessionId === old.sessionId))] : result.sessions);
        if (cursor) historyPaged.current = true;
        if (cursor || !historyPaged.current) { setHistoryCursor(result.catalog.nextCursor); setHistoryComplete(result.catalog.complete); }
      } else { setActive(result.sessions.filter((row) => row.state === 'running' || row.state === 'waiting')); setActiveComplete(result.catalog.complete); }
      setListError(null);
    } catch { if (clientRef.current === current) setListError('Could not load chats.'); }
    finally { listBusy.current = false; setLoading(false); }
  }, []);
  useEffect(() => { if (client) void load(tab); }, [client, tab, load]);
  useEffect(() => {
    if (!client || tab !== 'active' || !visible) return;
    const timer = setInterval(() => void load('active'), 3000);
    return () => clearInterval(timer);
  }, [client, tab, visible, load]);

  function chooseDevice(id: string) {
    if (!devices?.some((item) => item.id === id)) return;
    selection.current++; clientRef.current?.close('unavailable', false); clientRef.current = null; setClient(null);
    historyPaged.current = false; setHistory([]); setActive([]); setSelected(null); setHistoryCursor(null); setHistoryComplete(true); setListError(null); setDeviceId(id); setOldLink(false);
    const url = new URL(window.location.href); url.searchParams.set('device', id); url.searchParams.delete('session'); window.history.replaceState(window.history.state, '', url);
  }
  function open(id: string) {
    const row = [...history, ...active].find((item) => item.sessionId === id);
    if (!row) return;
    selection.current++; setSelected(row); setOldLink(false);
    if (mobile) { setDrawerOpen(false); button.current?.focus(); }
  }
  async function create() {
    const current = clientRef.current;
    if (!current?.canCreate() || createBusy.current) { setConnectionError('Chat creation is unavailable on this assistant.'); return; }
    const generation = ++selection.current;
    createBusy.current = true; setCreating(true);
    try {
      const result = await current.request({ kind: 'session.create', commandId: crypto.randomUUID() });
      if (clientRef.current !== current || generation !== selection.current || result.type !== 'CREATE_RESULT') return;
      setHistory((previous) => [result.session, ...previous]); setSelected(result.session); setOldLink(false);
      if (mobile) { setDrawerOpen(false); button.current?.focus(); }
    } catch { if (clientRef.current === current) setConnectionError('Could not create chat. Review your assistant and retry.'); }
    finally { createBusy.current = false; setCreating(false); }
  }
  const rows = tab === 'history' ? history : active;
  const mapped = useMemo(() => device ? sortActivity(rows.map((row) => drawerRow(row, device))) : [], [rows, device]);
  const presence = presenceOf(device, { now });
  const closeDrawer = useCallback(() => { setDrawerOpen(false); button.current?.focus(); }, []);
  return <div className="rc-root chat-app" ref={rootRef}>
    <section className="chat-main" aria-labelledby="chat-title">
      <header className="chat-header">
        {devices && devices.length > 0 && <button ref={button} type="button" className="chat-icon-btn chat-drawer-toggle" aria-expanded={drawerOpen} aria-controls="chat-drawer" onClick={() => setDrawerOpen(true)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16" /></svg><span className="visually-hidden">Chats</span></button>}
        <div className="chat-heading"><h1 id="chat-title" className="chat-title">{oldLink ? 'Unavailable chat' : selected?.title?.trim() || (devices?.length === 0 ? 'Chat' : 'New chat')}</h1>
          {device && <div className="chat-device"><span className="chat-device-name">{device.device_name}</span><p role="status" className={`chat-presence is-${presence.state}`}><span className="chat-presence-dot" aria-hidden="true" /><span>{presence.label}</span>{presence.detail && <span className="chat-presence-detail"> · {presence.detail}</span>}</p></div>}
        </div>
      </header>
      {deviceError && <div className="chat-banner is-danger" role="alert">{deviceError}</div>}
      {connectionError && <div className="chat-banner is-danger" role="alert">{connectionError}</div>}
      {oldLink && <div className="chat-banner" role="status">This old chat link is unavailable. Select a conversation from your assistant.</div>}
      {devices === null ? <div className="chat-empty-device" role="log" aria-label="Conversation">Loading your assistant…</div>
        : devices.length === 0 ? <div className="chat-empty-device"><h2>Connect your assistant</h2><a className="btn btn-primary" href={surfaceUrl('ai', '/')}>Set up a device</a></div>
        : <LiveConversation key={`${deviceId ?? 'none'}:${selected?.sessionId ?? 'none'}`} row={selected} client={client} creating={creating} retry={() => setAttempt((value) => value + 1)} />}
    </section>
    {devices && devices.length > 0 && <SessionsDrawer devices={devices} deviceId={deviceId} onChooseDevice={chooseDevice} sessions={mapped} loading={loading} activeId={selected?.sessionId ?? null} now={now} onOpen={open} onNew={() => void create()} onRename={() => {}} onDelete={() => {}} modal={mobile} open={!mobile || drawerOpen} onClose={closeDrawer} tab={tab} onTab={setTab} nextCursor={tab === 'history' ? historyCursor : null} incomplete={tab === 'history' ? !historyComplete : !activeComplete} unavailable={!client} onMore={() => { if (historyCursor) void load('history', historyCursor); }} listError={listError} onRetry={() => { if (client) void load(tab); else setAttempt((value) => value + 1); }} />}
  </div>;
}
