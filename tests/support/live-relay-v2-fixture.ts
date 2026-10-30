/**
 * Loopback-only synthetic relay/PC peer for live-relay-v2.spec.ts. The real ChatApp
 * uses fetch and parses an actual fragmented SSE response; this module is a test
 * peer, not an implementation of the app adapter or a production broker.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { buildBundle, outDir } from './chat-fixture-server';

type Scenario = {
  device: { id: string; device_name: string; status: 'online' | 'offline'; last_seen_at: string | null; platform: string; model: string };
  rows: Array<Record<string, unknown>>;
  history?: Record<string, Array<Record<string, unknown>>>;
  snapshots?: Record<string, Record<string, unknown>>;
  catalogPages?: Record<string, Record<string, unknown>>;
  holdAck?: string[];
  helloError?: boolean;
  heartbeatDisabled?: boolean;
};
type Stream = {
  response: ServerResponse;
  deviceId: string;
  viewerStreamId: string;
  viewerToken: string;
  connectionId: string;
  caseId: string;
  expiresAt: number;
  lastServerTime: number;
  heartbeatTimer?: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
  cleaned: boolean;
};

const MAX_BODY = 128 * 1024;
const scenarios = new Map<string, Scenario>();
const streams = new Map<string, Stream[]>();
const entries: Array<Record<string, unknown>> = [];
const pendingAcks = new Map<string, () => void>();
const activeStreams = new Set<Stream>();
const closeWaiters = new Set<() => void>();
let order = 0;
let activeHeartbeatTimers = 0;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function bodyJson(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_BODY) throw new Error('test peer body too large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function record(entry: Record<string, unknown>): void {
  entries.push({ order: ++order, ...entry });
}

function event(res: ServerResponse, name: string, value: unknown): void {
  if (!res.destroyed && !res.writableEnded) res.write(`event:${name}\ndata:${JSON.stringify(value)}\n\n`);
}

/** PC watch leases cannot outlive the authenticated viewer stream. */
export function watchLeaseExpiresAt(now: number, viewerExpiresAt: number): string {
  return new Date(Math.min(now + 15_000, viewerExpiresAt)).toISOString();
}

export function capWatchLeaseExpiresAt(pcLeaseExpiresAt: string, viewerExpiresAt: number): string {
  return new Date(Math.min(Date.parse(pcLeaseExpiresAt), viewerExpiresAt)).toISOString();
}

function serverTime(stream: Stream, checkStart: number): number {
  stream.lastServerTime = Math.max(checkStart, stream.lastServerTime + 1);
  return stream.lastServerTime;
}

function cleanupStream(stream: Stream): void {
  if (stream.cleaned) return;
  stream.cleaned = true;
  if (stream.heartbeatTimer) {
    clearInterval(stream.heartbeatTimer);
    stream.heartbeatTimer = undefined;
    activeHeartbeatTimers -= 1;
  }
  if (stream.expiryTimer) {
    clearTimeout(stream.expiryTimer);
    stream.expiryTimer = undefined;
  }
  activeStreams.delete(stream);
  for (const resolve of closeWaiters) resolve();
  closeWaiters.clear();
  record({ kind: 'stream-cleanup', deviceId: stream.deviceId, caseId: stream.caseId, viewerStreamId: stream.viewerStreamId });
}

function endStream(stream: Stream, reason?: 'rotation' | 'expired'): void {
  if (stream.cleaned) return;
  cleanupStream(stream);
  if (reason) event(stream.response, 'closing', { protocol: 2, reason });
  if (!stream.response.destroyed && !stream.response.writableEnded) stream.response.end();
  record({ kind: 'stream-ended', deviceId: stream.deviceId, caseId: stream.caseId, viewerStreamId: stream.viewerStreamId, reason: reason ?? 'transport_closed' });
}

function startStreamTimers(stream: Stream, scenario: Scenario): void {
  activeStreams.add(stream);
  stream.heartbeatTimer = setInterval(() => {
    if (stream.cleaned) return;
    const checkStart = Date.now();
    if (checkStart >= stream.expiresAt) {
      endStream(stream, 'expired');
      return;
    }
    if (scenario.heartbeatDisabled) return;

    // The test peer models a successful fresh authority check at callback start.
    const stamp = serverTime(stream, checkStart);
    event(stream.response, 'heartbeat', {
      protocol: 2,
      serverTime: new Date(stamp).toISOString(),
      authorizedUntil: new Date(Math.min(checkStart + 5_000, stream.expiresAt)).toISOString(),
    });
    record({ kind: 'heartbeat', deviceId: stream.deviceId, caseId: stream.caseId, viewerStreamId: stream.viewerStreamId, serverTime: new Date(stamp).toISOString() });
  }, 2_000);
  activeHeartbeatTimers += 1;
  stream.expiryTimer = setTimeout(() => endStream(stream, 'expired'), Math.max(0, stream.expiresAt - Date.now()));
}

