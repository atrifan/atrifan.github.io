import WebSocket from 'ws';
import { RelayError } from './http';

type BrokerConfig = { url: string; jwt: string };
export type Broker = { publish(payload: unknown): Promise<void>; close(): void };
const unavailable = () => new RelayError(503, 'broker_unavailable');

function jwtPayload(value: string): Record<string, unknown> | null {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch { return null; }
}

/** Local claim checks are not JWT signature verification or hosted RLS proof. */
export function brokerConfig(): BrokerConfig {
  const base = process.env.STORAGE_SUPABASE_URL;
  const key = process.env.CHAT_REALTIME_ANON_KEY;
  const jwt = process.env.CHAT_BROKER_JWT;
  const secret = process.env.CHAT_RELAY_TOKEN_SECRET;
  if (!base || !key || !jwt || !secret || !/^[A-Za-z0-9_-]+$/.test(secret)) throw new RelayError(500, 'server_misconfigured');
  const secretBytes = Buffer.from(secret, 'base64url');
  if (secretBytes.length !== 32 || secretBytes.toString('base64url') !== secret) throw new RelayError(500, 'server_misconfigured');
  let url: URL;
  try {
    url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error();
  } catch { throw new RelayError(500, 'server_misconfigured'); }
  const gateway = jwtPayload(key);
  if (key === process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || !(key.startsWith('sb_publishable_') || gateway?.role === 'anon')) throw new RelayError(500, 'server_misconfigured');
  const claims = jwtPayload(jwt);
  const now = Math.floor(Date.now() / 1000);
  if (!claims || claims.role !== 'tulzo_chat_broker' || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp < now + 60 || typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat > now + 2 || claims.iat >= claims.exp) throw new RelayError(500, 'server_misconfigured');
  url.protocol = 'wss:';
  url.pathname = '/realtime/v1/websocket';
  url.search = new URLSearchParams({ apikey: key, vsn: '1.0.0', log_level: 'error' }).toString();
  return { url: url.toString(), jwt };
}

/** One non-reconnecting Phoenix socket. Callers must never pass a user URL. */
export function connectBroker(config: BrokerConfig, channel: string, signal: AbortSignal, receive: (payload: unknown) => void, failed: () => void): Promise<Broker> {
  if (!/^tc2:[dv]:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(channel)) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try { socket = new WebSocket(config.url, { maxPayload: 128 * 1024, perMessageDeflate: false, followRedirects: false, handshakeTimeout: 5000 }); }
    catch { reject(unavailable()); return; }
    const topic = `realtime:${channel}`;
    let joined = false;
    let closed = false;
    let nextRef = 1;
    let heartbeatRef: string | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    let pending: { ref: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; ack: boolean; sent: boolean } | undefined;
    const joinTimer = setTimeout(() => stop(), 5000);
    const stop = () => {
      if (closed) return;
      closed = true;
      clearTimeout(joinTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      signal.removeEventListener('abort', stop);
      if (pending) { clearTimeout(pending.timer); pending.reject(unavailable()); pending = undefined; }
      try { socket.terminate(); } catch { /* already closed */ }
      if (!joined) reject(unavailable()); else failed();
    };
    const close = () => { if (!closed) { joined = false; stop(); } };
    const send = (frame: object, callback?: (error?: Error) => void) => {
      if (closed || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256 * 1024) throw unavailable();
      const encoded = JSON.stringify(frame);
      if (Buffer.byteLength(encoded) > 128 * 1024) throw unavailable();
      socket.send(encoded, callback);
    };
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) { stop(); return; }
    socket.on('error', stop);
    socket.on('close', stop);
    socket.on('open', () => {
      try { send({ topic, event: 'phx_join', payload: { config: { private: true, broadcast: { ack: true, self: false }, presence: { enabled: false }, postgres_changes: [] }, access_token: config.jwt }, ref: '1', join_ref: '1' }, (error) => { if (error) stop(); }); }
      catch { stop(); }
    });
    socket.on('message', (raw, binary) => {
      if (closed) return;
      if (binary) { stop(); return; }
      let frame: Record<string, unknown>;
      try { frame = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { stop(); return; }
      if (!frame || typeof frame !== 'object') { stop(); return; }
      if (frame.event === 'phx_reply') {
        const payload = frame.payload as { status?: unknown } | null;
        if (frame.topic === 'phoenix' && frame.ref === heartbeatRef) {
          if (payload?.status !== 'ok') { stop(); return; }
          heartbeatRef = null;
          if (heartbeatTimer) clearTimeout(heartbeatTimer);
          return;
        }
        if (frame.topic !== topic || frame.join_ref !== '1') return;
        if (!joined && frame.ref === '1') {
          if (payload?.status !== 'ok') { stop(); return; }
          joined = true; clearTimeout(joinTimer);
          heartbeatInterval = setInterval(() => {
            if (heartbeatRef) { stop(); return; }
            heartbeatRef = String(++nextRef);
            try { send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: heartbeatRef }, (error) => { if (error) stop(); }); }
            catch { stop(); return; }
            heartbeatTimer = setTimeout(stop, 3000);
          }, 20000);
          resolve({ publish: (body) => new Promise<void>((ok, fail) => {
            if (!joined || closed || pending || socket.readyState !== WebSocket.OPEN) { fail(unavailable()); return; }
            const ref = String(++nextRef);
            const entry = { ref, resolve: ok, reject: fail, timer: setTimeout(stop, 3000), ack: false, sent: false };
            pending = entry;
            try {
              // No await between the final state check and the sole app send.
              if (!joined || closed || socket.readyState !== WebSocket.OPEN) throw unavailable();
              send({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'relay', payload: body }, ref, join_ref: '1' }, (error) => {
                if (error) { stop(); return; }
                entry.sent = true;
                if (pending === entry && entry.ack) { clearTimeout(entry.timer); pending = undefined; entry.resolve(); }
              });
            } catch { stop(); }
          }), close });
          return;
        }
        if (pending && frame.ref === pending.ref) {
          if (payload?.status !== 'ok') { stop(); return; }
          pending.ack = true;
          if (pending.sent) { const entry = pending; clearTimeout(entry.timer); pending = undefined; entry.resolve(); }
        }
        return;
      }
      if (joined && frame.topic === topic && frame.event === 'broadcast') {
        const payload = frame.payload as { type?: unknown; event?: unknown; payload?: unknown } | null;
        if (payload?.type !== 'broadcast' || payload.event !== 'relay' || !('payload' in payload)) { stop(); return; }
        try { receive(payload.payload); } catch { stop(); }
        return;
      }
      stop();
    });
  });
}
