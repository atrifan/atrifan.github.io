import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEND_BACKOFF,
  SEND_RETRIES,
  TransportError,
  isRetryableError,
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
