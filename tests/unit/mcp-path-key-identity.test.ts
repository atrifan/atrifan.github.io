import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_IDENTITY_HEADERS, stripClientIdentityHeaders } from '../../src/lib/mcp/path-key-identity.ts';

const SPOOF = {
  'X-User-Id': 'user_victim',
  'X-User-Plan': 'plus',
  'X-Auth-Method': 'path',
  'X-Api-Key-Id': 'key_1',
  'X-Server-Name': 'default',
  'X-Original-Api-Key': 'tlz_victim',
};

test('stripClientIdentityHeaders removes every forwarded-identity header, whatever the case', () => {
  for (const variant of [SPOOF, Object.fromEntries(Object.entries(SPOOF).map(([k, v]) => [k.toLowerCase(), v]))]) {
    const clean = stripClientIdentityHeaders(new Headers(variant));
    assert.deepEqual([...clean.keys()], []);
  }
});

test('stripClientIdentityHeaders keeps credentials and everything else', () => {
  const input = new Headers({ ...SPOOF, 'x-api-key': 'tlz_mine', authorization: 'Bearer t', 'mcp-session-id': 's', 'user-agent': 'ua' });
  const clean = stripClientIdentityHeaders(input);
  assert.deepEqual(Object.fromEntries(clean.entries()), {
    authorization: 'Bearer t',
    'mcp-session-id': 's',
    'user-agent': 'ua',
    'x-api-key': 'tlz_mine',
  });
});

test('stripClientIdentityHeaders returns a copy and leaves the request headers alone', () => {
  const input = new Headers(SPOOF);
  const clean = stripClientIdentityHeaders(input);
  assert.notEqual(clean, input);
  assert.equal(input.get('x-user-id'), 'user_victim');
});

test('CLIENT_IDENTITY_HEADERS lists exactly the headers the old forwarders set', () => {
  assert.deepEqual([...CLIENT_IDENTITY_HEADERS].sort(), Object.keys(SPOOF).map((k) => k.toLowerCase()).sort());
});
