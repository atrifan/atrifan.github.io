import { describe, expect, it } from 'vitest';
import {
  ROOM_TABS,
  RoomApiError,
  actorLabel,
  apiErrorFrom,
  createRoomClient,
  jobRoomEnabled,
  mergeFeed,
  milestoneSummary,
  toActivityItems,
  toMessageItems,
  toMilestoneItems,
  toSteeringItems,
} from '@/src/lib/jobs/client/room';

describe('ROOM_TABS and the feature flag', () => {
  it('has the nine job-room tabs in order', () => {
    expect(ROOM_TABS.map((t) => t.label)).toEqual(['Plan', 'Status', 'Activity', 'Artifacts', 'Milestones', 'Messages', 'Steering', 'QA', 'Delivery']);
    expect(ROOM_TABS.map((t) => t.id)).toEqual(['plan', 'status', 'activity', 'artifacts', 'milestones', 'messages', 'steering', 'qa', 'delivery']);
  });

  it('is off unless NEXT_PUBLIC_GIGS_JOB_ROOM is 1 or true', () => {
    expect(jobRoomEnabled({})).toBe(false);
    expect(jobRoomEnabled({ NEXT_PUBLIC_GIGS_JOB_ROOM: '0' })).toBe(false);
    expect(jobRoomEnabled({ NEXT_PUBLIC_GIGS_JOB_ROOM: 'yes' })).toBe(false);
    expect(jobRoomEnabled({ NEXT_PUBLIC_GIGS_JOB_ROOM: '1' })).toBe(true);
    expect(jobRoomEnabled({ NEXT_PUBLIC_GIGS_JOB_ROOM: ' TRUE ' })).toBe(true);
  });
});

describe('actorLabel', () => {
  it('names the other party, you, or Tulzo for system events', () => {
    expect(actorLabel('customer', 'customer')).toBe('You');
    expect(actorLabel('provider', 'customer')).toBe('Provider');
    expect(actorLabel('customer', 'provider')).toBe('Customer');
    expect(actorLabel('system', 'provider')).toBe('Tulzo');
  });
});

describe('feeds', () => {
  const messages = [
    { id: 'm2', seq: 2, author_role: 'provider' as const, kind: 'progress' as const, body: 'Half done', created_at: '2026-10-12T11:00:00Z', agent_identity_id: 'a1' },
    { id: 'm1', seq: 1, author_role: 'customer' as const, kind: 'message' as const, body: 'Hi', created_at: '2026-10-12T10:00:00Z', agent_identity_id: null },
    { id: 'm3', seq: 3, author_role: 'system' as const, kind: 'system' as const, body: 'Paid', created_at: '2026-10-12T12:00:00Z', agent_identity_id: null },
  ];

  it('orders messages by seq and labels authors for the viewer', () => {
    expect(toMessageItems(messages, 'customer')).toEqual([
      { id: 'm1', seq: 1, author: 'You', mine: true, kind: 'message', body: 'Hi', at: '2026-10-12T10:00:00Z', byAgent: false },
      { id: 'm2', seq: 2, author: 'Provider', mine: false, kind: 'progress', body: 'Half done', at: '2026-10-12T11:00:00Z', byAgent: true },
      { id: 'm3', seq: 3, author: 'Tulzo', mine: false, kind: 'system', body: 'Paid', at: '2026-10-12T12:00:00Z', byAgent: false },
    ]);
    expect(messages[0].id).toBe('m2');
  });

  it('orders activity by seq', () => {
    const events = [
      { id: 'e2', seq: 9, actor_role: 'provider' as const, type: 'milestone.updated', summary: 'Milestone done', created_at: '2026-10-12T11:00:00Z' },
      { id: 'e1', seq: 4, actor_role: 'system' as const, type: 'contract.paid', summary: 'Payment received', created_at: '2026-10-12T10:00:00Z' },
    ];
    expect(toActivityItems(events, 'provider')).toEqual([
      { id: 'e1', seq: 4, actor: 'Tulzo', type: 'contract.paid', summary: 'Payment received', at: '2026-10-12T10:00:00Z' },
      { id: 'e2', seq: 9, actor: 'You', type: 'milestone.updated', summary: 'Milestone done', at: '2026-10-12T11:00:00Z' },
    ]);
  });

  it('merges a polled page into the feed without duplicates, in seq order', () => {
    const merged = mergeFeed([{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }], [{ id: 'b', seq: 2 }, { id: 'd', seq: 4 }, { id: 'c', seq: 3 }]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeFeed([], [])).toEqual([]);
  });

  it('lets a newer copy of an item replace the old one', () => {
    const merged = mergeFeed([{ id: 'a', seq: 1, v: 1 }], [{ id: 'a', seq: 1, v: 2 }]);
    expect(merged).toEqual([{ id: 'a', seq: 1, v: 2 }]);
  });
});

