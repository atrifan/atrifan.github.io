import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, open, parseKey, SecretBoxError } from '../../src/lib/crypto/secret-box.ts';

const KEY = randomBytes(32).toString('base64');
const OLD = randomBytes(32).toString('base64');
const env = (current: string | undefined, prev?: string) => ({ PAT_ENCRYPTION_KEY: current, PAT_ENCRYPTION_KEY_PREV: prev });

test('seal then open round-trips the plaintext', () => {
  const sealed = seal('github_pat_secret', { env: env(KEY) });
  assert.equal(open(sealed, { env: env(KEY) }), 'github_pat_secret');
});

test('sealed output is base64 with a 12-byte IV and 16-byte tag, and hides the plaintext', () => {
  const sealed = seal('github_pat_secret', { env: env(KEY) });
  assert.equal(Buffer.from(sealed.iv, 'base64').length, 12);
  assert.equal(Buffer.from(sealed.tag, 'base64').length, 16);
  assert.equal(Buffer.from(sealed.ciphertext, 'base64').length, 'github_pat_secret'.length);
  assert.ok(!sealed.ciphertext.includes('github_pat'));
  assert.notEqual(Buffer.from(sealed.ciphertext, 'base64').toString('utf8'), 'github_pat_secret');
});

test('every seal uses a fresh IV', () => {
  const a = seal('same', { env: env(KEY) });
  const b = seal('same', { env: env(KEY) });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext + a.tag, b.ciphertext + b.tag);
});

test('a tampered ciphertext, tag or IV fails to open', () => {
  const sealed = seal('hello world', { env: env(KEY) });
  const flip = (b64: string) => {
    const buf = Buffer.from(b64, 'base64');
    buf[0] ^= 0x01;
    return buf.toString('base64');
  };
  for (const field of ['ciphertext', 'tag', 'iv'] as const) {
    assert.throws(() => open({ ...sealed, [field]: flip(sealed[field]) }, { env: env(KEY) }), (e: unknown) =>
      e instanceof SecretBoxError && e.code === 'decrypt_failed');
  }
});

test('the wrong key fails to open', () => {
  const sealed = seal('hello', { env: env(KEY) });
  assert.throws(() => open(sealed, { env: env(OLD) }), (e: unknown) => e instanceof SecretBoxError && e.code === 'decrypt_failed');
});

test('PAT_ENCRYPTION_KEY_PREV still opens secrets sealed before a rotation', () => {
  const sealedWithOld = seal('rotated', { env: env(OLD) });
  assert.equal(open(sealedWithOld, { env: env(KEY, OLD) }), 'rotated');
  // and new secrets are sealed with the current key only
  const fresh = seal('new', { env: env(KEY, OLD) });
  assert.equal(open(fresh, { env: env(KEY) }), 'new');
  assert.throws(() => open(fresh, { env: env(OLD) }));
});

test('the previous key alone is never used for sealing', () => {
  assert.throws(() => seal('x', { env: env(undefined, OLD) }), (e: unknown) => e instanceof SecretBoxError && e.code === 'key_missing');
});

test('additional authenticated data binds the secret to its context', () => {
  const sealed = seal('bound', { env: env(KEY), aad: 'submission:1' });
  assert.equal(open(sealed, { env: env(KEY), aad: 'submission:1' }), 'bound');
  assert.throws(() => open(sealed, { env: env(KEY), aad: 'submission:2' }));
  assert.throws(() => open(sealed, { env: env(KEY) }));
});

test('parseKey accepts exactly 32 base64 bytes', () => {
  assert.equal(parseKey(KEY, 'PAT_ENCRYPTION_KEY').length, 32);
  assert.equal(parseKey(`  ${KEY}\n`, 'PAT_ENCRYPTION_KEY').length, 32);
  for (const bad of [randomBytes(16).toString('base64'), randomBytes(33).toString('base64'), 'not base64!!']) {
    assert.throws(() => parseKey(bad, 'PAT_ENCRYPTION_KEY'), (e: unknown) =>
      e instanceof SecretBoxError && e.code === 'key_invalid' && e.message.includes('PAT_ENCRYPTION_KEY'));
  }
  for (const missing of [undefined, '', '   ']) {
    assert.throws(() => parseKey(missing, 'PAT_ENCRYPTION_KEY'), (e: unknown) => e instanceof SecretBoxError && e.code === 'key_missing');
  }
});

test('errors never include the key or the plaintext', () => {
  try {
    open({ ciphertext: 'AAAA', iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==' }, { env: env(KEY) });
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof SecretBoxError);
    assert.ok(!(e as Error).message.includes(KEY));
  }
});

test('malformed IV or tag lengths are rejected before decrypting', () => {
  const sealed = seal('x', { env: env(KEY) });
  assert.throws(() => open({ ...sealed, iv: Buffer.alloc(8).toString('base64') }, { env: env(KEY) }), (e: unknown) =>
    e instanceof SecretBoxError && e.code === 'decrypt_failed');
  assert.throws(() => open({ ...sealed, tag: Buffer.alloc(8).toString('base64') }, { env: env(KEY) }), (e: unknown) =>
    e instanceof SecretBoxError && e.code === 'decrypt_failed');
});

test('an invalid previous key is ignored when the current key works', () => {
  const sealed = seal('ok', { env: env(KEY) });
  assert.equal(open(sealed, { env: env(KEY, 'garbage') }), 'ok');
});

test('empty and unicode plaintexts round-trip', () => {
  for (const s of ['', 'ünïcødé 🔑']) {
    assert.equal(open(seal(s, { env: env(KEY) }), { env: env(KEY) }), s);
  }
});
