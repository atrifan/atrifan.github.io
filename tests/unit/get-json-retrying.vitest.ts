import { describe, expect, it } from 'vitest';
import { getJsonRetrying } from '@/src/views/remote-chat/get-json-retrying';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function scripted(...replies: Array<Response | Error>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const r = replies.shift();
    if (!r) throw new Error('no more replies');
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('getJsonRetrying', () => {
  it('returns the body of a 2xx answer at once', async () => {
    const s = scripted(json(200, { devices: [1] }));
    const sleeps: number[] = [];
    expect(await getJsonRetrying('/api/x', { fetchImpl: s.fetchImpl, sleep: async (ms) => void sleeps.push(ms) })).toEqual({ devices: [1] });
    expect(s.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('retries a 401 and a network error, waiting longer each time', async () => {
    const s = scripted(json(401, { error: 'Unauthorized' }), new Error('offline'), json(200, { ok: true }));
    const sleeps: number[] = [];
    const out = await getJsonRetrying('/api/x', { fetchImpl: s.fetchImpl, delayMs: 100, sleep: async (ms) => void sleeps.push(ms) });
    expect(out).toEqual({ ok: true });
    expect(s.calls).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('gives up with null after the last attempt, without a final wait', async () => {
    const s = scripted(json(500, {}), json(500, {}), json(500, {}));
    const sleeps: number[] = [];
    expect(await getJsonRetrying('/api/x', { attempts: 3, delayMs: 10, fetchImpl: s.fetchImpl, sleep: async (ms) => void sleeps.push(ms) })).toBeNull();
    expect(s.calls).toHaveLength(3);
    expect(sleeps).toEqual([10, 20]);
  });
});
