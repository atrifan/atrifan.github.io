import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeInApp } from '../../../src/lib/notify/inapp-writer.ts';
import { MemoryInAppStore } from '../../../src/lib/notify/inapp-memory-store.ts';
import { parsePayload } from '../../../src/lib/notify/types.ts';
import { SAMPLE_PAYLOADS } from './samples.ts';

const at = (iso: string) => new Date(iso);
const install = (packageId = 'fx', packageName = 'FX MCP') => parsePayload('package_installed', { packageId, packageName });
const bid = parsePayload('bid_received', SAMPLE_PAYLOADS.bid_received);

test('a new event writes one unread item', async () => {
  const store = new MemoryInAppStore();
  const r = await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'bid:1' }, at('2026-10-12T10:00:00Z'));
  assert.deepEqual(r, { status: 'inserted', id: 'i_1' });
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].readAt, null);
  assert.equal(await store.unreadCount('u1'), 1);
});

test('the same event twice is written once', async () => {
  const store = new MemoryInAppStore();
  await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'bid:1' }, at('2026-10-12T10:00:00Z'));
  const again = await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'bid:1' }, at('2026-10-12T10:01:00Z'));
  assert.deepEqual(again, { status: 'duplicate' });
  assert.equal(store.rows.length, 1);
});

test('installs aggregate: at most one item per package per hour, the count goes up and it is unread again', async () => {
  const store = new MemoryInAppStore();
  const ev = (key: string) => ({ userId: 'pub', type: 'package_installed' as const, payload: install(), dedupeKey: key });
  await writeInApp(store, ev('i1'), at('2026-10-12T10:05:00Z'));
  await store.markRead('pub', { all: true });
  assert.equal(await store.unreadCount('pub'), 0);
  for (let i = 2; i <= 5; i++) await writeInApp(store, ev(`i${i}`), at(`2026-10-12T10:${10 + i}:00Z`));
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].count, 5);
  assert.equal(store.rows[0].title, '5 new installs of FX MCP');
  assert.equal(store.rows[0].readAt, null);
  assert.equal(store.rows[0].updatedAt, '2026-10-12T10:15:00.000Z');
  assert.equal(await store.unreadCount('pub'), 1);

  // the next hour starts a new item; another package has its own
  await writeInApp(store, ev('i6'), at('2026-10-12T11:00:00Z'));
  await writeInApp(store, { userId: 'pub', type: 'package_installed', payload: install('gh', 'GH'), dedupeKey: 'g1' }, at('2026-10-12T10:30:00Z'));
  assert.equal(store.rows.length, 3);
  assert.deepEqual(store.rows.map((r) => r.count), [5, 1, 1]);
});

test('a bump that loses a race retries against the fresh count', async () => {
  const store = new MemoryInAppStore();
  const ev = { userId: 'pub', type: 'package_installed' as const, payload: install(), dedupeKey: 'k' };
  await writeInApp(store, ev, at('2026-10-12T10:05:00Z'));
  store.failNextBumps = 1;
  const r = await writeInApp(store, ev, at('2026-10-12T10:06:00Z'));
  assert.equal(r.status, 'bumped');
  assert.equal(store.rows[0].count, 2);
});

test('an insert that loses a race to the same key becomes a bump', async () => {
  const store = new MemoryInAppStore();
  const ev = { userId: 'pub', type: 'package_installed' as const, payload: install(), dedupeKey: 'k' };
  store.hideNextFind = 1; // the first lookup misses a row another writer just inserted
  await writeInApp(store, ev, at('2026-10-12T10:05:00Z'));
  store.hideNextFind = 1;
  const r = await writeInApp(store, ev, at('2026-10-12T10:06:00Z'));
  assert.equal(r.status, 'bumped');
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].count, 2);
});

