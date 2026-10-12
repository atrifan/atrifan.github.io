import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEED_DEFAULT_LIMIT,
  FEED_MAX_LIMIT,
  badgeText,
  bellLabel,
  decodeCursor,
  encodeCursor,
  itemHref,
  newItemsMessage,
  pageOf,
  parseFeedQuery,
  parseReadBody,
} from '../../../src/lib/notify/feed.ts';

const q = (s: string) => new URLSearchParams(s);

test('cursors round-trip and reject anything malformed', () => {
  const c = encodeCursor({ at: '2026-10-12T10:00:00.000Z', id: '3f0c1d2e-0000-4000-8000-000000000001' });
  assert.match(c, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCursor(c), { at: '2026-10-12T10:00:00.000Z', id: '3f0c1d2e-0000-4000-8000-000000000001' });
  for (const bad of ['', '!!!', Buffer.from('no-separator').toString('base64url'), Buffer.from('not-a-date|abc').toString('base64url'), Buffer.from('2026-10-12T10:00:00.000Z|').toString('base64url'), Buffer.from("2026-10-12T10:00:00.000Z|a'b").toString('base64url')]) {
    assert.equal(decodeCursor(bad), null, bad);
  }
});

test('parseFeedQuery: defaults, clamping and filters', () => {
  assert.deepEqual(parseFeedQuery(q('')), { ok: true, query: { limit: FEED_DEFAULT_LIMIT, cursor: null, unreadOnly: false, surface: null, type: null } });
  assert.equal(FEED_DEFAULT_LIMIT, 20);
  assert.equal(FEED_MAX_LIMIT, 50);
  const r = parseFeedQuery(q('limit=10&unread=1&surface=gigs&type=bid_received'));
  assert.deepEqual(r, { ok: true, query: { limit: 10, cursor: null, unreadOnly: true, surface: 'gigs', type: 'bid_received' } });
  const clampHigh = parseFeedQuery(q('limit=500'));
  assert.ok(clampHigh.ok && clampHigh.query.limit === 50);
  const clampLow = parseFeedQuery(q('limit=0'));
  assert.ok(clampLow.ok && clampLow.query.limit === 1);
  const junk = parseFeedQuery(q('limit=abc&unread=0'));
  assert.ok(junk.ok && junk.query.limit === 20 && junk.query.unreadOnly === false);
  const truthy = parseFeedQuery(q('unread=true'));
  assert.ok(truthy.ok && truthy.query.unreadOnly === true);
  const empty = parseFeedQuery(q('surface=&type='));
  assert.ok(empty.ok && empty.query.surface === null && empty.query.type === null);
});

test('parseFeedQuery rejects unknown surfaces, types and bad cursors', () => {
  assert.deepEqual(parseFeedQuery(q('surface=moon')), { ok: false, error: 'unknown surface' });
  assert.deepEqual(parseFeedQuery(q('type=newsletter')), { ok: false, error: 'unknown type' });
  assert.deepEqual(parseFeedQuery(q('cursor=%%%')), { ok: false, error: 'bad cursor' });
  const c = encodeCursor({ at: '2026-10-12T10:00:00.000Z', id: 'n_1' });
  const ok = parseFeedQuery(q(`cursor=${c}`));
  assert.ok(ok.ok && ok.query.cursor?.id === 'n_1');
});

test('parseReadBody accepts ids or all, nothing else', () => {
  assert.deepEqual(parseReadBody({ ids: ['a', 'b', 'a'] }), { ok: true, target: { ids: ['a', 'b'] } });
  assert.deepEqual(parseReadBody({ all: true }), { ok: true, target: { all: true } });
  for (const bad of [null, undefined, {}, { all: false }, { ids: [] }, { ids: 'a' }, { ids: [1] }, { ids: [''] }, { ids: Array.from({ length: 101 }, (_, i) => `n${i}`) }, 'x']) {
    assert.equal(parseReadBody(bad).ok, false, JSON.stringify(bad));
  }
  assert.ok(parseReadBody({ ids: Array.from({ length: 100 }, (_, i) => `n${i}`) }).ok);
});

