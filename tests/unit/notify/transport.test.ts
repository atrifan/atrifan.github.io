import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryTransport,
  SEND_BACKOFF,
  SEND_RETRIES,
  TransportError,
  createResendTransport,
  isRetryableError,
  resendApiBase,
  sendWithRetry,
  type EmailMessage,
  type EmailTransport,
} from '../../../src/lib/notify/transport.ts';

const message: EmailMessage = { from: 'a@x.test', to: 'b@x.test', subject: 's', html: '<p>h</p>', text: 't', headers: {}, idempotencyKey: 'k1' };

/** A transport that throws the queued errors in order, then answers `{ id: 'ok' }`. */
function flaky(errors: unknown[]): EmailTransport & { sent: EmailMessage[] } {
  const queue = [...errors];
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(m) {
      sent.push(m);
      if (queue.length) throw queue.shift();
      return { id: 'ok' };
    },
  };
}

function recordSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

test('the inline retry policy is 3 retries after 0.5s, 2s and 5s', () => {
  assert.equal(SEND_RETRIES, 3);
  assert.deepEqual(SEND_BACKOFF, { baseMs: 500, factor: 4, maxMs: 5000 });
});

test('a send that works the first time is sent once, without waiting', async () => {
  const t = flaky([]);
  const { waits, sleep } = recordSleep();
  assert.deepEqual(await sendWithRetry(t, message, { sleep }), { id: 'ok' });
  assert.equal(t.sent.length, 1);
  assert.deepEqual(waits, []);
});

test('transient errors are retried with the same message (idempotency key included) after 0.5s and 2s', async () => {
  const t = flaky([new TransportError('resend 503', true, 503), new TransportError('network error', true)]);
  const { waits, sleep } = recordSleep();
  assert.deepEqual(await sendWithRetry(t, message, { sleep }), { id: 'ok' });
  assert.equal(t.sent.length, 3);
  for (const m of t.sent) assert.deepEqual(m, message);
  assert.deepEqual(waits, [500, 2000]);
});

test('after 1 + 3 transient failures the last error is thrown', async () => {
  const errors = [1, 2, 3, 4].map((n) => new TransportError(`resend 503 #${n}`, true, 503));
  const t = flaky(errors);
  const { waits, sleep } = recordSleep();
  await assert.rejects(sendWithRetry(t, message, { sleep }), (err: unknown) => err === errors[3]);
  assert.equal(t.sent.length, 4);
  assert.deepEqual(waits, [500, 2000, 5000]);
});

test('a permanent error is thrown at once, without a retry', async () => {
  const permanent = new TransportError('resend 422', false, 422);
  const t = flaky([permanent]);
  const { waits, sleep } = recordSleep();
  await assert.rejects(sendWithRetry(t, message, { sleep }), (err: unknown) => err === permanent);
  assert.equal(t.sent.length, 1);
  assert.deepEqual(waits, []);
});

test('retries and backoff can be overridden', async () => {
  const t = flaky([new TransportError('x', true), new TransportError('y', true)]);
  const { waits, sleep } = recordSleep();
  await assert.rejects(sendWithRetry(t, message, { retries: 1, backoff: { baseMs: 10, factor: 2, maxMs: 100 }, sleep }));
  assert.equal(t.sent.length, 2);
  assert.deepEqual(waits, [10]);
});

test('errors other than TransportError count as retryable', () => {
  assert.equal(isRetryableError(new Error('boom')), true);
  assert.equal(isRetryableError(new TransportError('x', false, 400)), false);
  assert.equal(isRetryableError(new TransportError('x', true, 500)), true);
});

test('without a sleep option the retry really waits the backoff', async () => {
  const t = flaky([new TransportError('x', true)]);
  const started = Date.now();
  assert.deepEqual(await sendWithRetry(t, message, { backoff: { baseMs: 40, factor: 1, maxMs: 40 } }), { id: 'ok' });
  assert.ok(Date.now() - started >= 35, 'waited about 40ms');
  assert.equal(t.sent.length, 2);
});

test('TransportError carries its name, message, retryable flag and status (null by default)', () => {
  const e = new TransportError('boom', true);
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'TransportError');
  assert.equal(e.message, 'boom');
  assert.equal(e.retryable, true);
  assert.equal(e.status, null);
  assert.equal(new TransportError('x', false, 422).status, 422);
});

