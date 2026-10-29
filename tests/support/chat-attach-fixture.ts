/**
 * Simulated-device fixture for the chat browser harness. Answers every /api/plugin request the chat
 * page makes, records each request with its routing IDs, and lets a test script the device side
 * (catalog pages, history, receive frames, command ACKs, delays and failures).
 *
 * Simulated device; frontend contract only. This is not a live assistant, a real native integration
 * or auth enforcement. No secrets, no database, no real service.
 */
import { randomUUID } from 'node:crypto';
import { expect, type Page, type Route, type Request as PwRequest, type TestInfo } from '@playwright/test';
import { primeViolation, staleEventViolation, type WireEvent } from './chat-attach-prime';

export const SIMULATED_LABEL = 'simulated device; frontend contract only';

export type ChatPresence = 'online' | 'offline' | 'never_connected';
export type NativeState = 'running' | 'waiting' | 'idle' | 'unknown';
export type Capabilities = { watch: boolean; reply: boolean; answer: boolean; stop: boolean };

export interface FixtureDevice {
  id: string;
  device_name: string;
  status: ChatPresence;
  last_seen_at: string | null;
  platform: string;
  model: string;
}

export interface NativeMeta {
  sessionId: string;
  /** Absent when the integration did not supply a surface. */
  surface?: string;
  state: NativeState;
  protocol?: number;
  capabilities?: Capabilities;
  /** Optional live timing fields (epoch ms). */
  startedAt?: number;
  lastChunkAt?: number;
  loopId?: string;
}

export interface FixtureSession {
  id: string;
  user_id: string;
  api_key_id: string;
  device_name: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  native?: NativeMeta;
  /** Optional listing fields (AC17–AC19). Deliberately not produced by real producers. */
  lastActivity?: number | string;
  snippet?: string;
  domain?: string;
}

/** Optional listing fields for a row, set explicitly by a test (AC17–AC19). */
export interface RowExtras {
  createdAt?: string;
  updatedAt?: string;
  /** Epoch ms; a string is passed through as-is to test invalid-value handling. */
  lastActivity?: number | string;
  snippet?: string;
  domain?: string;
}

export interface LegacyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: { text: string };
  seq: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  /** Routing IDs pulled from the request, when present. */
  relayId?: string;
  frameType?: string;
  watchId?: string;
  commandId?: string;
  at: number;
  /** Routing order (not wall clock): assigned when the request is routed. */
  seq: number;
  /** Routing order when the fake device answered; absent while still in flight. */
  completedSeq?: number;
  /** The page that made the request (one per `install` call). */
  pageId: string;
}

export interface NativeIdentity {
  watchId: string;
  nativeSessionId: string;
}

/** A one-shot barrier: a request named `name` parks until `release()`. */
export class Gate {
  readonly arrived: Promise<void>;
  private signalArrived!: () => void;
  private readonly released: Promise<void>;
  private openGate!: () => void;

  constructor() {
    this.arrived = new Promise<void>((r) => (this.signalArrived = r));
    this.released = new Promise<void>((r) => (this.openGate = r));
    this.done = new Promise<void>((r) => (this.signalDone = r));
  }

  /** @internal */
  arrive(): Promise<void> {
    this.signalArrived();
    return this.released;
  }

  release(): void {
    this.openGate();
  }

  /** Resolves once the parked request has been answered (after `release()`). */
  readonly done: Promise<void>;
  private signalDone!: () => void;

  /** @internal */
  complete(): void {
    this.signalDone();
  }
}

const BASE_TIME = Date.parse('2026-10-29T09:00:00Z');
let counter = 0;
const iso = (minutesAgo: number) => new Date(BASE_TIME - minutesAgo * 60_000).toISOString();

/** Native session ids are visibly different from relay UUIDs. */
export function nativeId(label: string): string {
  return `native-${label}-${++counter}`;
}

export const ALL_CAPS: Capabilities = { watch: true, reply: true, answer: true, stop: true };

