import { z } from 'zod';
import { EventDecoder, FrameAssembler } from './live-relay-codec';
import { frameEnvelope, heartbeat, ready, type LogicalFrame, type Operation } from './live-relay-contract';

type Pending = { op: Operation; resolve: (value: LogicalFrame) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; listener?: (frame: LogicalFrame) => void };
type Watch = { sessionId: string; watchId: string; listener: (frame: LogicalFrame) => void };
type Ready = z.infer<typeof ready>;
const deadlines: Record<Operation['kind'], number> = { hello: 5000, 'catalog.list': 15000, 'session.create': 10000, 'history.read': 15000, 'watch.attach': 15000, 'watch.renew': 5000, 'watch.detach': 5000, command: 10000, 'request.cancel': 5000 };

/** A single viewer stream; all payloads and capabilities live only in this instance. */
export class LiveRelayClient {
  private readonly abort = new AbortController();
  private readonly decoder = new EventDecoder();
  private readonly assembler = new FrameAssembler(() => this.close('unavailable'));
  private readonly pending = new Map<string, Pending>();
  private readonly watches = new Map<string, Watch>();
  private stream?: Ready;
  private connectionId?: string;
  private createAllowed = false;
  private closed = false;
  private lower = 0;
  private upper = 0;
  private clockAt = 0;
  private leaseUntil = 0;
  private leaseTimer?: ReturnType<typeof setTimeout>;
  private rotationTimer?: ReturnType<typeof setTimeout>;
  private started = 0;
  private onReady?: () => void;
  private onStartError?: (error: Error) => void;
  constructor(readonly deviceId: string, readonly clientId: string, private readonly onClose: (reason: 'rotation' | 'unavailable') => void) {}

  private bounds() {
    const elapsed = performance.now() - this.clockAt;
    return { lower: this.lower + elapsed, upper: this.upper + elapsed };
  }
  private valid(): boolean {
    return !this.closed && !!this.stream && this.bounds().upper < Math.min(this.leaseUntil, Date.parse(this.stream.expiresAt));
  }
  authorized(): boolean { return this.valid() && !!this.connectionId; }
  canCreate(): boolean { return this.authorized() && this.createAllowed; }
  upperNow(): number { return this.bounds().upper; }
  expiresAt(): number { return this.stream ? Date.parse(this.stream.expiresAt) : 0; }

  private updateLease(serverTime: string, authorizedUntil: string, initial: boolean): void {
    const now = performance.now();
    const server = Date.parse(serverTime);
    const until = Date.parse(authorizedUntil);
    if (!this.stream || until > server + 5000 || until > Date.parse(this.stream.expiresAt)) throw new Error('invalid_lease');
    if (initial) {
      const rtt = now - this.started;
      if (rtt < 0 || rtt > 1000) throw new Error('clock_unavailable');
      this.lower = server; this.upper = server + rtt; this.clockAt = now;
    } else {
      const current = this.bounds();
      if (server > current.upper + 1000 || server < current.lower - 1000) throw new Error('clock_unavailable');
      this.lower = Math.max(current.lower, server);
      this.upper = Math.max(current.upper, server);
      this.clockAt = now;
      if (this.upper - this.lower > 1000) throw new Error('clock_unavailable');
    }
    if (until <= this.upper) throw new Error('expired_lease');
    this.leaseUntil = until;
    clearTimeout(this.leaseTimer);
    this.leaseTimer = setTimeout(() => this.close('unavailable'), Math.max(0, until - this.upper));
  }

  async start(): Promise<void> {
    if (this.started || this.closed) throw new Error('already_started');
    this.started = performance.now();
    const readyPromise = new Promise<void>((resolve, reject) => { this.onReady = resolve; this.onStartError = reject; });
    const timer = setTimeout(() => this.close('unavailable'), 5000);
    void this.readStream();
    try { await readyPromise; }
    finally { clearTimeout(timer); }
    const hello = await this.request({ kind: 'hello' });
    if (hello.type !== 'DEVICE_READY') throw new Error('unavailable');
    this.connectionId = hello.connectionId;
    this.createAllowed = hello.capabilities.create;
  }

