import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectRelay, OFFLINE, RECONNECTING, reconnectDelay } from '@/src/views/remote-chat/live-relay-connector';

type Close = (reason: 'rotation' | 'unavailable') => void;
type Fake = { start: ReturnType<typeof vi.fn>; authorized: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; onClose: Close };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function harness(outcomes: Array<'ok' | 'reject' | 'unauthorized'> = []) {
  const sockets: Fake[] = [];
  const clients: unknown[] = [];
  const statuses: Array<string | null> = [];
  const next = () => outcomes.shift() ?? 'ok';
  const connection = connectRelay<Fake>({
    create: (onClose) => {
      const outcome = next();
      const socket: Fake = {
        onClose,
        start: vi.fn(() => (outcome === 'reject' ? Promise.reject(new Error('clock_unavailable')) : Promise.resolve())),
        authorized: vi.fn(() => outcome !== 'unauthorized'),
        close: vi.fn(),
      };
      sockets.push(socket);
      return socket;
    },
    onClient: (client) => clients.push(client),
    onStatus: (message) => statuses.push(message),
  });
  return { sockets, clients, statuses, connection };
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('relay reconnect', () => {
  it('backs off 1s, 2s, 4s, 8s, 16s then every 30s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('retries a rejected start without user action, showing the offline banner only after three failures', async () => {
    const { sockets, statuses } = harness(['reject', 'reject', 'reject', 'ok']);
    await flush();
    expect(statuses).toEqual([RECONNECTING]);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000); await flush();
    expect(statuses.at(-1)).toBe(OFFLINE);
    expect(sockets).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(4000); await flush();
    expect(sockets).toHaveLength(4);
    expect(sockets[2].close).toHaveBeenCalledWith('unavailable', false);
  });

  it('clears the banner after a successful retry and resets the backoff', async () => {
    const { sockets, clients, statuses } = harness(['reject', 'reject', 'ok', 'ok']);
    await flush();
    await vi.advanceTimersByTimeAsync(1000); await flush();
    await vi.advanceTimersByTimeAsync(2000); await flush();
    expect(statuses.at(-1)).toBeNull();
    expect(clients.at(-1)).toBe(sockets[2]);
    sockets[2].onClose('unavailable');
    expect(clients.at(-1)).toBeNull();
    expect(statuses.at(-1)).toBe(RECONNECTING);
    await vi.advanceTimersByTimeAsync(999); await flush();
    expect(sockets).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(sockets).toHaveLength(4);
    await flush();
    expect(statuses.at(-1)).toBeNull();
  });

  it('reconnects after a non-rotation close without user action', async () => {
    const { sockets, statuses } = harness();
    await flush();
    sockets[0].onClose('unavailable');
    expect(statuses.at(-1)).toBe(RECONNECTING);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(sockets).toHaveLength(2);
  });

  it('reconnects immediately after rotation without backoff', async () => {
    const { sockets } = harness();
    await flush();
    sockets[0].onClose('rotation');
    expect(sockets).toHaveLength(2);
    expect(sockets[0].close).not.toHaveBeenCalled();
  });

  it('treats an unauthorized instance as a failed attempt and closes it', async () => {
    const { sockets, clients, statuses } = harness(['unauthorized', 'ok']);
    await flush();
    expect(sockets[0].close).toHaveBeenCalledWith('unavailable', false);
    expect(clients).not.toContain(sockets[0]);
    expect(statuses.at(-1)).toBe(RECONNECTING);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(clients.at(-1)).toBe(sockets[1]);
  });

  it('keeps one connect loop: a stale close from a replaced instance is ignored', async () => {
    const { sockets, connection } = harness();
    await flush();
    connection.stop();
    expect(sockets[0].close).toHaveBeenCalledWith('unavailable', false);
    sockets[0].onClose('unavailable');
    await vi.advanceTimersByTimeAsync(60000); await flush();
    expect(sockets).toHaveLength(1);
  });
});