describe('milestones', () => {
  const ms = [
    { id: 'b', title: 'Tests', description: null, status: 'in_progress' as const, position: 2, due_at: null, completed_at: null },
    { id: 'a', title: 'Schema', description: 'DB', status: 'done' as const, position: 1, due_at: '2027-01-01T00:00:00Z', completed_at: '2026-10-12T00:00:00Z' },
    { id: 'c', title: 'Docs', description: null, status: 'blocked' as const, position: 3, due_at: null, completed_at: null },
    { id: 'd', title: 'Ship', description: null, status: 'pending' as const, position: 4, due_at: null, completed_at: null },
  ];

  it('summarises progress', () => {
    expect(milestoneSummary(ms)).toEqual({ done: 1, total: 4, percent: 25 });
    expect(milestoneSummary([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(milestoneSummary(ms.slice(0, 3))).toEqual({ done: 1, total: 3, percent: 33 });
    expect(milestoneSummary([ms[1], { ...ms[1], id: 'z' }, ms[0]])).toEqual({ done: 2, total: 3, percent: 67 });
  });

  it('orders by position with status labels', () => {
    expect(toMilestoneItems(ms)).toEqual([
      { id: 'a', title: 'Schema', description: 'DB', status: 'done', statusLabel: 'Done', due: '2027-01-01T00:00:00Z' },
      { id: 'b', title: 'Tests', description: null, status: 'in_progress', statusLabel: 'In progress', due: null },
      { id: 'c', title: 'Docs', description: null, status: 'blocked', statusLabel: 'Blocked', due: null },
      { id: 'd', title: 'Ship', description: null, status: 'pending', statusLabel: 'Not started', due: null },
    ]);
  });
});

describe('steering', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 's',
    kind: 'clarification',
    status: 'open',
    message: 'Which DB?',
    response: null,
    credit_cost: 0,
    created_at: '2026-10-12T10:00:00Z',
    ...over,
  });

  it('labels kinds and statuses and says who has to act', () => {
    const items = toSteeringItems(
      [
        row({ id: '1', kind: 'clarification', status: 'open' }),
        row({ id: '2', kind: 'revision', status: 'resolved', response: 'Done', credit_cost: 1 }),
        row({ id: '3', kind: 'scope_change', status: 'awaiting_approval' }),
        row({ id: '4', kind: 'scope_change', status: 'awaiting_estimate' }),
        row({ id: '5', kind: 'scope_change', status: 'awaiting_provider' }),
        row({ id: '6', kind: 'revision', status: 'declined' }),
      ],
      'customer',
    );
    expect(items.map((i) => [i.id, i.kindLabel, i.statusLabel, i.waitingOn])).toEqual([
      ['1', 'Clarification', 'Waiting for an answer', 'Provider'],
      ['2', 'Revision', 'Resolved', null],
      ['3', 'Scope change', 'Waiting for your approval', 'You'],
      ['4', 'Scope change', 'Waiting for an estimate', 'Provider'],
      ['5', 'Scope change', 'Waiting for the provider', 'Provider'],
      ['6', 'Revision', 'Declined', null],
    ]);
    expect(items[1]).toMatchObject({ response: 'Done', creditCost: 1, message: 'Which DB?' });
  });

  it('flips who has to act for the provider', () => {
    const items = toSteeringItems(
      [row({ status: 'open' }), row({ id: 'x', status: 'awaiting_approval' }), row({ id: 'y', status: 'awaiting_provider' })],
      'provider',
    );
    expect(items.map((i) => i.waitingOn)).toEqual(['You', 'Customer', 'You']);
    expect(items.map((i) => i.statusLabel)).toEqual(['Waiting for an answer', 'Waiting for the customer', 'Waiting for your reply']);
  });

  it('labels the remaining statuses and unknown values', () => {
    const labels = ['answered', 'approved', 'rejected', 'cancelled', 'something_new'].map(
      (status) => toSteeringItems([row({ status })], 'customer')[0].statusLabel,
    );
    expect(labels).toEqual(['Answered', 'Approved', 'Rejected', 'Cancelled', 'Something new']);
    expect(toSteeringItems([row({ kind: 'mystery' })], 'customer')[0].kindLabel).toBe('Mystery');
  });
});

