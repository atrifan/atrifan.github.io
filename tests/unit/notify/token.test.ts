import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../../src/lib/notify/token.ts';

const SECRET = 'test-secret-0123456789abcdef0123456789';

test('a signed token verifies back to its claims', () => {
  const token = signUnsubscribeToken({ userId: 'user_123', type: 'bid_received' }, SECRET);
  assert.deepEqual(verifyUnsubscribeToken(token, SECRET), { userId: 'user_123', type: 'bid_received' });
});

test('tokens are URL-safe', () => {
  const token = signUnsubscribeToken({ userId: 'user_+/=?&', type: 'payout_sent' }, SECRET);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(encodeURIComponent(token), token);
});

test('signing is deterministic per claims and differs between users and types', () => {
  const a = signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, SECRET);
  assert.equal(a, signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, SECRET));
  assert.notEqual(a, signUnsubscribeToken({ userId: 'u2', type: 'bid_received' }, SECRET));
  assert.notEqual(a, signUnsubscribeToken({ userId: 'u1', type: 'bid_accepted' }, SECRET));
});

test('a token signed with another secret is rejected', () => {
  const token = signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, 'another-secret-0123456789abcdef');
  assert.equal(verifyUnsubscribeToken(token, SECRET), null);
});

test('a tampered payload is rejected', () => {
  const token = signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, SECRET);
  const [, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'victim', t: 'bid_received', v: 1 })).toString('base64url');
  assert.equal(verifyUnsubscribeToken(`${forged}.${sig}`, SECRET), null);
});

test('a tampered signature is rejected', () => {
  const token = signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, SECRET);
  const [body, sig] = token.split('.');
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(verifyUnsubscribeToken(`${body}.${flipped}`, SECRET), null);
  assert.equal(verifyUnsubscribeToken(`${body}.${sig.slice(0, -2)}`, SECRET), null);
});

test('malformed tokens are rejected without throwing', () => {
  for (const bad of ['', 'abc', '.', 'a.b.c', 'not base64!.x', `${Buffer.from('{').toString('base64url')}.x`]) {
    assert.equal(verifyUnsubscribeToken(bad, SECRET), null, `token ${JSON.stringify(bad)}`);
  }
});

test('a validly signed token with an unknown type or missing user is rejected', () => {
  const sign = (obj: unknown) => {
    const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
  };
  // Sanity: our hand-rolled format matches the real one for a valid token.
  assert.deepEqual(verifyUnsubscribeToken(sign({ u: 'u1', t: 'bid_received', v: 1 }), SECRET), {
    userId: 'u1',
    type: 'bid_received',
  });
  assert.equal(verifyUnsubscribeToken(sign({ u: 'u1', t: 'not_a_type', v: 1 }), SECRET), null);
  assert.equal(verifyUnsubscribeToken(sign({ u: '', t: 'bid_received', v: 1 }), SECRET), null);
  assert.equal(verifyUnsubscribeToken(sign({ t: 'bid_received', v: 1 }), SECRET), null);
  assert.equal(verifyUnsubscribeToken(sign({ u: 'u1', t: 'bid_received', v: 2 }), SECRET), null);
});

test('an empty or short secret refuses to sign and never verifies', () => {
  assert.throws(() => signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, ''));
  assert.throws(() => signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, 'short'));
  const token = signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, SECRET);
  assert.equal(verifyUnsubscribeToken(token, ''), null);
});

test('the minimum secret length is 16 characters, with a clear error', () => {
  assert.ok(signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, 'x'.repeat(16)));
  assert.throws(() => signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, 'x'.repeat(15)), /NOTIFY_UNSUBSCRIBE_SECRET/);
});

test('verify refuses a short secret even when the token was signed with it', () => {
  const body = Buffer.from(JSON.stringify({ u: 'u1', t: 'bid_received', v: 1 })).toString('base64url');
  const signWith = (key: string) => `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
  assert.equal(verifyUnsubscribeToken(signWith('y'.repeat(15)), 'y'.repeat(15)), null);
  assert.deepEqual(verifyUnsubscribeToken(signWith('y'.repeat(16)), 'y'.repeat(16)), { userId: 'u1', type: 'bid_received' });
});

test('non-string tokens are rejected without throwing', () => {
  for (const bad of [undefined, null, 42, {}]) {
    assert.equal(verifyUnsubscribeToken(bad as unknown as string, SECRET), null);
  }
});

test('a valid token with extra segments is rejected', () => {
  const token = signUnsubscribeToken({ userId: 'u1', type: 'bid_received' }, SECRET);
  assert.equal(verifyUnsubscribeToken(`${token}.extra`, SECRET), null);
});

test('a validly signed non-object payload is rejected without throwing', () => {
  for (const json of ['null', '"str"', '7', '[]']) {
    const body = Buffer.from(json).toString('base64url');
    const token = `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
    assert.equal(verifyUnsubscribeToken(token, SECRET), null, json);
  }
});