export function identity(w: NativeIdentity): NativeIdentity & { protocol: 1 } {
  return { protocol: 1, watchId: w.watchId, nativeSessionId: w.nativeSessionId };
}

export function snapshotFrame(
  w: NativeIdentity,
  p: {
    through: number;
    stateVersion: string;
    state: NativeState;
    loopId?: string | null;
    messages?: NativeMessage[];
    pending?: PendingRequest | null;
    historyComplete?: boolean;
  },
) {
  return {
    type: 'SESSION_SNAPSHOT',
    ...identity(w),
    through: p.through,
    stateVersion: p.stateVersion,
    state: p.state,
    loopId: p.loopId ?? null,
    messages: p.messages ?? [],
    pending: p.pending ?? null,
    historyComplete: p.historyComplete ?? true,
  };
}

export function eventFrame(
  w: NativeIdentity,
  eventSeq: number,
  change:
    | { kind: 'message'; message: NativeMessage }
    | { kind: 'state'; stateVersion: string; state: NativeState; loopId: string | null; pending: PendingRequest | null },
) {
  return { type: 'SESSION_EVENT', ...identity(w), eventSeq, change };
}

/**
 * An event the test declares as new feedback after a snapshot with watermark `through`. Throws when the
 * declared eventSeq is at or below the watermark, so a fresh-event scenario cannot silently replay old values.
 * Intentional replays, duplicates, gaps and wrong-watch frames keep using `eventFrame`.
 */
export function freshEventFrame(
  w: NativeIdentity,
  through: number,
  eventSeq: number,
  change: Parameters<typeof eventFrame>[2],
) {
  const violation = staleEventViolation(through, eventSeq);
  if (violation) throw new Error(`freshEventFrame: ${violation}`);
  return eventFrame(w, eventSeq, change);
}

export function commandResultFrame(w: NativeIdentity, commandId: string, outcome: 'applied' | 'rejected', reason?: string) {
  return { type: 'SESSION_COMMAND_RESULT', ...identity(w), commandId, outcome, ...(reason ? { reason } : {}) };
}

export function errorFrame(w: NativeIdentity, reason: string, message?: string) {
  return { type: 'SESSION_ERROR', ...identity(w), reason, ...(message ? { message } : {}) };
}

export interface NativeMessage {
  id: string;
  position: number;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
}

export interface PendingRequest {
  requestId: string;
  kind: 'question' | 'approval';
  prompt: string;
}

export interface CatalogOptions {
  pageSize: number;
  /** complete=false marks an incomplete catalog. */
  complete: boolean;
}

export interface SendPolicy {
  status?: number;
  body?: Record<string, unknown>;
  abort?: boolean;
}

interface ReceiveFrame {
  seq: number;
  frame: Record<string, unknown>;
}

/**
 * One test's simulated device and fake API. Create once per test, call `install(page)` before `goto`.
 */
export class ChatHarness {
  readonly devices: FixtureDevice[] = [];
  readonly sessions: FixtureSession[] = [];
  readonly requests: RecordedRequest[] = [];
  readonly unexpected: string[] = [];
  readonly external: string[] = [];
  catalog: CatalogOptions | null = null;

  private readonly legacyMessages = new Map<string, LegacyMessage[]>();
  private readonly queues = new Map<string, ReceiveFrame[]>();
  private readonly seqs = new Map<string, number>();
  private readonly gates = new Map<string, Gate[]>();
  private readonly attachHooks = new Map<string, (w: NativeIdentity) => void>();
  private pageCounter = 0;
  private order = 0;
  private readonly sendPolicies = new Map<string, SendPolicy[]>();
  private readonly receivePolicies: number[] = [];
  private readonly userId = `user-${randomUUID()}`;

  constructor(readonly testInfo?: TestInfo) {}