test('pageOf returns at most `limit` rows and a cursor for the last one when there are more', () => {
  const rows = [1, 2, 3].map((n) => ({ id: `n${n}`, updatedAt: `2026-10-1${n}T00:00:00.000Z` }));
  const first = pageOf(rows, 2);
  assert.deepEqual(first.items.map((r) => r.id), ['n1', 'n2']);
  assert.deepEqual(decodeCursor(first.nextCursor!), { at: '2026-10-12T00:00:00.000Z', id: 'n2' });
  const all = pageOf(rows, 3);
  assert.equal(all.items.length, 3);
  assert.equal(all.nextCursor, null);
  assert.equal(pageOf([], 5).nextCursor, null);
});

test('the badge caps at 99+ and is empty at zero', () => {
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(-3), '');
  assert.equal(badgeText(1), '1');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
});

test('the bell label carries the count', () => {
  assert.equal(bellLabel(0), 'Notifications');
  assert.equal(bellLabel(1), 'Notifications, 1 unread');
  assert.equal(bellLabel(250), 'Notifications, 250 unread');
});

test('newItemsMessage announces only growth after the first poll', () => {
  assert.equal(newItemsMessage(null, 5), '');
  assert.equal(newItemsMessage(5, 5), '');
  assert.equal(newItemsMessage(5, 2), '');
  assert.equal(newItemsMessage(2, 3), '1 new notification');
  assert.equal(newItemsMessage(0, 4), '4 new notifications');
});

test('itemHref puts the item url on its surface', () => {
  assert.equal(itemHref({ surface: 'gigs', url: '/jobs/j1' }, ''), '/gigs/jobs/j1');
  assert.equal(itemHref({ surface: 'hub', url: '/admin/qa' }, ''), '/admin/qa');
  assert.equal(itemHref({ surface: 'marketplace', url: '/publisher/activity' }, 'tulzo.online'), 'https://marketplace.tulzo.online/publisher/activity');
  // never an off-site link, whatever is stored
  assert.equal(itemHref({ surface: 'gigs', url: 'https://evil.test/x' }, ''), '/gigs');
  assert.equal(itemHref({ surface: 'gigs', url: '//evil.test/x' }, ''), '/gigs');
  assert.equal(itemHref({ surface: 'moon' as never, url: '/x' }, ''), '/x');
});

test('cursors survive base64 padding and url-unsafe characters, and reject padded, spaced or partial input', () => {
  for (const c of [
    { at: '2026-10-12T10:00:00.123456+00:00', id: 'a' },
    { at: '2026-10-12T10:00:00Z', id: 'ab' },
    { at: '2026-10-12T10:00:00.1Z', id: '3f0c1d2e-0000-4000-8000-00000000003f' },
  ]) {
    const enc = encodeCursor(c);
    assert.doesNotMatch(enc, /[=+/]/);
    assert.deepEqual(decodeCursor(enc), c);
  }
  const good = encodeCursor({ at: '2026-10-12T10:00:00Z', id: 'n_1' });
  for (const bad of [`${good}=`, ` ${good}`, `${good} `, `${good}.`, Buffer.from('|n_1').toString('base64url'), Buffer.from('2026-10-12T10:00:00Z|n|1').toString('base64url'), '_-_-_']) {
    assert.equal(decodeCursor(bad), null, bad);
  }
});

test('parseFeedQuery reads a blank limit as the default and a leading number as the limit', () => {
  const blank = parseFeedQuery(q('limit='));
  assert.ok(blank.ok && blank.query.limit === FEED_DEFAULT_LIMIT);
  const seven = parseFeedQuery(q('limit=7abc'));
  assert.ok(seven.ok && seven.query.limit === 7);
});

test('parseReadBody: every id must be valid, and the errors say what is expected', () => {
  assert.equal(parseReadBody({ ids: ['ok', ''] }).ok, false);
  assert.equal(parseReadBody({ ids: ['ok', 'bad id'] }).ok, false);
  const notObject = parseReadBody(7);
  assert.ok(!notObject.ok && /ids/.test(notObject.error) && /all/.test(notObject.error));
  const empty = parseReadBody({ ids: [] });
  assert.ok(!empty.ok && /1.100 ids/.test(empty.error));
});

test('itemHref uses NEXT_PUBLIC_ROOT_DOMAIN when no root domain is passed; a relative url falls back to the surface home', () => {
  const before = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  try {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'tulzo.test';
    assert.equal(itemHref({ surface: 'gigs', url: '/jobs/1' }), 'https://gigs.tulzo.test/jobs/1');
    assert.equal(itemHref({ surface: 'gigs', url: 'jobs/1' }), 'https://gigs.tulzo.test/');
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    else process.env.NEXT_PUBLIC_ROOT_DOMAIN = before;
  }
});
