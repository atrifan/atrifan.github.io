import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { connectBroker } from '@/src/lib/chat-v2/broker';

let server: WebSocketServer | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

describe('synthetic local Phoenix broker', () => {
  it('joins privately before one acknowledged broadcast, without HTTP fallback', async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const frames: Array<Record<string, unknown>> = [];
    server.on('connection', (ws) => ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
      frames.push(frame);
      ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, join_ref: '1', payload: { status: 'ok', response: {} } }));
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const broker = await connectBroker({ url: `ws://127.0.0.1:${port}`, jwt: 'synthetic-restricted-jwt' }, 'tc2:d:11111111-1111-4111-8111-111111111111', new AbortController().signal, () => {}, () => {});
    await broker.publish({ protocol: 2, test: 'synthetic' });
    broker.close();
    expect(frames).toEqual([
      { topic: 'realtime:tc2:d:11111111-1111-4111-8111-111111111111', event: 'phx_join', payload: { config: { private: true, broadcast: { ack: true, self: false }, presence: { enabled: false }, postgres_changes: [] }, access_token: 'synthetic-restricted-jwt' }, ref: '1', join_ref: '1' },
      { topic: 'realtime:tc2:d:11111111-1111-4111-8111-111111111111', event: 'broadcast', payload: { type: 'broadcast', event: 'relay', payload: { protocol: 2, test: 'synthetic' } }, ref: '2', join_ref: '1' },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('terminates on abort before join and never publishes', async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const controller = new AbortController();
    server.on('connection', (ws) => ws.on('message', () => controller.abort()));
    await expect(connectBroker({ url: `ws://127.0.0.1:${port}`, jwt: 'synthetic' }, 'tc2:d:11111111-1111-4111-8111-111111111111', controller.signal, () => {}, () => {})).rejects.toThrow();
  });

  it('does not accept a wrong-topic ACK or resend after the publisher deadline', async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    let seen!: () => void;
    const broadcastSeen = new Promise<void>((resolve) => { seen = resolve; });
    const frames: Array<Record<string, unknown>> = [];
    server.on('connection', (ws) => ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
      frames.push(frame);
      if (frame.event === 'phx_join') ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, join_ref: '1', payload: { status: 'ok', response: {} } }));
      if (frame.event === 'broadcast') {
        ws.send(JSON.stringify({ topic: 'realtime:wrong', event: 'phx_reply', ref: frame.ref, join_ref: '1', payload: { status: 'ok', response: {} } }));
        seen();
      }
    }));
    const broker = await connectBroker({ url: `ws://127.0.0.1:${port}`, jwt: 'synthetic' }, 'tc2:d:11111111-1111-4111-8111-111111111111', new AbortController().signal, () => {}, () => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const result = broker.publish({ protocol: 2 }).then(() => 'accepted', () => 'rejected');
      await broadcastSeen;
      await vi.advanceTimersByTimeAsync(3001);
      expect(await result).toBe('rejected');
      await expect(broker.publish({ protocol: 2 })).rejects.toThrow();
      expect(frames.filter((frame) => frame.event === 'broadcast')).toHaveLength(1);
    } finally { broker.close(); vi.useRealTimers(); }
  });
});
