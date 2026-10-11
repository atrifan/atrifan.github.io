import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay, withRetry } from '../../../src/lib/notify/backoff.ts';

const opts = { baseMs: 100, factor: 2, maxMs: 1000 };

test('delay grows exponentially from the base for 1-based attempts', () => {
  assert.equal(backoffDelay(1, opts), 100);
  assert.equal(backoffDelay(2, opts), 200);
  assert.equal(backoffDelay(3, opts), 400);
  assert.equal(backoffDelay(4, opts), 800);
});

test('delay is capped at maxMs', () => {
  assert.equal(backoffDelay(5, opts), 1000);
  assert.equal(backoffDelay(50, opts), 1000);
  assert.equal(backoffDelay(5000, opts), 1000);
});

test('attempts below 1 are treated as the first attempt', () => {
  assert.equal(backoffDelay(0, opts), 100);
  assert.equal(backoffDelay(-3, opts), 100);
});

test('jitter keeps the delay between half and the full value', () => {
  assert.equal(backoffDelay(3, { ...opts, jitter: () => 0 }), 200);
  assert.equal(backoffDelay(3, { ...opts, jitter: () => 1 }), 400);
  assert.equal(backoffDelay(3, { ...opts, jitter: () => 0.5 }), 300);
  assert.equal(backoffDelay(9, { ...opts, jitter: () => 0 }), 500);
});

function harness() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
}

test('withRetry returns the first success without sleeping', async () => {
  const h = harness();
  const calls: number[] = [];
  const result = await withRetry(async (n) => (calls.push(n), 'ok'), {
    retries: 3,
    backoff: opts,
    sleep: h.sleep,
    isRetryable: () => true,
  });
  assert.equal(result, 'ok');
  assert.deepEqual(calls, [1]);
  assert.deepEqual(h.sleeps, []);
});

test('withRetry retries retryable errors with backoff between attempts', async () => {
  const h = harness();
  const calls: number[] = [];
  const result = await withRetry(
    async (n) => {
      calls.push(n);
      if (n < 3) throw new Error(`boom ${n}`);
      return n;
    },
    { retries: 3, backoff: opts, sleep: h.sleep, isRetryable: () => true },
  );
  assert.equal(result, 3);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(h.sleeps, [100, 200]);
});

test('withRetry gives up after retries + 1 attempts and throws the last error', async () => {
  const h = harness();
  let n = 0;
  await assert.rejects(
    withRetry(
      async () => {
        n += 1;
        throw new Error(`fail ${n}`);
      },
      { retries: 2, backoff: opts, sleep: h.sleep, isRetryable: () => true },
    ),
    /fail 3/,
  );
  assert.equal(n, 3);
  assert.deepEqual(h.sleeps, [100, 200]);
});

test('withRetry does not retry a non-retryable error', async () => {
  const h = harness();
  let n = 0;
  await assert.rejects(
    withRetry(
      async () => {
        n += 1;
        throw new Error('bad request');
      },
      { retries: 5, backoff: opts, sleep: h.sleep, isRetryable: () => false },
    ),
    /bad request/,
  );
  assert.equal(n, 1);
  assert.deepEqual(h.sleeps, []);
});

test('withRetry with zero retries tries exactly once', async () => {
  const h = harness();
  let n = 0;
  await assert.rejects(
    withRetry(async () => {
      n += 1;
      throw new Error('x');
    }, { retries: 0, backoff: opts, sleep: h.sleep, isRetryable: () => true }),
  );
  assert.equal(n, 1);
});