export function fixtureDiagnostics(): { activeStreams: number; activeHeartbeatTimers: number } {
  return { activeStreams: activeStreams.size, activeHeartbeatTimers };
}

/** Wait for the next actual response close instead of sleeping in health tests. */
export function waitForFixtureStreamClose(): Promise<void> {
  return new Promise((resolve) => closeWaiters.add(resolve));
}

function currentStream(deviceId: string, viewerToken?: string): Stream | undefined {
  const available = streams.get(deviceId) ?? [];
  return [...available].reverse().find((stream) => !stream.response.destroyed && (!viewerToken || stream.viewerToken === viewerToken));
}

function frame(stream: Stream, logical: Record<string, unknown>): void {
  const bytes = Buffer.from(JSON.stringify(logical), 'utf8');
  const frameId = randomUUID();
  const chunkSize = 700;
  const count = Math.max(1, Math.ceil(bytes.length / chunkSize));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  for (let index = 0; index < count; index += 1) {
    const data = bytes.subarray(index * chunkSize, Math.min(bytes.length, (index + 1) * chunkSize)).toString('base64');
    const part = { frameId, requestId: logical.requestId, index, count, sha256, data };
    event(stream.response, 'frame', {
      protocol: 2,
      deviceId: stream.deviceId,
      viewerStreamId: stream.viewerStreamId,
      connectionId: stream.connectionId,
      part,
    });
    record({ kind: 'frame-part', deviceId: stream.deviceId, caseId: stream.caseId, requestId: logical.requestId, logicalType: logical.type, logicalSessionId: (logical.session as Record<string, unknown> | undefined)?.sessionId ?? logical.sessionId, frameId, index, count });
  }
}

function rowFor(scenario: Scenario, sessionId: string): Record<string, unknown> | undefined {
  return scenario.rows.find((row) => row.sessionId === sessionId);
}

function defaultSnapshot(request: Record<string, any>, row: Record<string, any>, stream: Stream): Record<string, unknown> {
  return {
    type: 'WATCH_SNAPSHOT',
    requestId: request.requestId,
    sessionId: row.sessionId,
    watchId: request.op.watchId,
    through: 0,
    stateVersion: randomUUID(),
    state: row.state,
    loopId: row.loopId ?? null,
    pending: null,
    messages: [],
    historyComplete: true,
    historyCursor: null,
    leaseExpiresAt: watchLeaseExpiresAt(Date.now(), stream.expiresAt),
  };
}

