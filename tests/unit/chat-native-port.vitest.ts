import { afterEach, expect, it, vi } from 'vitest';
import { watchNativeSession } from '../../src/views/remote-chat/native-session-port';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('a stalled live receive fails closed within 15 seconds and never overlaps polls', async () => {
  vi.useFakeTimers();
  let liveReceives = 0;
  const onError = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('after=latest')) return new Response(JSON.stringify({ frames: [], cursor: 0 }));
    if (url.includes('/receive')) {
      liveReceives++;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    return new Response('{}');
  }));
  const watch = watchNativeSession({ relayId: 'relay', nativeSessionId: 'native', onFrame: vi.fn(), onError });
  try {
    await watch.start();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(liveReceives).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Connection interrupted/));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(liveReceives).toBe(1);
  } finally { watch.release(false); }
});
