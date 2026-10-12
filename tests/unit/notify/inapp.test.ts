import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGGREGATE_WINDOW_MS,
  aggregateGroup,
  bucketStart,
  inAppDedupeKey,
  planInAppWrite,
  renderInApp,
} from '../../../src/lib/notify/inapp.ts';
import { NOTIFICATION_TYPES, parsePayload } from '../../../src/lib/notify/types.ts';
import { SAMPLE_PAYLOADS } from './samples.ts';

const NOW = new Date('2026-10-12T10:17:42.000Z');

test('every type renders a non-empty title, a surface and a surface-relative url', () => {
  for (const type of NOTIFICATION_TYPES) {
    const item = renderInApp(type, parsePayload(type, SAMPLE_PAYLOADS[type]));
    assert.ok(item.title.length > 0, type);
    assert.ok(item.title.length <= 200, type);
    assert.ok(['hub', 'ai', 'marketplace', 'gigs', 'chat'].includes(item.surface), type);
    assert.match(item.url, /^\/[^/]/, type);
    assert.doesNotMatch(item.url, /^https?:/, type);
  }
});

test('gigs items link to the job, the room tab or the delivery page on the gigs surface', () => {
  const bid = renderInApp('bid_received', parsePayload('bid_received', { jobId: 'j 1', jobTitle: 'CSV importer', bidderName: 'Atlas', amountCents: 30000, currency: 'eur' }));
  assert.deepEqual(bid, { title: 'New bid on CSV importer', body: 'Atlas bid €300.00', surface: 'gigs', url: '/jobs/j%201' });

  const steering = renderInApp('steering_awaiting_approval', parsePayload('steering_awaiting_approval', { jobId: 'j', jobTitle: 'T', contractId: 'c1', requestedBy: 'Pat', summary: 'Add an export' }));
  assert.equal(steering.url, '/contracts/c1?tab=steering');
  assert.equal(steering.body, 'Pat: Add an export');

  const qa = renderInApp('qa_verdict', parsePayload('qa_verdict', { jobId: 'j', jobTitle: 'T', contractId: 'c1', verdict: 'needs_changes' }));
  assert.equal(qa.title, 'QA needs changes: T');
  assert.equal(qa.url, '/contracts/c1?tab=qa');
  assert.equal(renderInApp('qa_verdict', parsePayload('qa_verdict', { jobId: 'j', jobTitle: 'T', contractId: 'c1', verdict: 'pass' })).title, 'QA passed: T');
  assert.equal(renderInApp('qa_verdict', parsePayload('qa_verdict', { jobId: 'j', jobTitle: 'T', contractId: 'c1', verdict: 'fail' })).title, 'QA failed: T');

  assert.equal(renderInApp('delivery_ready', parsePayload('delivery_ready', { jobId: 'j', jobTitle: 'T', contractId: 'c1' })).url, '/contracts/c1/delivery');
  assert.equal(renderInApp('payment_confirmed', parsePayload('payment_confirmed', { jobId: 'j', jobTitle: 'T', contractId: 'c1', amountCents: 34500, currency: 'eur' })).body, '€345.00 held until you accept the delivery');
});

test('payouts link to the contract when known, else to My activity', () => {
  const withContract = renderInApp('payout_sent', parsePayload('payout_sent', { amountCents: 30000, currency: 'eur', contractId: 'c9', jobTitle: 'T' }));
  assert.deepEqual(withContract, { title: 'Payout sent: €300.00', body: 'T', surface: 'gigs', url: '/contracts/c9/delivery' });
  const bare = renderInApp('payout_sent', parsePayload('payout_sent', { amountCents: 5 }));
  assert.equal(bare.title, 'Payout sent: $0.05');
  assert.equal(bare.url, '/activity');
  assert.equal(bare.body, null);
});

test('a review links to My activity and quotes the comment', () => {
  const r = renderInApp('review_received', parsePayload('review_received', { reviewerName: 'Cara', rating: 4, comment: 'Great work' }));
  assert.deepEqual(r, { title: 'Cara rated you 4/5', body: 'Great work', surface: 'gigs', url: '/activity' });
});

test('dispute_opened goes to the admin disputes page for admins and to the delivery page for parties', () => {
  const base = { jobId: 'j', jobTitle: 'T', contractId: 'c1', openedBy: 'Cara' };
  const party = renderInApp('dispute_opened', parsePayload('dispute_opened', base));
  assert.equal(party.surface, 'gigs');
  assert.equal(party.url, '/contracts/c1/delivery');
  const admin = renderInApp('dispute_opened', parsePayload('dispute_opened', { ...base, audience: 'admin' }));
  assert.equal(admin.surface, 'hub');
  assert.equal(admin.url, '/admin/disputes');
});

test('admin QA items go to the hub QA queue', () => {
  const item = renderInApp('submission_awaiting_qa', parsePayload('submission_awaiting_qa', { jobId: 'j', jobTitle: 'T', contractId: 'c1', providerName: 'Pat' }));
  assert.deepEqual(item, { title: 'Submission awaiting QA: T', body: 'From Pat', surface: 'hub', url: '/admin/qa' });
});