function sendForOperation(scenario: Scenario, stream: Stream, request: Record<string, any>): void {
  const op = request.op as Record<string, any>;
  const base = { requestId: request.requestId };
  if (op.kind === 'hello') {
    if (scenario.helloError) {
      frame(stream, { type: 'REQUEST_ERROR', ...base, reason: 'offline' });
    } else {
      frame(stream, { type: 'DEVICE_READY', ...base, connectionId: stream.connectionId, capabilities: { catalog: true, history: true, watch: true, create: true } });
    }
    return;
  }
  if (op.kind === 'catalog.list') {
    const pageKey = `${op.scope}:${op.cursor ?? ''}`;
    const page = scenario.catalogPages?.[pageKey];
    if (page) {
      frame(stream, { type: 'CATALOG_RESULT', ...base, scope: op.scope, ...page });
      return;
    }
    const sessions = scenario.rows.filter((row) => op.scope !== 'active' || row.state === 'running' || row.state === 'waiting');
    frame(stream, {
      type: 'CATALOG_RESULT',
      ...base,
      scope: op.scope,
      sessions,
      catalog: { version: 2, complete: true, nextCursor: null },
    });
    return;
  }
  if (op.kind === 'history.read') {
    frame(stream, {
      type: 'HISTORY_RESULT',
      ...base,
      sessionId: op.sessionId,
      messages: scenario.history?.[op.sessionId] ?? [],
      nextCursor: null,
      complete: true,
      revision: randomUUID(),
    });
    return;
  }
  if (op.kind === 'watch.attach') {
    const row = rowFor(scenario, op.sessionId);
    if (row) {
      const snapshot: Record<string, unknown> = {
        ...defaultSnapshot(request, row, stream),
        ...scenario.snapshots?.[op.sessionId],
        requestId: request.requestId,
        sessionId: op.sessionId,
        watchId: op.watchId,
      };
      snapshot.leaseExpiresAt = capWatchLeaseExpiresAt(String(snapshot.leaseExpiresAt), stream.expiresAt);
      frame(stream, snapshot);
    }
    else frame(stream, { type: 'REQUEST_ERROR', ...base, sessionId: op.sessionId, watchId: op.watchId, reason: 'not_found' });
    return;
  }
  if (op.kind === 'watch.renew') {
    frame(stream, { type: 'WATCH_RENEWED', ...base, sessionId: op.sessionId, watchId: op.watchId, leaseExpiresAt: watchLeaseExpiresAt(Date.now(), stream.expiresAt) });
    return;
  }
  if (op.kind === 'watch.detach') {
    frame(stream, { type: 'WATCH_DETACHED', ...base, sessionId: op.sessionId, watchId: op.watchId });
    return;
  }
  if (op.kind === 'session.create') {
    const sessionId = randomUUID();
    const session = {
      sessionId,
      title: 'New chat',
      createdAt: new Date().toISOString(),
      lastActivity: Date.now(),
      state: 'idle',
      surface: 'web',
      capabilities: { watch: true, reply: true, answer: true, stop: true },
    };
    scenario.rows.unshift(session);
    frame(stream, { type: 'CREATE_RESULT', ...base, commandId: op.commandId, session, outcome: 'applied' });
  }
  // A command deliberately has no automatic execution result. Tests inject a
  // PC-authored COMMAND_RESULT through the separate control endpoint.
}

