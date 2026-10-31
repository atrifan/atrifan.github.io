import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { viewerAuth, deviceAuth, ownedDevice, currentSession, type Principal, type Viewer } from './auth';
import { brokerConfig, connectBroker, type Broker } from './broker';
import { bodyObject, issueToken, parsePart, parseRequest, tokenSecret, uuid, verifyToken, type ViewerClaims } from './protocol';
import { checkOrigin, errorResponse, invalid, readBody, RelayError, securityHeaders, unauthorized } from './http';

type Kind = 'viewerStream' | 'viewerRequests' | 'deviceStream' | 'deviceFrames';
const MAX_LEASE = 5000;
const date = (time: number) => new Date(time).toISOString();
const validateUuid = (value: unknown) => { const result = uuid.safeParse(value); if (!result.success) return invalid(); return result.data; };
type CheckStart = { wall: number; monotonic: number };

async function deadline<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  if (signal.aborted) throw new RelayError(504, 'timeout');
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new RelayError(504, 'timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([work, cancelled]); }
  finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
}
function live(signal: AbortSignal): void { if (signal.aborted) throw new RelayError(504, 'timeout'); }

function leaseFromCheckStart(start: CheckStart, expiresAt: number): { until: number; monotonicUntil: number } {
  const duration = Math.min(MAX_LEASE, expiresAt - start.wall);
  if (duration <= 0 || performance.now() - start.monotonic >= duration || Date.now() >= expiresAt) throw new RelayError(409, 'stream_expired');
  return { until: start.wall + duration, monotonicUntil: start.monotonic + duration };
}

async function freshCheck(viewer: Viewer | null, principal: Principal, request: Request, expiresAt: number, signal: AbortSignal): Promise<{ until: number; monotonicUntil: number }> {
  const start = { monotonic: performance.now(), wall: Date.now() };
  if (viewer) {
    await deadline(signal, currentSession(viewer.userId, viewer.sessionId));
    await deadline(signal, ownedDevice(viewer.userId, principal.deviceId));
  } else {
    const now = await deadline(signal, deviceAuth(request));
    if (now.userId !== principal.userId || now.deviceId !== principal.deviceId) unauthorized();
  }
  return leaseFromCheckStart(start, expiresAt);
}

function matchesViewer(claim: ViewerClaims, viewer: Viewer): void {
  if (claim.userId !== viewer.userId || claim.viewerSessionId !== viewer.sessionId) unauthorized();
}

const requestEnvelope = z.object({ protocol: z.literal(2), ownerUserId: z.string(), deviceId: uuid, clientId: uuid, viewerStreamId: uuid, viewerToken: z.string(), viewerExpiresAt: z.string(), authorizedUntil: z.string(), request: z.unknown() }).strict();
const frameEnvelope = z.object({ protocol: z.literal(2), deviceId: uuid, viewerStreamId: uuid, connectionId: uuid, part: z.unknown() }).strict();