test('marketplace items: installs (singular and aggregated), approvals and rejections', () => {
  const p = parsePayload('package_installed', { packageId: 'fx-mcp', packageName: 'FX MCP', version: '1.2.0' });
  assert.deepEqual(renderInApp('package_installed', p), { title: 'New install of FX MCP', body: 'Installs are anonymous counts.', surface: 'marketplace', url: '/publisher/activity' });
  assert.equal(renderInApp('package_installed', p, 3).title, '3 new installs of FX MCP');
  assert.equal(renderInApp('package_installed', p, 0).title, 'New install of FX MCP');

  const ok = renderInApp('package_approved', parsePayload('package_approved', { packageId: 'fx mcp', packageName: 'FX MCP' }));
  assert.deepEqual(ok, { title: 'FX MCP is live in the marketplace', body: null, surface: 'marketplace', url: '/fx%20mcp' });
  const no = renderInApp('package_rejected', parsePayload('package_rejected', { packageId: 'fx', packageName: 'FX MCP', reason: 'Missing README' }));
  assert.deepEqual(no, { title: "FX MCP wasn't approved", body: 'Missing README', surface: 'marketplace', url: '/publish' });
  assert.equal(renderInApp('package_rejected', parsePayload('package_rejected', { packageId: 'fx', packageName: 'FX MCP' })).body, null);
});

test('long titles are clipped to 200 characters with an ellipsis', () => {
  const long = 'x'.repeat(290);
  const item = renderInApp('job_posted', parsePayload('job_posted', { jobId: 'j', jobTitle: long }));
  assert.equal(item.title.length, 200);
  assert.ok(item.title.endsWith('…'));
});

test('only package_installed aggregates, grouped by package', () => {
  assert.deepEqual(aggregateGroup('package_installed', { packageId: 'fx' }), 'fx');
  for (const type of NOTIFICATION_TYPES.filter((t) => t !== 'package_installed')) {
    assert.equal(aggregateGroup(type, SAMPLE_PAYLOADS[type] as Record<string, unknown>), null, type);
  }
});

test('the aggregation bucket is the start of the hour window', () => {
  assert.equal(AGGREGATE_WINDOW_MS, 3_600_000);
  assert.equal(bucketStart(NOW).toISOString(), '2026-10-12T10:00:00.000Z');
  assert.equal(bucketStart(new Date('2026-10-12T10:00:00.000Z')).toISOString(), '2026-10-12T10:00:00.000Z');
  assert.equal(bucketStart(new Date('2026-10-12T10:59:59.999Z')).toISOString(), '2026-10-12T10:00:00.000Z');
});

test('the in-app dedupe key is the caller key, except aggregates share one key per user, package and hour', () => {
  assert.equal(inAppDedupeKey('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:1', NOW), 'bid:1');
  const a = inAppDedupeKey('u1', 'package_installed', { packageId: 'fx', packageName: 'FX' }, 'install:1', NOW);
  const b = inAppDedupeKey('u1', 'package_installed', { packageId: 'fx', packageName: 'FX' }, 'install:2', new Date('2026-10-12T10:59:00Z'));
  const nextHour = inAppDedupeKey('u1', 'package_installed', { packageId: 'fx', packageName: 'FX' }, 'install:3', new Date('2026-10-12T11:00:00Z'));
  const otherPkg = inAppDedupeKey('u1', 'package_installed', { packageId: 'gh', packageName: 'GH' }, 'install:4', NOW);
  const otherUser = inAppDedupeKey('u2', 'package_installed', { packageId: 'fx', packageName: 'FX' }, 'install:5', NOW);
  assert.equal(a, 'inapp:package_installed:u1:fx:2026-10-12T10:00:00.000Z');
  assert.equal(a, b);
  assert.notEqual(a, nextHour);
  assert.notEqual(a, otherPkg);
  assert.notEqual(a, otherUser);
});

test('planInAppWrite inserts a new row with the rendered content', () => {
  const plan = planInAppWrite(null, { userId: 'u1', type: 'bid_received', payload: parsePayload('bid_received', SAMPLE_PAYLOADS.bid_received), dedupeKey: 'bid:1' }, NOW);
  assert.equal(plan.kind, 'insert');
  if (plan.kind !== 'insert') return;
  assert.equal(plan.row.userId, 'u1');
  assert.equal(plan.row.type, 'bid_received');
  assert.equal(plan.row.dedupeKey, 'bid:1');
  assert.equal(plan.row.count, 1);
  assert.equal(plan.row.surface, 'gigs');
  assert.ok(plan.row.title.startsWith('New bid on'));
});

test('planInAppWrite skips a repeat of a normal event and bumps an aggregate (unread again)', () => {
  const normal = { userId: 'u1', type: 'bid_received' as const, payload: parsePayload('bid_received', SAMPLE_PAYLOADS.bid_received), dedupeKey: 'bid:1' };
  assert.deepEqual(planInAppWrite({ id: 'n1', count: 1, readAt: null }, normal, NOW), { kind: 'skip' });

  const install = { userId: 'u1', type: 'package_installed' as const, payload: parsePayload('package_installed', { packageId: 'fx', packageName: 'FX' }), dedupeKey: 'x' };
  const plan = planInAppWrite({ id: 'n7', count: 2, readAt: '2026-10-12T10:05:00.000Z' }, install, NOW);
  assert.deepEqual(plan, {
    kind: 'bump',
    id: 'n7',
    expectedCount: 2,
    patch: { count: 3, title: '3 new installs of FX', body: 'Installs are anonymous counts.', readAt: null, updatedAt: NOW.toISOString() },
  });
});