async function handleViewerRequest(req: IncomingMessage, res: ServerResponse, body: Record<string, any>): Promise<void> {
  const viewer = currentStream(body.request?.deviceId ?? '', body.viewerToken) ?? [...streams.values()].flat().reverse().find((stream) => stream.viewerToken === body.viewerToken);
  const stream = viewer ?? [...streams.values()].flat().reverse().find((candidate) => candidate.viewerToken === body.viewerToken);
  const request = body.request;
  if (!stream || !request || typeof request.requestId !== 'string' || !request.op?.kind) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  record({ kind: 'publish', path: '/api/plugin/chat/v2/viewer/requests', deviceId: stream.deviceId, caseId: stream.caseId, viewerStreamId: stream.viewerStreamId, request, httpBody: body });
  const scenario = scenarios.get(stream.deviceId)!;
  sendForOperation(scenario, stream, request);
  if ((scenario.holdAck ?? []).includes(request.op.kind)) {
    await new Promise<void>((resolve) => pendingAcks.set(request.requestId, resolve));
  }
  record({ kind: 'ack', deviceId: stream.deviceId, caseId: stream.caseId, requestId: request.requestId, operation: request.op.kind });
  sendJson(res, 202, { accepted: true, requestId: request.requestId });
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const name = path.extname(pathname) ? pathname.slice(1) : 'index.html';
  const file = path.resolve(outDir, path.normalize(name));
  if (!file.startsWith(`${path.resolve(outDir)}${path.sep}`) && file !== path.join(path.resolve(outDir), 'index.html')) {
    res.writeHead(404).end('not found');
    return;
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

export async function startLiveRelayFixture(port = Number(process.env.CHAT_RELAY_PORT ?? 3441)): Promise<http.Server> {
  await buildBundle();
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    try {
      if (pathname === '/__relay/scenario' && req.method === 'POST') {
        const scenario = await bodyJson(req) as unknown as Scenario;
        if (!scenario.device?.id || !Array.isArray(scenario.rows)) return sendJson(res, 400, { error: 'invalid_fixture' });
        scenarios.set(scenario.device.id, { holdAck: [], ...scenario });
        record({ kind: 'scenario', deviceId: scenario.device.id });
        return sendJson(res, 201, { ok: true });
      }
      if (pathname === '/__relay/requests' && req.method === 'GET') {
        const query = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
        const deviceId = query.get('deviceId');
        const caseId = query.get('caseId');
        return sendJson(res, 200, entries.filter((entry) => (!deviceId || entry.deviceId === deviceId) && (!caseId || entry.caseId === caseId)));
      }
      if (pathname === '/__relay/release' && req.method === 'POST') {
        const body = await bodyJson(req);
        const release = pendingAcks.get(body.requestId);
        if (release) {
          pendingAcks.delete(body.requestId);
          release();
        }
        return sendJson(res, 200, { released: Boolean(release) });
      }
      if (pathname === '/__relay/emit' && req.method === 'POST') {
        const body = await bodyJson(req);
        const stream = currentStream(body.deviceId);
        if (!stream) return sendJson(res, 404, { error: 'viewer_not_connected' });
        frame(stream, body.logical);
        return sendJson(res, 200, { ok: true });
      }
      if (pathname === '/__relay/rotate' && req.method === 'POST') {
        const body = await bodyJson(req);
        const stream = currentStream(body.deviceId);
        if (!stream) return sendJson(res, 404, { error: 'viewer_not_connected' });
        endStream(stream, 'rotation');
        record({ kind: 'planned-rotation', deviceId: body.deviceId, caseId: stream.caseId, viewerStreamId: stream.viewerStreamId });
        return sendJson(res, 200, { ok: true });
      }
      if (pathname === '/api/plugin/devices' && req.method === 'GET') {
        return sendJson(res, 200, { devices: [...scenarios.values()].map(({ device }) => device) });
      }
      if (pathname === '/api/plugin/chat/v2/viewer/stream' && req.method === 'POST') {
        const body = await bodyJson(req);
        const scenario = scenarios.get(body.deviceId);
        if (!scenario || body.protocol !== 2) return sendJson(res, 404, { error: 'device_not_found' });
        const stream: Stream = {
          response: res,
          deviceId: body.deviceId,
          viewerStreamId: randomUUID(),
          viewerToken: `synthetic-viewer-${randomUUID()}`,
          connectionId: randomUUID(),
          caseId: String(req.headers['x-test-case'] ?? ''),
          expiresAt: Date.now() + 45_000,
          lastServerTime: 0,
          cleaned: false,
        };
        const list = streams.get(body.deviceId) ?? [];
        list.push(stream);
        streams.set(body.deviceId, list);
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        const now = Date.now();
        const stamp = serverTime(stream, now);
        event(res, 'ready', {
          protocol: 2,
          streamId: stream.viewerStreamId,
          viewerToken: stream.viewerToken,
          ownerUserId: 'synthetic-owner-A',
          deviceId: body.deviceId,
          serverTime: new Date(stamp).toISOString(),
          authorizedUntil: new Date(Math.min(now + 5_000, stream.expiresAt)).toISOString(),
          expiresAt: new Date(stream.expiresAt).toISOString(),
        });
        record({
          kind: 'viewer-ready',
          deviceId: body.deviceId,
          caseId: stream.caseId,
          clientId: body.clientId,
          viewerStreamId: stream.viewerStreamId,
          serverTime: new Date(stamp).toISOString(),
          authorizedUntil: new Date(Math.min(now + 5_000, stream.expiresAt)).toISOString(),
          expiresAt: new Date(stream.expiresAt).toISOString(),
        });
        startStreamTimers(stream, scenario);
        req.on('aborted', () => endStream(stream));
        res.on('close', () => endStream(stream));
        return;
      }
      if (pathname === '/api/plugin/chat/v2/viewer/requests' && req.method === 'POST') {
        const body = await bodyJson(req);
        return await handleViewerRequest(req, res, body);
      }
      if (pathname.startsWith('/api/plugin/chat/')) {
        record({ kind: 'forbidden-legacy', path: pathname, method: req.method, caseId: String(req.headers['x-test-case'] ?? '') });
        return sendJson(res, 410, { error: 'upgrade_required', protocol: 2 });
      }
      if (pathname.startsWith('/api/')) {
        record({ kind: 'unexpected-api', path: pathname, method: req.method, caseId: String(req.headers['x-test-case'] ?? '') });
        return sendJson(res, 404, { error: 'not_found' });
      }
      serveStatic(req, res);
    } catch (error) {
      record({ kind: 'fixture-error', path: pathname, error: error instanceof Error ? error.message : 'unknown' });
      if (!res.headersSent) sendJson(res, 500, { error: 'fixture_error' });
      else res.end();
    }
  });
  server.on('close', () => {
    for (const stream of [...activeStreams]) endStream(stream);
  });
  const closeServer = server.close.bind(server);
  (server as unknown as { close: (callback?: (error?: Error) => void) => http.Server }).close = (callback) => {
    for (const stream of [...activeStreams]) endStream(stream);
    return closeServer(callback);
  };
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  startLiveRelayFixture().then(() => console.log(`synthetic live relay fixture on 127.0.0.1:${process.env.CHAT_RELAY_PORT ?? 3441}`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
