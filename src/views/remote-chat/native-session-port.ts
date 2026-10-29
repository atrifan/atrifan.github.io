'use client';

import { parseReceive, takeFresh } from './model/frame-sequence';
import { record, type NativeIdentity, type NativeOutgoing } from './session-contract';

interface Options {
  relayId: string;
  nativeSessionId: string;
  onFrame: (frame: unknown) => void;
  onError: (message: string) => void;
}

/** One browser watch only. No shared daemon socket or legacy command fallback. */
export function watchNativeSession({ relayId, nativeSessionId, onFrame, onError }: Options) {
  const identity: NativeIdentity = { protocol: 1, watchId: crypto.randomUUID(), nativeSessionId };
  const controller = new AbortController();
  let disposed = false;
  let attached = false;
  let primed = false;
  let cursor = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function send(frame: NativeOutgoing): Promise<void> {
    if (disposed) throw new Error('Watch released');
    const response = await fetch('/api/plugin/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: relayId, frame }), signal: controller.signal,
    });
    if (disposed) throw new Error('Watch released');
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    // Transport acceptance is deliberately not execution success.
  }
  async function receive(prime: boolean): Promise<boolean> {
    // A hung live poll must revoke control, not leave an indefinitely "healthy" watch.
    // Keep the deadline active through body parsing as headers alone are not progress.
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(), 15_000);
    try {
      const response = await fetch(`/api/plugin/chat/receive?session_id=${encodeURIComponent(relayId)}&after=${prime ? 'latest' : cursor}`, { signal: AbortSignal.any([controller.signal, deadline.signal]), cache: 'no-store' });
      if (!response.ok) throw new Error(`Receive failed (${response.status})`);
      const body: unknown = await response.json();
      if (disposed) return false;
      if (!record(body) || !Array.isArray(body.frames)) throw new Error('Invalid receive envelope');
      const parsed = parseReceive(body);
      if (parsed.cursor === null) throw new Error('Invalid receive cursor');
      if (prime) { cursor = parsed.cursor; primed = true; return false; }
      const next = takeFresh(parsed.frames, cursor);
      cursor = next.cursor;
      for (const entry of next.fresh) {
        if (disposed) break;
        onFrame(entry.frame);
      }
      return next.fresh.length > 0;
    } finally { clearTimeout(timeout); }
  }
  async function poll(): Promise<void> {
    try {
      const flowing = await receive(false);
      if (!disposed) timer = setTimeout(() => void poll(), flowing ? 30 : 1200);
    } catch {
      if (!disposed) onError('Connection interrupted. Reattach to control this conversation.');
    }
  }
  async function start(): Promise<void> {
    try {
      await receive(true);
      if (disposed) return;
      attached = true;
      // Start numeric polling before awaiting enqueue; a snapshot can arrive during this POST.
      void poll();
      await send({ type: 'SESSION_ATTACH', ...identity });
    } catch {
      if (!disposed) onError('Could not attach to this conversation.');
    }
  }
  function release(online: boolean): void {
    if (disposed) return;
    disposed = true;
    controller.abort();
    if (timer) clearTimeout(timer);
    if (online && primed && attached) {
      void fetch('/api/plugin/chat/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ session_id: relayId, frame: { type: 'SESSION_DETACH', ...identity } }),
      }).catch(() => {});
    }
  }
  return { identity, start, send, release };
}