  /** Register routes. Must run before the first navigation. */
  async install(page: Page): Promise<void> {
    const pageId = `page-${++this.pageCounter}`;
    await page.route(
      (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
      (route) => {
        this.external.push(route.request().url());
        return route.abort('blockedbyclient');
      },
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/plugin/'),
      (route) => this.handle(route, pageId),
    );
  }

  addDevice(opts: { name?: string; status?: ChatPresence; platform?: string; model?: string } = {}): FixtureDevice {
    const device: FixtureDevice = {
      id: randomUUID(),
      device_name: opts.name ?? `Simulated laptop ${this.devices.length + 1}`,
      status: opts.status ?? 'online',
      last_seen_at: opts.status === 'never_connected' ? null : iso(opts.status === 'offline' ? 25 : 0),
      platform: opts.platform ?? 'darwin',
      model: opts.model ?? 'claude-sonnet-4-6',
    };
    this.devices.push(device);
    return device;
  }

  addLegacySession(
    device: FixtureDevice,
    opts: {
      title?: string | null;
      messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
      updatedMinutesAgo?: number;
      row?: RowExtras;
    } = {},
  ): FixtureSession {
    const session = this.makeSession(device, {
      title: opts.title === undefined ? 'Seeded chat' : opts.title,
      updatedMinutesAgo: opts.updatedMinutesAgo ?? 0,
    });
    this.applyRow(session, opts.row);
    this.legacyMessages.set(
      session.id,
      (opts.messages ?? []).map((m, i) => ({ id: `${session.id}-m${i}`, role: m.role, content: { text: m.text }, seq: i + 1 })),
    );
    return session;
  }

  addNativeSession(
    device: FixtureDevice,
    opts: {
      title?: string | null;
      native: Omit<Partial<NativeMeta>, 'surface'> & { state: NativeState; surface?: string | null; sessionId?: string };
      updatedMinutesAgo?: number;
      sessionId?: string;
      row?: RowExtras;
    },
  ): FixtureSession {
    const session = this.makeSession(device, {
      title: opts.title === undefined ? 'Native chat' : opts.title,
      updatedMinutesAgo: opts.updatedMinutesAgo ?? 0,
    });
    this.applyRow(session, opts.row);
    session.native = {
      sessionId: opts.native.sessionId ?? opts.sessionId ?? nativeId(opts.native.state),
      ...(opts.native.surface === null ? {} : { surface: opts.native.surface ?? 'Simulated surface' }),
      state: opts.native.state,
      ...(opts.native.protocol ? { protocol: opts.native.protocol } : {}),
      ...(opts.native.capabilities ? { capabilities: opts.native.capabilities } : {}),
      ...(opts.native.startedAt !== undefined ? { startedAt: opts.native.startedAt } : {}),
      ...(opts.native.lastChunkAt !== undefined ? { lastChunkAt: opts.native.lastChunkAt } : {}),
      ...(opts.native.loopId !== undefined ? { loopId: opts.native.loopId } : {}),
    } as NativeMeta;
    return session;
  }

  private applyRow(session: FixtureSession, row: RowExtras | undefined): void {
    if (!row) return;
    if (row.createdAt !== undefined) session.created_at = row.createdAt;
    if (row.updatedAt !== undefined) session.updated_at = row.updatedAt;
    if (row.lastActivity !== undefined) session.lastActivity = row.lastActivity;
    if (row.snippet !== undefined) session.snippet = row.snippet;
    if (row.domain !== undefined) session.domain = row.domain;
  }

  private makeSession(
    device: FixtureDevice,
    opts: { title: string | null; updatedMinutesAgo: number },
  ): FixtureSession {
    const updated = iso(opts.updatedMinutesAgo);
    const session: FixtureSession = {
      id: randomUUID(),
      user_id: this.userId,
      api_key_id: device.id,
      device_name: device.device_name,
      title: opts.title,
      created_at: updated,
      updated_at: updated,
    };
    this.sessions.push(session);
    return session;
  }

  /** Make the sessions list paged with an optional catalog object. */
  setCatalog(opts: CatalogOptions | null): void {
    this.catalog = opts;
  }

  /** Park the next request matching `name` until `release()`. Returns the gate to await/release. */
  /**
   * Runs synchronously when the page's SESSION_ATTACH for this relay session reaches the device, before any
   * receive poll. A frame emitted here is only visible if the page primed its cursor before it.
   */
  onAttach(relayId: string, fn: (w: NativeIdentity) => void): void {
    this.attachHooks.set(relayId, fn);
  }

  hold(name: string): Gate {
    const gate = new Gate();
    const list = this.gates.get(name) ?? [];
    list.push(gate);
    this.gates.set(name, list);
    return gate;
  }

  /** Fail the next send of this frame type with the given status (or abort). */
  failNextSend(frameType: string, policy: SendPolicy = { status: 500 }): void {
    const list = this.sendPolicies.get(frameType) ?? [];
    list.push(policy);
    this.sendPolicies.set(frameType, list);
  }

  /** Fail the next receive with this status. */
  failNextReceive(status = 500): void {
    this.receivePolicies.push(status);
  }

  /** Device → page: queue a frame for the relay session `relayId`. */
  emit(relayId: string, frame: Record<string, unknown>): number {
    const seq = (this.seqs.get(relayId) ?? 0) + 1;
    this.seqs.set(relayId, seq);
    const list = this.queues.get(relayId) ?? [];
    list.push({ seq, frame });
    this.queues.set(relayId, list);
    return seq;
  }

  /** Recorded page → device frames of one type (optionally for one relay session). */
  sent(frameType?: string, relayId?: string): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/plugin/chat/send' && (!frameType || r.frameType === frameType) && (!relayId || r.relayId === relayId),
    );
  }

  /** Every attach the page made for a relay session, oldest first. */
  /** Prime and attach events in routing order, for the pure ordering rule in `chat-attach-prime.ts`. */
  wireEvents(): WireEvent[] {
    const events: WireEvent[] = [];
    for (const r of this.requests) {
      if (r.relayId === undefined) continue;
      if (r.method === 'GET' && r.path === '/api/plugin/chat/receive' && r.query.after === 'latest') {
        events.push({ seq: r.seq, completedSeq: r.completedSeq, pageId: r.pageId, relayId: r.relayId, kind: 'prime' });
      } else if (r.frameType === 'SESSION_ATTACH') {
        events.push({ seq: r.seq, completedSeq: r.completedSeq, pageId: r.pageId, relayId: r.relayId, kind: 'attach', watchId: r.watchId });
      }
    }
    return events;
  }

  attaches(relayId: string): NativeIdentity[] {
    return this.sent('SESSION_ATTACH', relayId).map((r) => {
      const frame = (r.body as { frame: { watchId: string; nativeSessionId: string } }).frame;
      return { watchId: frame.watchId, nativeSessionId: frame.nativeSessionId };
    });
  }

  legacyCreates(): RecordedRequest[] {
    return this.requests.filter((r) => r.method === 'POST' && r.path === '/api/plugin/chat/sessions');
  }

  private async handle(route: Route, pageId: string): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = this.parseBody(req);
    const relayId = this.relayFor(url, body);
    const frameType = (body as { frame?: { type?: string } } | null)?.frame?.type;
    const record: RecordedRequest = {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      relayId,
      frameType,
      watchId: (body as { frame?: { watchId?: string } } | null)?.frame?.watchId,
      commandId: (body as { frame?: { commandId?: string } } | null)?.frame?.commandId,
      at: Date.now(),
      seq: ++this.order,
      pageId,
    };
    this.requests.push(record);

    const name = this.gateName(url, method, frameType, relayId);
    const gate = this.takeGate(name);
    if (gate) await gate.arrive();
    try {
      await this.serve(route, url, method, body, frameType, relayId);
      record.completedSeq = ++this.order;
    } finally {
      gate?.complete();
    }
  }

  private async serve(
    route: Route,
    url: URL,
    method: string,
    body: unknown,
    frameType: string | undefined,
    relayId: string | undefined,
  ): Promise<void> {
    if (url.pathname === '/api/plugin/devices' && method === 'GET') {
      return this.json(route, { devices: this.devices });
    }
    if (url.pathname === '/api/plugin/chat/sessions' && method === 'GET') {
      return this.json(route, this.listPage(url.searchParams.get('cursor')));
    }
    if (url.pathname === '/api/plugin/chat/sessions' && method === 'POST') {
      const apiKeyId = (body as { api_key_id?: string } | null)?.api_key_id;
      const device = this.devices.find((d) => d.id === apiKeyId);
      if (!device) return this.json(route, { error: 'not_found' }, 404);
      const session = this.makeSession(device, { title: null, updatedMinutesAgo: 0 });
      this.legacyMessages.set(session.id, []);
      return this.json(route, { session }, 201);
    }
    const messages = url.pathname.match(/^\/api\/plugin\/chat\/sessions\/([^/]+)\/messages$/);
    if (messages && method === 'GET') {
      const id = messages[1];
      if (!this.legacyMessages.has(id)) return this.json(route, { error: 'not_found' }, 404);
      return this.json(route, { messages: this.legacyMessages.get(id) });
    }
    if (url.pathname === '/api/plugin/chat/send' && method === 'POST') {
      if (frameType === 'SESSION_ATTACH' && relayId) {
        const frame = (body as { frame: NativeIdentity }).frame;
        this.attachHooks.get(relayId)?.({ watchId: frame.watchId, nativeSessionId: frame.nativeSessionId });
      }
      const policy = this.takeSendPolicy(frameType ?? '');
      if (policy?.abort) return route.abort('failed');
      if (policy?.status && policy.status !== 200) return this.json(route, { error: 'simulated' }, policy.status);
      const session = this.sessions.find((s) => s.id === relayId);
      const device = this.devices.find((d) => d.id === session?.api_key_id);
      return this.json(route, policy?.body ?? { ok: true, deviceOnline: device?.status === 'online' });
    }
    if (url.pathname === '/api/plugin/chat/receive' && method === 'GET') {
      const status = this.receivePolicies.shift();
      if (status) return this.json(route, { error: 'simulated' }, status);
      return this.json(route, this.receive(relayId ?? '', url.searchParams.get('after') ?? 'latest'));
    }
    const mutate = url.pathname.match(/^\/api\/plugin\/chat\/sessions\/([^/]+)/);
    if (mutate && method !== 'GET') {
      const id = mutate[1];
      const session = this.sessions.find((s) => s.id === id);
      if (!session) return this.json(route, { error: 'not_found' }, 404);
      if (method === 'DELETE') {
        this.sessions.splice(this.sessions.indexOf(session), 1);
        return this.json(route, { ok: true });
      }
      const title = (body as { title?: string } | null)?.title;
      if (typeof title === 'string') session.title = title;
      return this.json(route, { ok: true, session });
    }

    this.unexpected.push(`${method} ${url.pathname}`);
    return route.abort('failed');
  }

  private listPage(cursor: string | null): Record<string, unknown> {
    // Insertion order, not activity order: the page must sort by its own rules (AC17).
    const rows = [...this.sessions].reverse();
    if (!this.catalog) return { sessions: rows };
    const start = cursor ? Number(cursor.replace(/^i:/, '')) : 0;
    const end = start + this.catalog.pageSize;
    const hasMore = end < rows.length;
    return {
      sessions: rows.slice(start, end),
      catalog: {
        version: 1,
        complete: hasMore ? false : this.catalog.complete,
        nextCursor: hasMore ? `i:${end}` : null,
      },
    };
  }

  /**
   * `after=latest` primes the cursor: no frames, cursor = highest seq that already exists.
   * A numeric `after` returns only frames strictly greater than it.
   */
  private receive(relayId: string, after: string): Record<string, unknown> {
    const all = this.queues.get(relayId) ?? [];
    const cursor = this.seqs.get(relayId) ?? 0;
    if (after === 'latest') return { frames: [], cursor };
    const n = Number(after);
    return { frames: all.filter((f) => f.seq > n), cursor };
  }

  private relayFor(url: URL, body: unknown): string | undefined {
    const fromQuery = url.searchParams.get('session_id') ?? undefined;
    const fromBody = (body as { session_id?: string } | null)?.session_id;
    return fromQuery ?? fromBody;
  }

  private parseBody(req: PwRequest): unknown {
    const raw = req.postData();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private gateName(url: URL, method: string, frameType: string | undefined, relayId: string | undefined): string {
    if (url.pathname === '/api/plugin/chat/send') return `send:${frameType ?? 'unknown'}`;
    if (url.pathname === '/api/plugin/chat/receive') return `receive:${relayId ?? ''}`;
    if (url.pathname === '/api/plugin/chat/sessions' && method === 'GET') return url.searchParams.get('cursor') ? 'list:more' : 'list';
    if (url.pathname === '/api/plugin/chat/sessions' && method === 'POST') return 'create';
    if (url.pathname.endsWith('/messages')) return `history:${url.pathname.split('/')[5]}`;
    return `${method}:${url.pathname}`;
  }

  private takeGate(name: string): Gate | undefined {
    const list = this.gates.get(name);
    const gate = list?.shift();
    if (list && list.length === 0) this.gates.delete(name);
    return gate;
  }

  private takeSendPolicy(frameType: string): SendPolicy | undefined {
    const list = this.sendPolicies.get(frameType);
    const policy = list?.shift();
    if (list && list.length === 0) this.sendPolicies.delete(frameType);
    return policy;
  }

  private json(route: Route, body: unknown, status = 200): Promise<void> {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  /** Name of the simulated device label used on screenshots and in reports. */
  annotate(): void {
    this.testInfo?.annotations.push({ type: 'simulated', description: SIMULATED_LABEL });
  }
}

/** Open the chat page exactly as the URL contract defines: `?device=<key id>&session=<relay UUID>`. */
export async function openChat(page: Page, device: FixtureDevice, session?: FixtureSession): Promise<void> {
  const query = `device=${encodeURIComponent(device.id)}${session ? `&session=${encodeURIComponent(session.id)}` : ''}`;
  await page.goto(`/chat?${query}`);
}

/**
 * The newest attach the page sent for a relay session, after checking that this attach has its own completed
 * pre-attach prime (see `primed`).
 */
export async function latestWatch(harness: ChatHarness, relayId: string): Promise<NativeIdentity> {
  await expect.poll(() => harness.attaches(relayId).length, { timeout: 15_000, message: 'page did not send SESSION_ATTACH' }).toBeGreaterThan(0);
  await primed(harness, relayId);
  return harness.attaches(relayId).at(-1)!;
}

/**
 * Legacy relay sessions have no attach: wait until the page has completed a receive poll for this relay session,
 * so frames emitted afterwards are read from a cursor the page already holds.
 */
export async function polled(harness: ChatHarness, relayId: string): Promise<void> {
  await expect
    .poll(() => harness.requests.some((r) => r.path === '/api/plugin/chat/receive' && r.relayId === relayId && r.completedSeq !== undefined), {
      timeout: 15_000,
      message: 'page never completed a /receive poll for this relay session',
    })
    .toBe(true);
}

/**
 * Asserts that the newest SESSION_ATTACH for this relay session has its own prime: a `/receive?after=latest`
 * from the same page that completed after the page's previous attach and before this attach was sent.
 * Ordering is by routing sequence, so a late prime, an unfinished prime, another page's prime or an earlier
 * attempt's prime all fail immediately. Call again after every new attach (retry, reload, new page).
 */
export async function primed(harness: ChatHarness, relayId: string): Promise<void> {
  const events = harness.wireEvents();
  const attach = events.filter((e) => e.kind === 'attach' && e.relayId === relayId).at(-1);
  expect(attach, 'page did not send SESSION_ATTACH').toBeDefined();
  expect(primeViolation(events, attach!), `pre-attach prime rule for watch ${attach!.watchId}`).toBeNull();
}

/** Wait until the page has sent `count` SESSION_COMMAND frames for a relay session. */
export async function commandsFor(harness: ChatHarness, relayId: string): Promise<RecordedRequest[]> {
  return harness.sent('SESSION_COMMAND', relayId);
}

/**
 * In-app device switch through the device picker: a native select labelled "Assistant" whose options are named
 * by device name. Opens the drawer first on narrow viewports.
 */
export async function switchDevice(page: Page, device: FixtureDevice): Promise<void> {
  await openChatNav(page);
  await page.getByRole('combobox', { name: 'Assistant' }).selectOption({ label: device.device_name });
}

/** Narrow viewports keep the chat list in a drawer: open it when its list is not on screen. */
export async function openChatNav(page: Page): Promise<void> {
  const nav = chatNavOf(page);
  if (await nav.isVisible()) return;
  await page.getByRole('button', { name: 'Chats', exact: true }).click();
  await expect(nav).toBeVisible();
}

/** The native or legacy composer, labelled as the legacy page labels it. */
export const composerOf = (page: Page) => page.getByRole('textbox', { name: 'Message' });
export const sendOf = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });
export const stopOf = (page: Page) => page.getByRole('button', { name: 'Stop', exact: true });
export const conversationOf = (page: Page) => page.getByRole('log', { name: 'Conversation' });
/** The chat list: the desktop navigation, or the narrow-viewport drawer dialog named Chats. */
export const chatNavOf = (page: Page) =>
  page.getByRole('navigation', { name: 'Chats' }).or(page.getByRole('dialog', { name: 'Chats' }));
