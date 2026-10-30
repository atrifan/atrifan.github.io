import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import {
  capWatchLeaseExpiresAt,
  fixtureDiagnostics,
  startLiveRelayFixture,
  waitForFixtureStreamClose,
  watchLeaseExpiresAt,
} from './live-relay-v2-fixture';

const port = Number(process.env.CHAT_RELAY_HEALTH_PORT ?? 3445);
const origin = `http://127.0.0.1:${port}`;
let server: http.Server;

before(async () => {
  server = await startLiveRelayFixture(port);
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.deepEqual(fixtureDiagnostics(), { activeStreams: 0, activeHeartbeatTimers: 0 }, 'shutdown must clear every fixture stream timer');
});

type SseEvent = { event: string; data: Record<string, any> };
type ReaderState = { reader: ReadableStreamDefaultReader<Uint8Array>; decoder: TextDecoder; pending: string };

async function nextEvent(state: ReaderState, timeoutMs = 4_000): Promise<SseEvent | undefined> {
  while (true) {
    const boundary = state.pending.indexOf('\n\n');
    if (boundary >= 0) {
      const block = state.pending.slice(0, boundary);
      state.pending = state.pending.slice(boundary + 2);
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event:'))?.slice(6) ?? 'message';
      const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).join('\n');
      return { event, data: JSON.parse(data) as Record<string, any> };
    }

    let timer: NodeJS.Timeout | undefined;
    const result = await Promise.race([
      state.reader.read(),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
    if (timer) clearTimeout(timer);
    if (!result) return undefined;
    if (result.done) return undefined;
    state.pending += state.decoder.decode(result.value, { stream: true });
  }
}

async function seed(deviceId: string, heartbeatDisabled = false): Promise<void> {
  const response = await fetch(`${origin}/__relay/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      device: {
        id: deviceId,
        device_name: 'Synthetic health PC',
        status: 'online',
        last_seen_at: '2026-10-30T09:00:00.000Z',
        platform: 'darwin',
        model: 'synthetic-assistant',
      },
      rows: [],
      heartbeatDisabled,
    }),
  });
  assert.equal(response.status, 201);
}

async function connect(deviceId: string, signal?: AbortSignal): Promise<{ response: Response; state: ReaderState }> {
  const response = await fetch(`${origin}/api/plugin/chat/v2/viewer/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocol: 2, deviceId, clientId: randomUUID() }),
    signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/i);
  assert.ok(response.body);
  return { response, state: { reader: response.body.getReader(), decoder: new TextDecoder(), pending: '' } };
}

test('real loopback SSE sends READY then three 2s heartbeats with bounded monotonic leases and cleans up on abort', async () => {
  const deviceId = randomUUID();
  await seed(deviceId);
  const controller = new AbortController();
  const { state } = await connect(deviceId, controller.signal);
  const readyEvent = await nextEvent(state);
  assert.equal(readyEvent?.event, 'ready');
  const ready = readyEvent!.data;
  assert.equal(ready.protocol, 2);
  assert.equal(ready.deviceId, deviceId);
  assert.ok(Date.parse(ready.authorizedUntil) <= Date.parse(ready.serverTime) + 5_000);
  assert.ok(Date.parse(ready.authorizedUntil) <= Date.parse(ready.expiresAt));

  const heartbeats: Array<Record<string, any>> = [];
  for (let index = 0; index < 3; index += 1) {
    const next = await nextEvent(state, 3_500);
    assert.equal(next?.event, 'heartbeat', `heartbeat ${index + 1} should arrive on the real server clock`);
    heartbeats.push(next!.data);
  }
  const instants = [ready, ...heartbeats].map((item) => Date.parse(item.serverTime));
  const leases = [ready, ...heartbeats].map((item) => Date.parse(item.authorizedUntil));
  for (let index = 1; index < instants.length; index += 1) {
    const gap = instants[index] - instants[index - 1];
    assert.ok(gap >= 1_700 && gap <= 2_800, `serverTime gap should reflect 2s heartbeat cadence, got ${gap}ms`);
    assert.ok(instants[index] > instants[index - 1], 'serverTime is strictly monotonic');
    assert.ok(leases[index] > leases[index - 1], 'authorizedUntil advances only with a fresh heartbeat');
    assert.ok(leases[index] <= instants[index] + 5_000, 'heartbeat authority never extends beyond five seconds');
    assert.ok(leases[index] <= Date.parse(ready.expiresAt), 'heartbeat authority is capped by stream expiry');
  }
  assert.ok(instants.at(-1)! - instants[0] >= 5_000, 'the three heartbeats span approximately six real seconds');

  const closed = waitForFixtureStreamClose();
  controller.abort();
  await state.reader.cancel().catch(() => undefined);
  await closed;
  assert.deepEqual(fixtureDiagnostics(), { activeStreams: 0, activeHeartbeatTimers: 0 });
});

test('the synthetic peer can deliberately withhold heartbeats; the real SSE read remains silent until an explicit deadline', async () => {
  const deviceId = randomUUID();
  await seed(deviceId, true);
  const controller = new AbortController();
  const { state } = await connect(deviceId, controller.signal);
  const ready = await nextEvent(state);
  assert.equal(ready?.event, 'ready');
  const heartbeat = await nextEvent(state, 2_500);
  assert.equal(heartbeat, undefined, 'heartbeatDisabled is a deliberate missing-heartbeat fixture scenario');

  const closed = waitForFixtureStreamClose();
  controller.abort();
  await state.reader.cancel().catch(() => undefined);
  await closed;
  assert.deepEqual(fixtureDiagnostics(), { activeStreams: 0, activeHeartbeatTimers: 0 });
});

test('watch snapshots and renewals are capped by the current viewer expiry', () => {
  const now = Date.parse('2026-10-30T10:00:00.000Z');
  assert.equal(watchLeaseExpiresAt(now, now + 60_000), new Date(now + 15_000).toISOString());
  assert.equal(watchLeaseExpiresAt(now, now + 2_000), new Date(now + 2_000).toISOString());
  assert.equal(capWatchLeaseExpiresAt(new Date(now + 15_000).toISOString(), now + 2_000), new Date(now + 2_000).toISOString());
});

test('rotation emits closing and clears heartbeat timers before the old response ends', async () => {
  const deviceId = randomUUID();
  await seed(deviceId);
  const { state } = await connect(deviceId);
  assert.equal((await nextEvent(state))?.event, 'ready');
  const closed = waitForFixtureStreamClose();
  const rotation = await fetch(`${origin}/__relay/rotate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  assert.equal(rotation.status, 200);
  assert.equal((await nextEvent(state))?.event, 'closing');
  assert.equal((await nextEvent(state))?.event, undefined);
  await closed;
  assert.deepEqual(fixtureDiagnostics(), { activeStreams: 0, activeHeartbeatTimers: 0 });
});