test('it gives up after three lost races instead of looping', async () => {
  const store = new MemoryInAppStore();
  const ev = { userId: 'pub', type: 'package_installed' as const, payload: install(), dedupeKey: 'k' };
  await writeInApp(store, ev, at('2026-10-12T10:05:00Z'));
  store.failNextBumps = 3;
  assert.deepEqual(await writeInApp(store, ev, at('2026-10-12T10:06:00Z')), { status: 'conflict' });
  assert.equal(store.rows[0].count, 1);
});

test('a group switched off in-app writes nothing', async () => {
  const store = new MemoryInAppStore();
  await store.setInAppPreferences('u1', ['bid_received'], false);
  const r = await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'bid:1' }, at('2026-10-12T10:00:00Z'));
  assert.deepEqual(r, { status: 'muted' });
  assert.equal(store.rows.length, 0);
  // other types still arrive
  const other = await writeInApp(store, { userId: 'u1', type: 'job_posted', payload: parsePayload('job_posted', SAMPLE_PAYLOADS.job_posted), dedupeKey: 'job:1' }, at('2026-10-12T10:00:00Z'));
  assert.equal(other.status, 'inserted');
});

test('unread count and mark-read are per user; ids of other users are ignored', async () => {
  const store = new MemoryInAppStore();
  const now = at('2026-10-12T10:00:00Z');
  await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'a' }, now);
  await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'b' }, now);
  await writeInApp(store, { userId: 'u2', type: 'bid_received', payload: bid, dedupeKey: 'c' }, now);
  const [a, , c] = store.rows;
  assert.equal(await store.unreadCount('u1'), 2);
  assert.equal(await store.markRead('u1', { ids: [a.id, c.id] }), 1);
  assert.equal(await store.unreadCount('u1'), 1);
  assert.equal(await store.unreadCount('u2'), 1);
  assert.equal(await store.markRead('u1', { ids: [a.id] }), 0); // already read
  assert.equal(await store.markRead('u1', { all: true }), 1);
  assert.equal(await store.unreadCount('u1'), 0);
  assert.equal(await store.unreadCount('u2'), 1);
});

test('the feed pages newest first and filters by surface, type and unread', async () => {
  const store = new MemoryInAppStore();
  await writeInApp(store, { userId: 'u1', type: 'bid_received', payload: bid, dedupeKey: 'a' }, at('2026-10-10T10:00:00Z'));
  await writeInApp(store, { userId: 'u1', type: 'package_approved', payload: parsePayload('package_approved', SAMPLE_PAYLOADS.package_approved), dedupeKey: 'b' }, at('2026-10-11T10:00:00Z'));
  await writeInApp(store, { userId: 'u1', type: 'submission_awaiting_qa', payload: parsePayload('submission_awaiting_qa', SAMPLE_PAYLOADS.submission_awaiting_qa), dedupeKey: 'c' }, at('2026-10-12T10:00:00Z'));
  await writeInApp(store, { userId: 'u2', type: 'bid_received', payload: bid, dedupeKey: 'd' }, at('2026-10-12T11:00:00Z'));
  const base = { limit: 10, cursor: null, unreadOnly: false, surface: null, type: null };

  const all = await store.list('u1', base);
  assert.deepEqual(all.map((r) => r.dedupeKey), ['c', 'b', 'a']);
  const first = await store.list('u1', { ...base, limit: 1 });
  assert.deepEqual(first.map((r) => r.dedupeKey), ['c', 'b']); // limit + 1, for the next cursor
  const after = await store.list('u1', { ...base, cursor: { at: all[0].updatedAt, id: all[0].id } });
  assert.deepEqual(after.map((r) => r.dedupeKey), ['b', 'a']);
  assert.deepEqual((await store.list('u1', { ...base, surface: 'marketplace' })).map((r) => r.dedupeKey), ['b']);
  assert.deepEqual((await store.list('u1', { ...base, type: 'bid_received' })).map((r) => r.dedupeKey), ['a']);
  await store.markRead('u1', { ids: [all[0].id] });
  assert.deepEqual((await store.list('u1', { ...base, unreadOnly: true })).map((r) => r.dedupeKey), ['b', 'a']);
});