describe('apiErrorFrom', () => {
  it('uses the {error, message} body', () => {
    const e = apiErrorFrom(403, { error: 'forbidden', message: 'Nope' });
    expect(e).toBeInstanceOf(RoomApiError);
    expect([e.status, e.code, e.message]).toEqual([403, 'forbidden', 'Nope']);
  });
  it('falls back for other bodies', () => {
    const e = apiErrorFrom(502, 'oops');
    expect([e.status, e.code, e.message]).toEqual([502, 'http_502', 'Request failed (502)']);
    expect(apiErrorFrom(500, { error: 7 }).code).toBe('http_500');
    expect(apiErrorFrom(500, null).message).toBe('Request failed (500)');
  });
});

describe('createRoomClient', () => {
  function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const impl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = responses.shift() ?? { status: 200, body: {} };
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
        status: r.status,
        headers: { 'content-type': 'application/json' },
      });
    };
    return { calls, impl: impl as unknown as typeof fetch };
  }

  it('calls the contract endpoints with cursors', async () => {
    const f = fakeFetch([
      { status: 200, body: { contract: { id: 'c1' }, role: 'customer' } },
      { status: 200, body: { messages: [], next_cursor: '0' } },
      { status: 200, body: { events: [], next_cursor: '7' } },
      { status: 200, body: { milestones: [], next_cursor: '2026-01-01T00:00:00Z' } },
      { status: 200, body: { steering: [], next_cursor: '2026-01-01T00:00:00Z' } },
    ]);
    const client = createRoomClient({ fetch: f.impl, base: 'https://gigs.example' });
    expect(await client.contract('c 1')).toEqual({ contract: { id: 'c1' }, role: 'customer' });
    await client.messages('c1');
    expect(await client.activity('c1', '5')).toEqual({ events: [], next_cursor: '7' });
    await client.milestones('c1', '2026-01-01T00:00:00Z');
    await client.steering('c1', { status: 'open' });
    expect(f.calls.map((c) => c.url)).toEqual([
      'https://gigs.example/api/contracts/c%201',
      'https://gigs.example/api/contracts/c1/messages',
      'https://gigs.example/api/contracts/c1/activity?since=5',
      'https://gigs.example/api/contracts/c1/milestones?since=2026-01-01T00%3A00%3A00Z',
      'https://gigs.example/api/contracts/c1/steering?status=open',
    ]);
    expect(f.calls[0].init?.credentials).toBe('same-origin');
    expect(f.calls[0].init?.cache).toBe('no-store');
  });

  it('posts messages and steering requests as JSON', async () => {
    const f = fakeFetch([
      { status: 201, body: { message: { id: 'm' } } },
      { status: 201, body: { steering: { id: 's' } } },
    ]);
    const client = createRoomClient({ fetch: f.impl });
    expect(await client.postMessage('c1', 'Hello')).toEqual({ message: { id: 'm' } });
    expect(await client.createSteering('c1', { message: 'Add CSV export' })).toEqual({ steering: { id: 's' } });
    expect(f.calls[0].url).toBe('/api/contracts/c1/messages');
    expect(f.calls[0].init?.method).toBe('POST');
    expect(f.calls[0].init?.body).toBe(JSON.stringify({ body: 'Hello' }));
    expect((f.calls[0].init?.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(f.calls[1].url).toBe('/api/contracts/c1/steering');
    expect(f.calls[1].init?.body).toBe(JSON.stringify({ message: 'Add CSV export' }));
  });

  it('throws RoomApiError with the API error code', async () => {
    const f = fakeFetch([
      { status: 404, body: { error: 'not_found', message: 'Contract not found' } },
      { status: 500, body: '<html>' },
    ]);
    const client = createRoomClient({ fetch: f.impl });
    await expect(client.contract('x')).rejects.toMatchObject({ status: 404, code: 'not_found', message: 'Contract not found' });
    await expect(client.messages('x')).rejects.toMatchObject({ status: 500, code: 'http_500' });
  });
});