test('resendApiBase: RESEND_API_BASE without trailing slashes, else the real API', () => {
  assert.equal(resendApiBase({}), 'https://api.resend.com');
  assert.equal(resendApiBase({ RESEND_API_BASE: '' }), 'https://api.resend.com');
  assert.equal(resendApiBase({ RESEND_API_BASE: 'http://127.0.0.1:9/' }), 'http://127.0.0.1:9');
  assert.equal(resendApiBase({ RESEND_API_BASE: 'http://h//' }), 'http://h');
  assert.equal(resendApiBase({ RESEND_API_BASE: 'http://h/a/b' }), 'http://h/a/b');
});

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: () => Response): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('Resend transport: POST {base}/emails with the bearer key, JSON, idempotency key and reply_to; answers the id', async () => {
  const { calls, fetchImpl } = fakeFetch(() => Response.json({ id: 'em_1' }));
  const result = await createResendTransport('re_key', fetchImpl, 'http://fake').send({ ...message, replyTo: 'r@x.test' });
  assert.deepEqual(result, { id: 'em_1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://fake/emails');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer re_key', 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' });
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    from: 'a@x.test',
    to: ['b@x.test'],
    subject: 's',
    html: '<p>h</p>',
    text: 't',
    headers: {},
    reply_to: 'r@x.test',
  });
});

test('Resend transport: without an idempotency key or reply-to, neither is sent', async () => {
  const { calls, fetchImpl } = fakeFetch(() => Response.json({ id: 'em_2' }));
  const plain: EmailMessage = { ...message, idempotencyKey: undefined };
  await createResendTransport('re_key', fetchImpl, 'http://fake').send(plain);
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer re_key', 'Content-Type': 'application/json' });
  assert.equal('reply_to' in JSON.parse(String(calls[0].init.body)), false);
});

test('Resend transport: an answer without an id, or not JSON, gives id null', async () => {
  assert.deepEqual(await createResendTransport('k', fakeFetch(() => Response.json({})).fetchImpl, 'http://f').send(message), { id: null });
  assert.deepEqual(await createResendTransport('k', fakeFetch(() => new Response('not json')).fetchImpl, 'http://f').send(message), { id: null });
});

test('Resend transport: a network error is a retryable TransportError naming the cause', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNRESET');
  }) as unknown as typeof fetch;
  await assert.rejects(createResendTransport('k', fetchImpl, 'http://f').send(message), (err: unknown) => {
    assert.ok(err instanceof TransportError);
    assert.equal(err.retryable, true);
    assert.equal(err.status, null);
    assert.equal(err.message, 'network error: ECONNRESET');
    return true;
  });
  const throwsString = (async () => {
    throw 'down';
  }) as unknown as typeof fetch;
  await assert.rejects(createResendTransport('k', throwsString, 'http://f').send(message), { message: 'network error: down' });
});

for (const [status, retryable] of [
  [429, true],
  [500, true],
  [503, true],
  [499, false],
  [422, false],
  [400, false],
] as const) {
  test(`Resend transport: HTTP ${status} → TransportError retryable=${retryable} with the status and the body (500 chars)`, async () => {
    const { fetchImpl } = fakeFetch(() => new Response('x'.repeat(600), { status }));
    await assert.rejects(createResendTransport('k', fetchImpl, 'http://f').send(message), (err: unknown) => {
      assert.ok(err instanceof TransportError);
      assert.equal(err.retryable, retryable);
      assert.equal(err.status, status);
      assert.equal(err.message, `resend ${status}: ${'x'.repeat(500)}`);
      return true;
    });
  });
}

test('Resend transport: an unreadable error body still gives the status', async () => {
  const broken = { ok: false, status: 502, text: () => Promise.reject(new Error('stream')) } as unknown as Response;
  await assert.rejects(createResendTransport('k', fakeFetch(() => broken).fetchImpl, 'http://f').send(message), { message: 'resend 502: ' });
});

test('MemoryTransport fails the queued errors first, then records sends with increasing ids', async () => {
  const t = new MemoryTransport();
  const fail = new TransportError('nope', true, 503);
  t.failNext(fail);
  await assert.rejects(t.send(message), (err: unknown) => err === fail);
  assert.deepEqual(await t.send(message), { id: 'mem_1' });
  assert.deepEqual(await t.send(message), { id: 'mem_2' });
  assert.equal(t.sent.length, 2);
});