  private async readStream(): Promise<void> {
    try {
      const response = await fetch('/api/plugin/chat/v2/viewer/stream', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: this.abort.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ protocol: 2, deviceId: this.deviceId, clientId: this.clientId }),
      });
      if (!response.ok || !response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) throw new Error('unavailable');
      const reader = response.body.getReader();
      try {
        while (!this.closed) {
          const chunk = await reader.read();
          if (chunk.done) { this.decoder.finish(); break; }
          for (const event of this.decoder.push(chunk.value)) await this.event(event.event, event.data);
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!this.closed) this.close('unavailable');
    } catch { if (!this.closed) this.close('unavailable'); }
  }

  private async event(name: string, data: unknown): Promise<void> {
    if (!this.stream) {
      if (name !== 'ready') throw new Error('ready_required');
      const value = ready.parse(data);
      if (value.deviceId !== this.deviceId) throw new Error('wrong_device');
      this.stream = value;
      this.updateLease(value.serverTime, value.authorizedUntil, true);
      const rotateIn = Math.max(0, Date.parse(value.expiresAt) - this.upperNow() - 5000);
      this.rotationTimer = setTimeout(() => this.close('rotation'), rotateIn);
      this.onReady?.(); this.onReady = undefined; this.onStartError = undefined;
      return;
    }
    if (!this.valid()) throw new Error('expired_lease');
    if (name === 'heartbeat') {
      const value = heartbeat.parse(data);
      this.updateLease(value.serverTime, value.authorizedUntil, false);
      return;
    }
    if (name === 'closing') {
      const value = z.object({ protocol: z.literal(2), reason: z.enum(['rotation', 'revoked', 'expired', 'broker_unavailable', 'overflow']) }).strict().parse(data);
      this.close(value.reason === 'rotation' ? 'rotation' : 'unavailable');
      return;
    }
    if (name !== 'frame') throw new Error('invalid_event');
    const envelope = frameEnvelope.parse(data);
    if (envelope.deviceId !== this.deviceId || envelope.viewerStreamId !== this.stream.streamId) return;
    const pending = this.pending.get(envelope.part.requestId);
    const watch = this.watches.get(envelope.part.requestId);
    if (!pending && !watch) return;
    if (this.connectionId && envelope.connectionId !== this.connectionId) return;
    const logical = await this.assembler.add(envelope.part);
    if (!logical || !this.valid()) return;
    if (!this.connectionId && (pending?.op.kind !== 'hello' || (logical.type !== 'REQUEST_ERROR' && (logical.type !== 'DEVICE_READY' || logical.connectionId !== envelope.connectionId)))) return;
    if (logical.type === 'WATCH_EVENT') {
      if (watch && logical.sessionId === watch.sessionId && logical.watchId === watch.watchId) watch.listener(logical);
      else if (pending?.op.kind === 'watch.attach' && logical.sessionId === pending.op.sessionId && logical.watchId === pending.op.watchId) pending.listener?.(logical);
      return;
    }
    if (!pending || !this.matches(pending.op, logical)) return;
    if (pending.op.kind === 'watch.attach' && logical.type === 'WATCH_SNAPSHOT' && pending.listener) {
      this.watches.set(logical.requestId, { sessionId: logical.sessionId, watchId: logical.watchId, listener: pending.listener });
    }
    pending.listener?.(logical);
    clearTimeout(pending.timer);
    this.pending.delete(logical.requestId);
    if (logical.type === 'REQUEST_ERROR') pending.reject(new Error(logical.reason));
    else pending.resolve(logical);
  }

  private matches(op: Operation, frame: LogicalFrame): boolean {
    if (frame.type === 'REQUEST_ERROR') return (!('sessionId' in op) || !frame.sessionId || frame.sessionId === op.sessionId) && (!('watchId' in op) || !frame.watchId || frame.watchId === op.watchId);
    if (op.kind === 'hello') return frame.type === 'DEVICE_READY';
    if (op.kind === 'catalog.list') return frame.type === 'CATALOG_RESULT' && frame.scope === op.scope;
    if (op.kind === 'session.create') return frame.type === 'CREATE_RESULT' && frame.commandId === op.commandId;
    if (op.kind === 'history.read') return frame.type === 'HISTORY_RESULT' && frame.sessionId === op.sessionId;
    if (op.kind === 'request.cancel') return frame.type === 'REQUEST_CANCELED' && frame.targetRequestId === op.targetRequestId;
    if (!('sessionId' in frame) || !('watchId' in frame) || frame.sessionId !== op.sessionId || frame.watchId !== op.watchId) return false;
    if (op.kind === 'watch.attach') return frame.type === 'WATCH_SNAPSHOT';
    if (op.kind === 'watch.renew') return frame.type === 'WATCH_RENEWED';
    if (op.kind === 'watch.detach') return frame.type === 'WATCH_DETACHED';
    return op.kind === 'command' && frame.type === 'COMMAND_RESULT' && frame.commandId === op.commandId;
  }

  request(op: Operation, listener?: (frame: LogicalFrame) => void): Promise<LogicalFrame> {
    if (!this.valid() || (op.kind !== 'hello' && !this.connectionId) || this.pending.size >= 8) return Promise.reject(new Error('unavailable'));
    const requestId = crypto.randomUUID();
    const duration = deadlines[op.kind];
    const expiresAt = new Date(Math.floor(this.bounds().lower + duration - 50)).toISOString();
    const request = { requestId, expiresAt, ...(op.kind === 'hello' ? {} : { connectionId: this.connectionId }), op };
    const body = JSON.stringify({ protocol: 2, viewerToken: this.stream!.viewerToken, request });
    if (new TextEncoder().encode(body).byteLength > 128 * 1024 || new TextEncoder().encode(JSON.stringify(request)).byteLength > 65536) return Promise.reject(new Error('payload_too_large'));
    return new Promise<LogicalFrame>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('timeout')); }, duration);
      this.pending.set(requestId, { op, resolve, reject, timer, listener });
      const postController = new AbortController();
      const postTimer = setTimeout(() => postController.abort(), 5000);
      void (async () => {
        try {
          if (!this.valid()) throw new Error('expired_lease');
          const response = await fetch('/api/plugin/chat/v2/viewer/requests', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
            signal: AbortSignal.any([this.abort.signal, postController.signal]), headers: { 'content-type': 'application/json' }, body,
          });
          const ack: unknown = await response.json();
          if (!response.ok || !z.object({ accepted: z.literal(true), requestId: z.literal(requestId) }).strict().safeParse(ack).success) throw new Error('unavailable');
        } catch { if (!this.closed) this.close('unavailable'); }
        finally { clearTimeout(postTimer); }
      })();
    });
  }

  forgetWatch(requestId: string): void { this.watches.delete(requestId); }
  close(reason: 'rotation' | 'unavailable' = 'unavailable', notify = true): void {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    clearTimeout(this.leaseTimer); clearTimeout(this.rotationTimer);
    this.assembler.clear(); this.watches.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('unavailable')); }
    this.pending.clear();
    this.onStartError?.(new Error('unavailable'));
    this.onStartError = undefined; this.onReady = undefined;
    this.connectionId = undefined; this.createAllowed = false; this.stream = undefined;
    if (notify) this.onClose(reason);
  }
}