async function stream(
  request: Request,
  viewer: Viewer | null,
  principal: Principal,
  clientId: string,
  connectionId: string | null,
  signal: AbortSignal,
  startupCheck?: CheckStart,
): Promise<Response> {
  if (request.headers.get('last-event-id')) throw new RelayError(409, 'resync_required');
  const secret = tokenSecret();
  const config = brokerConfig();
  const streamId = randomUUID();
  const channel = viewer ? `tc2:v:${streamId}` : `tc2:d:${principal.deviceId}`;
  let broker: Broker | undefined;
  let closed = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let lease: { until: number; monotonicUntil: number } | undefined;
  let expiresAt = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let leaseTimer: ReturnType<typeof setTimeout> | undefined;
  let queueTimer: ReturnType<typeof setTimeout> | undefined;
  let checking = false;
  let processing = false;
  let queuedBytes = 0;
  let inflightBytes = 0;
  let streamBytes = 0;
  let streamAt: number | undefined;
  const lifetime = new AbortController();
  const incoming: Array<{ value: unknown; bytes: number; at: number }> = [];
  const output: Array<{ bytes: Uint8Array; at: number }> = [];
  const encoder = new TextEncoder();
  const encode = (event: string, value: unknown) => encoder.encode(`event:${event}\ndata:${JSON.stringify(value)}\n\n`);
  const flush = () => {
    if (!controller || closed) return;
    if (!lease || performance.now() >= lease.monotonicUntil || Date.now() >= lease.until) { closeWith('revoked'); return; }
    while (output.length && (controller.desiredSize ?? 0) > 0) {
      const item = output.shift()!;
      queuedBytes -= item.bytes.byteLength;
      streamBytes = item.bytes.byteLength;
      streamAt = item.at;
      controller.enqueue(item.bytes);
    }
    scheduleQueue();
  };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (interval) clearInterval(interval);
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearTimeout(leaseTimer);
    if (queueTimer) clearTimeout(queueTimer);
    lifetime.abort();
    request.signal.removeEventListener('abort', onAbort);
    incoming.length = 0; output.length = 0; queuedBytes = 0; inflightBytes = 0; streamBytes = 0; streamAt = undefined;
    broker?.close();
    try { controller?.close(); } catch { /* canceled */ }
  };
  const closeWith = (reason: 'rotation' | 'revoked' | 'expired' | 'broker_unavailable' | 'overflow') => {
    if (!closed && controller) {
      try {
        if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encode('closing', { protocol: 2, reason }));
        else controller.error(new Error('relay_closed'));
      } catch { /* closed */ }
    }
    cleanup();
  };
  const onAbort = () => cleanup();
  const setLease = (value: { until: number; monotonicUntil: number }) => {
    lease = value;
    if (leaseTimer) clearTimeout(leaseTimer);
    leaseTimer = setTimeout(() => closeWith('revoked'), Math.max(0, Math.min(value.until - Date.now(), value.monotonicUntil - performance.now())));
  };
  const scheduleQueue = () => {
    if (queueTimer) clearTimeout(queueTimer);
    const oldest = Math.min(incoming[0]?.at ?? Infinity, output[0]?.at ?? Infinity, streamAt ?? Infinity);
    if (Number.isFinite(oldest)) queueTimer = setTimeout(() => closeWith('overflow'), Math.max(0, MAX_LEASE - (performance.now() - oldest)));
  };
  const push = (event: string, value: unknown) => {
    if (closed) return;
    const bytes = encode(event, value);
    if (incoming.length + output.length + (inflightBytes ? 1 : 0) + (streamBytes ? 1 : 0) >= 32 || queuedBytes + inflightBytes + streamBytes + bytes.byteLength > 512 * 1024) { closeWith('overflow'); return; }
    output.push({ bytes, at: performance.now() }); queuedBytes += bytes.byteLength; flush(); scheduleQueue();
  };
  const process = async () => {
    if (processing || closed || !controller) return;
    processing = true;
    try {
      while (incoming.length && !closed) {
        const item = incoming.shift()!; queuedBytes -= item.bytes; inflightBytes = item.bytes; scheduleQueue();
        if (performance.now() - item.at >= MAX_LEASE) { closeWith('overflow'); return; }
        const nextLease = await freshCheck(viewer, principal, request, expiresAt, lifetime.signal);
        if (closed || performance.now() >= nextLease.monotonicUntil || Date.now() >= nextLease.until) { closeWith('revoked'); return; }
        setLease(nextLease);
        if (viewer) {
          const parsed = frameEnvelope.safeParse(item.value);
          if (!parsed.success || parsed.data.deviceId !== principal.deviceId || parsed.data.viewerStreamId !== streamId) { closeWith('broker_unavailable'); return; }
          parsePart(parsed.data.part);
          inflightBytes = 0; push('frame', parsed.data);
        } else {
          const parsed = requestEnvelope.safeParse(item.value);
          if (!parsed.success) { closeWith('broker_unavailable'); return; }
          const envelope = parsed.data;
          const token = verifyToken(envelope.viewerToken, 'viewer', secret);
          const until = Date.parse(envelope.authorizedUntil);
          if (token.userId !== principal.userId || token.deviceId !== principal.deviceId || envelope.ownerUserId !== token.userId || envelope.deviceId !== token.deviceId || envelope.viewerStreamId !== token.streamId || envelope.clientId !== token.clientId || envelope.viewerExpiresAt !== date(token.exp * 1000) || !Number.isFinite(until) || date(until) !== envelope.authorizedUntil || until <= Date.now() || until > Date.now() + MAX_LEASE || until > token.exp * 1000) { closeWith('revoked'); return; }
          parseRequest(envelope.request);
          await deadline(lifetime.signal, currentSession(token.userId, token.viewerSessionId));
          if (closed || performance.now() >= nextLease.monotonicUntil || Date.now() >= nextLease.until || Date.parse(envelope.authorizedUntil) <= Date.now()) { closeWith('revoked'); return; }
          inflightBytes = 0; push('request', envelope);
        }
      }
    } catch { closeWith('revoked'); }
    finally { inflightBytes = 0; processing = false; }
  };
  const receive = (value: unknown) => {
    if (closed) return;
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (incoming.length + output.length + (inflightBytes ? 1 : 0) + (streamBytes ? 1 : 0) >= 32 || queuedBytes + inflightBytes + streamBytes + bytes > 512 * 1024) { closeWith('overflow'); return; }
    incoming.push({ value, bytes, at: performance.now() }); queuedBytes += bytes; scheduleQueue();
    void process();
  };
  try {
  broker = await deadline(signal, connectBroker(config, channel, signal, receive, () => closeWith('broker_unavailable')));
  live(signal);
  const iat = Math.floor(Date.now() / 1000);
  expiresAt = (iat + 45) * 1000;
  // Device streams are already authenticated before body parse in handle(); reuse that successful
  // check for the initial lease so READY is not delayed by a duplicate key lookup. The periodic 2s
  // refresh below still revalidates the current key on every lease extension.
  const initialLease = startupCheck ? leaseFromCheckStart(startupCheck, expiresAt) : await freshCheck(viewer, principal, request, expiresAt, signal);
  setLease(initialLease);
  live(signal);
  if (closed) throw new RelayError(503, 'broker_unavailable');
  const claims = { v: 2, aud: viewer ? 'viewer' : 'device', userId: principal.userId, deviceId: principal.deviceId, streamId, clientId, iat, exp: iat + 45, nonce: randomUUID(), ...(viewer ? { viewerSessionId: viewer.sessionId } : { connectionId }) };
  const capability = issueToken(claims, secret);
  const ready = { protocol: 2, streamId, ...(viewer ? { viewerToken: capability } : { deviceToken: capability }), ownerUserId: principal.userId, deviceId: principal.deviceId, ...(viewer ? {} : { connectionId }), serverTime: date(Date.now()), authorizedUntil: date(initialLease.until), expiresAt: date(expiresAt) };
  const body = new ReadableStream<Uint8Array>({
    start(c) { controller = c; const bytes = encode('ready', ready); streamBytes = bytes.byteLength; streamAt = performance.now(); c.enqueue(bytes); scheduleQueue(); void process(); },
    pull() { streamBytes = 0; streamAt = undefined; flush(); },
    cancel() { cleanup(); },
  });
  request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) { cleanup(); throw new RelayError(504, 'timeout'); }
  timeout = setTimeout(() => closeWith('rotation'), Math.max(0, expiresAt - Date.now()));
  interval = setInterval(() => {
    if (closed) return;
    if (!lease || performance.now() >= lease.monotonicUntil || Date.now() >= lease.until) { closeWith('revoked'); return; }
    if ((incoming[0] && performance.now() - incoming[0].at >= MAX_LEASE) || (output[0] && performance.now() - output[0].at >= MAX_LEASE)) { closeWith('overflow'); return; }
    if (checking) return;
    checking = true;
    void freshCheck(viewer, principal, request, expiresAt, lifetime.signal).then((next) => {
      if (closed) return;
      if (!lease || performance.now() >= lease.monotonicUntil || Date.now() >= lease.until) { closeWith('revoked'); return; }
      setLease(next);
      push('heartbeat', { protocol: 2, serverTime: date(Date.now()), authorizedUntil: date(next.until) });
    }).catch(() => closeWith('revoked')).finally(() => { checking = false; });
  }, 2000);
  return new Response(body, { status: 200, headers: { ...securityHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function handle(kind: Kind, request: Request, signal: AbortSignal): Promise<Response> {
  const viewer = kind.startsWith('viewer') ? await deadline(signal, viewerAuth()) : null;
  const startupCheck = viewer ? null : { wall: Date.now(), monotonic: performance.now() };
  const principal = viewer ? null : await deadline(signal, deviceAuth(request));
  if (viewer) checkOrigin(request);
  live(signal);
  const raw = await deadline(signal, readBody(request, signal));
  live(signal);
  if (kind === 'viewerStream') {
    const body = bodyObject(raw, ['protocol', 'deviceId', 'clientId']);
    const device = validateUuid(body.deviceId);
    const client = validateUuid(body.clientId);
    const owner = await deadline(signal, ownedDevice(viewer!.userId, device));
    return stream(request, viewer, owner, client, null, signal);
  }
  if (kind === 'deviceStream') {
    const body = bodyObject(raw, ['protocol', 'connectionId']);
    const connection = validateUuid(body.connectionId);
    return stream(request, null, principal!, connection, connection, signal, startupCheck!);
  }
  const secret = tokenSecret();
  if (kind === 'viewerRequests') {
    const body = bodyObject(raw, ['protocol', 'viewerToken', 'request']);
    const token = verifyToken(body.viewerToken, 'viewer', secret);
    matchesViewer(token, viewer!);
    const operation = parseRequest(body.request);
    const owner = await deadline(signal, ownedDevice(token.userId, token.deviceId));
    const broker = await deadline(signal, connectBroker(brokerConfig(), `tc2:d:${owner.deviceId}`, signal, () => {}, () => {}));
    try {
      const lease = await freshCheck(viewer, owner, request, token.exp * 1000, signal);
      parseRequest(operation); live(signal);
      if (performance.now() >= lease.monotonicUntil || Date.now() >= lease.until) throw new RelayError(409, 'stream_expired');
      await deadline(signal, broker.publish({ protocol: 2, ownerUserId: owner.userId, deviceId: owner.deviceId, clientId: token.clientId, viewerStreamId: token.streamId, viewerToken: body.viewerToken, viewerExpiresAt: date(token.exp * 1000), authorizedUntil: date(lease.until), request: operation }));
      return Response.json({ accepted: true, requestId: operation.requestId }, { status: 202, headers: securityHeaders });
    } finally { broker.close(); }
  }
  const body = bodyObject(raw, ['protocol', 'deviceToken', 'viewerToken', 'part']);
  const deviceToken = verifyToken(body.deviceToken, 'device', secret);
  const viewerToken = verifyToken(body.viewerToken, 'viewer', secret);
  if (deviceToken.userId !== principal!.userId || deviceToken.deviceId !== principal!.deviceId || viewerToken.userId !== principal!.userId || viewerToken.deviceId !== principal!.deviceId) unauthorized();
  const part = parsePart(body.part);
  await deadline(signal, currentSession(viewerToken.userId, viewerToken.viewerSessionId));
  const broker = await deadline(signal, connectBroker(brokerConfig(), `tc2:v:${viewerToken.streamId}`, signal, () => {}, () => {}));
  try {
    const lease = await freshCheck(null, principal!, request, Math.min(deviceToken.exp, viewerToken.exp) * 1000, signal);
    await deadline(signal, currentSession(viewerToken.userId, viewerToken.viewerSessionId));
    live(signal);
    if (performance.now() >= lease.monotonicUntil || Date.now() >= lease.until) throw new RelayError(409, 'stream_expired');
    await deadline(signal, broker.publish({ protocol: 2, deviceId: principal!.deviceId, viewerStreamId: viewerToken.streamId, connectionId: deviceToken.connectionId, part }));
    return Response.json({ accepted: true, frameId: part.frameId, index: part.index }, { status: 202, headers: securityHeaders });
  } finally { broker.close(); }
}

export function route(kind: Kind) {
  return async (request: Request): Promise<Response> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 5000);
    try { return await deadline(controller.signal, handle(kind, request, controller.signal)); }
    catch (error) { return errorResponse(error); }
    finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); }
  };
}