export const headingOf = (page: Page) => page.getByRole('heading', { level: 1 });

/** Frames in the transcript: one article per message, labelled by role. */
export function messageArticles(page: Page, role: 'You' | 'Assistant', text: string) {
  return conversationOf(page).getByRole('article', { name: role }).filter({ hasText: text });
}

/** The assistant-side text as one string per message article, in transcript order. */
export async function transcriptText(page: Page): Promise<string[]> {
  return conversationOf(page).getByRole('article').allInnerTexts();
}

/** Every harness has a clean slate: nothing reached a real service. */
export function assertNoLeaks(harness: ChatHarness): void {
  expect(harness.external, 'request left the loopback harness').toEqual([]);
  expect(harness.unexpected, 'unexpected /api/plugin request').toEqual([]);
}

export function msg(id: string, position: number, role: 'user' | 'assistant', text: string, streaming = false): NativeMessage {
  return { id, position, role, text, streaming };
}

/** A native row on a device. Defaults: protocol 1, all capabilities, surface "Terminal". */
export function nativeRow(
  harness: ChatHarness,
  device: FixtureDevice,
  opts: {
    title?: string | null;
    row?: RowExtras;
    timing?: { startedAt?: number; lastChunkAt?: number; loopId?: string };
    state: NativeState;
    surface?: string | null;
    updatedMinutesAgo?: number;
    caps?: Capabilities | undefined;
    /** null omits the field; any other number is sent as-is. */
    protocol?: number | null;
    nativeSessionId?: string;
  },
): FixtureSession {
  return harness.addNativeSession(device, {
    title: opts.title,
    updatedMinutesAgo: opts.updatedMinutesAgo,
    row: opts.row,
    native: {
      ...opts.timing,
      state: opts.state,
      surface: opts.surface === undefined ? 'Terminal' : opts.surface,
      protocol: opts.protocol === undefined ? 1 : (opts.protocol ?? undefined),
      capabilities: opts.caps === undefined ? ALL_CAPS : opts.caps,
      sessionId: opts.nativeSessionId,
    },
  });
}
