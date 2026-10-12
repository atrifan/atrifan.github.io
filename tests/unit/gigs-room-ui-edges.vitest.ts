/** Edge cases for the job room's client mappers (several found by mutation testing). */
import { describe, expect, it } from 'vitest';
import {
  RoomApiError,
  activityTimeline,
  chatItems,
  createRoomClient,
  estimateView,
  mergeById,
  toVersionItems,
  type RoomSpec,
  type RoomSteering,
  type RoomVersion,
} from '@/src/lib/jobs/client/room';

const version = (over: Partial<RoomVersion>): RoomVersion => ({
  id: 'v1',
  version: 1,
  spec_version_id: 's1',
  price_cents: 30000,
  fee_cents: 4500,
  customer_total_cents: 34500,
  commission_bps: 1500,
  currency: 'eur',
  deadline: '2027-03-01T12:00:00.000Z',
  steering_allowance: 2,
  state: 'current',
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});
const spec: RoomSpec = { id: 's1', version: 1, requirements: ['A'], deliverables: ['B'], acceptance_criteria: ['C'] };
const estimate = (over: Partial<RoomSteering>) =>
  ({ estimate_delta_cents: null, estimate_eta_days: null, deliverable_changes: [], base_contract_version_id: 'base', new_contract_version_id: null, ...over }) as RoomSteering;

describe('mergeById', () => {
  it('replaces changed rows in place and appends new ones', () => {
    expect(mergeById([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 1 }])).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 1 },
    ]);
    expect(mergeById([], [])).toEqual([]);
  });
});

describe('chat and activity', () => {
  it('plain messages have no label', () => {
    const [m] = chatItems([{ id: 'm', seq: 1, author_role: 'provider', kind: 'message', body: 'x', created_at: '2026-10-12T10:00:00Z', agent_identity_id: null }], [], 'customer');
    expect(m.label).toBeNull();
  });

  it('keeps every progress-type event, trims summaries, and 280 characters fit', () => {
    const types = [
      'payment_received',
      'topup_paid',
      'refund_issued',
      'progress_posted',
      'milestone_created',
      'milestone_updated',
      'steering_requested',
      'steering_responded',
      'scope_change_approved',
      'scope_change_rejected',
      'submission_received',
      'qa_verdict',
    ];
    const items = activityTimeline(
      types.map((type, i) => ({ id: type, seq: i, actor_role: 'system' as const, type, summary: '  padded  ', created_at: '2026-10-12T10:00:00Z' })),
      'customer',
    );
    expect(items.map((i) => i.id)).toEqual(types);
    expect(items[0].summary).toBe('padded');
    const exact = 'y'.repeat(280);
    expect(activityTimeline([{ id: 'e', seq: 1, actor_role: 'provider', type: 'progress_posted', summary: exact, created_at: '2026-10-12T10:00:00Z' }], 'provider')[0].summary).toBe(exact);
  });
});

describe('estimateView', () => {
  const base = version({ id: 'base', price_cents: 20000 });
  const other = version({ id: 'other', price_cents: 99900 });
  it('works with only an ETA, against a base that is not the first version', () => {
    expect(estimateView(estimate({ estimate_eta_days: 3 }), [other, base])).toEqual({ lines: ['Price: €200 (unchanged)', 'ETA: 3 days'], deliverableChanges: [] });
  });
  it('works with only deliverable changes', () => {
    expect(estimateView(estimate({ deliverable_changes: ['Docs'] }), [other, base])).toEqual({ lines: ['Price: €200 (unchanged)'], deliverableChanges: ['Docs'] });
  });
});

describe('version history', () => {
  it('a deadline that moves within the same day is not a change', () => {
    const items = toVersionItems([version({ deadline: '2027-03-01T08:00:00.000Z' }), version({ id: 'v2', version: 2, deadline: '2027-03-01T20:00:00.000Z' })], [spec]);
    expect(items[1].changes).toEqual(['No changes to the terms']);
  });
});

describe('client', () => {
  it('RoomApiError is named', () => {
    expect(new RoomApiError(400, 'x', 'y').name).toBe('RoomApiError');
  });

  it('messages pass the seq cursor', async () => {
    const urls: string[] = [];
    const impl = (async (url: string) => {
      urls.push(url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await createRoomClient({ fetch: impl }).messages('c1', '5');
    expect(urls).toEqual(['/api/contracts/c1/messages?since=5']);
  });
});
