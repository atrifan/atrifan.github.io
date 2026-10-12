import { describe, expect, it } from 'vitest';
import {
  activityTimeline,
  chatItems,
  contractSteps,
  createRoomClient,
  creditsText,
  deadlineCountdown,
  diffList,
  estimateView,
  priceChangeText,
  qaStateLabel,
  refundNotice,
  steeringKindText,
  tabFromQuery,
  toReviewItems,
  toSubmissionItems,
  toVersionItems,
  topupView,
  type RoomMessage,
  type RoomSpec,
  type RoomSteering,
  type RoomVersion,
} from '@/src/lib/jobs/client/room';

describe('steeringKindText (the classification, said plainly)', () => {
  it('clarifications are free', () => {
    expect(steeringKindText('clarification', { viewer: 'customer', allowance: 3 })).toBe('Clarification, free');
    expect(steeringKindText('clarification', { viewer: 'provider', allowance: 0 })).toBe('Clarification, free');
  });
  it('revisions use one of the included credits', () => {
    expect(steeringKindText('revision', { viewer: 'customer', allowance: 3 })).toBe('Revision, uses 1 of your 3 steering credits');
    expect(steeringKindText('revision', { viewer: 'provider', allowance: 2 })).toBe("Revision, uses 1 of the customer's 2 steering credits");
    expect(steeringKindText('revision', { viewer: 'customer', allowance: 1 })).toBe('Revision, uses your 1 steering credit');
    expect(steeringKindText('revision', { viewer: 'provider', allowance: 1 })).toBe("Revision, uses the customer's 1 steering credit");
  });
  it('scope changes need a new estimate', () => {
    expect(steeringKindText('scope_change', { viewer: 'customer', allowance: 3 })).toBe('Scope change, needs a new estimate');
    expect(steeringKindText('scope_change', { viewer: 'provider', allowance: 3 })).toBe('Scope change, needs a new estimate');
  });
  it('humanizes unknown kinds', () => {
    expect(steeringKindText('mystery_kind', { viewer: 'customer', allowance: 3 })).toBe('Mystery kind');
  });
});

describe('creditsText', () => {
  it('says how many are left of the allowance', () => {
    expect(creditsText({ allowance: 3, used: 1, remaining: 2 })).toBe('Steering credits: 2 of 3 left');
    expect(creditsText({ allowance: 0, used: 0, remaining: 0 })).toBe('Steering credits: 0 of 0 left');
  });
});

describe('priceChangeText', () => {
  it('shows old → new and the signed difference', () => {
    expect(priceChangeText(30000, 35000)).toBe('Price: €300 → €350 (+€50)');
    expect(priceChangeText(30000, 25000)).toBe('Price: €300 → €250 (-€50)');
    expect(priceChangeText(30000, 30000)).toBe('Price: €300 (unchanged)');
    expect(priceChangeText(1250, 1300, 'Total')).toBe('Total: €12.50 → €13 (+€0.50)');
  });
});

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

const spec = (over: Partial<RoomSpec>): RoomSpec => ({
  id: 's1',
  version: 1,
  requirements: ['Import CSV'],
  deliverables: ['Pull request'],
  acceptance_criteria: ['Imports cleanly'],
  ...over,
});

const steering = (over: Partial<RoomSteering>): RoomSteering => ({
  id: 'st',
  kind: 'scope_change',
  status: 'awaiting_approval',
  message: 'Add Excel export',
  response: 'Sure',
  credit_cost: 0,
  created_at: '2026-10-12T10:00:00Z',
  updated_at: '2026-10-12T10:00:00Z',
  spec_changes: [],
  proposed_price_cents: null,
  proposed_deadline: null,
  estimate_delta_cents: 5000,
  estimate_eta_days: 5,
  deliverable_changes: ['Excel exporter'],
  base_contract_version_id: 'v1',
  new_contract_version_id: 'v2',
  topup_amount_cents: 0,
  topup_status: 'none',
  topup_checkout_url: null,
  refund_amount_cents: 0,
  refund_status: 'none',
  ...over,
});

describe('estimateView', () => {
  it('lists price, total, ETA and deliverable changes against the base version', () => {
    const v1 = version({});
    const v2 = version({ id: 'v2', version: 2, price_cents: 35000, customer_total_cents: 40250, state: 'proposed' });
    expect(estimateView(steering({}), [v1, v2])).toEqual({
      lines: ['Price: €300 → €350 (+€50)', 'Total with fee: €345 → €402.50 (+€57.50)', 'ETA: 5 days'],
      deliverableChanges: ['Excel exporter'],
    });
  });
  it('says 1 day, and uses the delta when the proposed version is not loaded', () => {
    expect(estimateView(steering({ estimate_eta_days: 1, estimate_delta_cents: -5000, deliverable_changes: [] }), [version({})])).toEqual({
      lines: ['Price: €300 → €250 (-€50)', 'ETA: 1 day'],
      deliverableChanges: [],
    });
  });
  it('is null without an estimate or base version', () => {
    expect(estimateView(steering({ estimate_delta_cents: null, estimate_eta_days: null, deliverable_changes: [] }), [version({})])).toBeNull();
    expect(estimateView(steering({}), [])).toBeNull();
  });
});

describe('diffList', () => {
  it('reports added and removed items, keeping order', () => {
    expect(diffList(['a', 'b', 'c'], ['b', 'd', 'c', 'e'])).toEqual({ added: ['d', 'e'], removed: ['a'] });
    expect(diffList([], [])).toEqual({ added: [], removed: [] });
    expect(diffList(['a'], ['a'])).toEqual({ added: [], removed: [] });
  });
});

describe('toVersionItems (version history with diffs)', () => {
  it('labels states and lists what changed from the previous version', () => {
    const v1 = version({ state: 'superseded' });
    const v2 = version({
      id: 'v2',
      version: 2,
      spec_version_id: 's2',
      price_cents: 35000,
      deadline: '2027-03-08T12:00:00.000Z',
      state: 'current',
      created_at: '2026-10-12T00:00:00Z',
    });
    const v3 = version({ id: 'v3', version: 3, spec_version_id: 's2', price_cents: 35000, deadline: '2027-03-08T12:00:00.000Z', state: 'rejected' });
    const specs = [
      spec({}),
      spec({ id: 's2', version: 2, requirements: ['Import CSV', 'Export to Excel'], deliverables: ['Excel exporter'], acceptance_criteria: ['Imports cleanly', 'Exports open in Excel'] }),
    ];
    expect(toVersionItems([v3, v1, v2], specs)).toEqual([
      { id: 'v1', label: 'Version 1', stateLabel: 'Superseded', state: 'superseded', at: '2026-10-01T00:00:00Z', changes: [] },
      {
        id: 'v2',
        label: 'Version 2',
        stateLabel: 'Current',
        state: 'current',
        at: '2026-10-12T00:00:00Z',
        changes: [
          'Price: €300 → €350',
          'Deadline: 1 Mar 2027 → 8 Mar 2027',
          'Added requirement: Export to Excel',
          'Added deliverable: Excel exporter',
          'Removed deliverable: Pull request',
          'Added acceptance criterion: Exports open in Excel',
        ],
      },
      { id: 'v3', label: 'Version 3', stateLabel: 'Rejected', state: 'rejected', at: '2026-10-01T00:00:00Z', changes: ['No changes to the terms'] },
    ]);
  });

  it('handles deadlines added or removed, and specs that are not loaded', () => {
    const items = toVersionItems(
      [version({ deadline: null }), version({ id: 'v2', version: 2, spec_version_id: 'missing', deadline: '2027-03-01T12:00:00.000Z', state: 'proposed' })],
      [spec({})],
    );
    expect(items[1]).toMatchObject({ stateLabel: 'Proposed', changes: ['Deadline: none → 1 Mar 2027'] });
    const back = toVersionItems([version({}), version({ id: 'v2', version: 2, deadline: null })], [spec({})]);
    expect(back[1].changes).toEqual(['Deadline: 1 Mar 2027 → none']);
  });
});

describe('contractSteps (status tab)', () => {
  const states = (status: string) => contractSteps(status)?.map((s) => `${s.label}:${s.state}`);
  it('marks done, current and upcoming steps', () => {
    expect(states('pending_payment')).toEqual(['Paid:current', 'In progress:upcoming', 'In QA:upcoming', 'Delivered:upcoming', 'Completed:upcoming']);
    expect(states('active')).toEqual(['Paid:done', 'In progress:current', 'In QA:upcoming', 'Delivered:upcoming', 'Completed:upcoming']);
    expect(states('rework')).toEqual(['Paid:done', 'In progress:current', 'In QA:upcoming', 'Delivered:upcoming', 'Completed:upcoming']);
    expect(states('submitted')).toEqual(['Paid:done', 'In progress:done', 'In QA:current', 'Delivered:upcoming', 'Completed:upcoming']);
    expect(states('in_qa')).toEqual(['Paid:done', 'In progress:done', 'In QA:current', 'Delivered:upcoming', 'Completed:upcoming']);
    expect(states('delivered')).toEqual(['Paid:done', 'In progress:done', 'In QA:done', 'Delivered:current', 'Completed:upcoming']);
    expect(states('completed')).toEqual(['Paid:done', 'In progress:done', 'In QA:done', 'Delivered:done', 'Completed:done']);
  });
  it('has no stepper for contracts that left the happy path', () => {
    expect(contractSteps('disputed')).toBeNull();
    expect(contractSteps('cancelled')).toBeNull();
    expect(contractSteps('refunded')).toBeNull();
  });
});

describe('deadlineCountdown', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('counts whole days left or overdue', () => {
    expect(deadlineCountdown('2026-10-22T12:00:00Z', now)).toBe('10 days left');
    expect(deadlineCountdown('2026-10-13T11:00:00Z', now)).toBe('1 day left');
    expect(deadlineCountdown('2026-10-12T18:00:00Z', now)).toBe('Due today');
    expect(deadlineCountdown('2026-10-11T12:00:00Z', now)).toBe('1 day overdue');
    expect(deadlineCountdown('2026-10-09T11:00:00Z', now)).toBe('3 days overdue');
  });
  it('is empty without a deadline', () => {
    expect(deadlineCountdown(null, now)).toBe('');
    expect(deadlineCountdown('not a date', now)).toBe('');
  });
});

describe('QA and artifacts', () => {
  const sub = (attempt: number, status: string) => ({
    id: `sub${attempt}`,
    attempt,
    status,
    repo_full_name: 'acme/importer',
    commit_sha: '0123456789abcdef0123456789abcdef01234567',
    submitted_at: `2026-10-1${attempt}T00:00:00Z`,
  });

  it('lists submissions by attempt with short SHAs and QA labels', () => {
    expect(toSubmissionItems([sub(2, 'in_review'), sub(1, 'requires_changes')])).toEqual([
      { id: 'sub1', attemptLabel: 'Attempt 1', repo: 'acme/importer', commit: '0123456', statusLabel: 'Changes requested', at: '2026-10-11T00:00:00Z' },
      { id: 'sub2', attemptLabel: 'Attempt 2', repo: 'acme/importer', commit: '0123456', statusLabel: 'In review', at: '2026-10-12T00:00:00Z' },
    ]);
  });

  it('labels every submission status', () => {
    expect(['awaiting_qa', 'in_review', 'validated', 'requires_changes', 'rejected', 'other_state'].map((s) => toSubmissionItems([sub(1, s)])[0].statusLabel)).toEqual([
      'Waiting for QA',
      'In review',
      'Validated',
      'Changes requested',
      'Rejected',
      'Other state',
    ]);
  });

  it('qaStateLabel follows the latest submission', () => {
    expect(qaStateLabel([])).toBe('No work submitted yet.');
    expect(qaStateLabel([sub(1, 'requires_changes'), sub(2, 'awaiting_qa')])).toBe('Waiting for QA');
    expect(qaStateLabel([sub(2, 'validated'), sub(1, 'requires_changes')])).toBe('Validated');
  });

  it('toReviewItems titles each verdict by attempt', () => {
    expect(
      toReviewItems([
        { id: 'r2', attempt: 2, verdict: 'validated', reason: null, created_at: '2026-10-13T00:00:00Z' },
        { id: 'r1', attempt: 1, verdict: 'requires_changes', reason: 'Tests fail', created_at: '2026-10-12T00:00:00Z' },
        { id: 'r0', attempt: null, verdict: 'rejected', reason: 'Plagiarised', created_at: '2026-10-11T00:00:00Z' },
      ]),
    ).toEqual([
      { id: 'r0', title: 'Rejected', reason: 'Plagiarised', at: '2026-10-11T00:00:00Z' },
      { id: 'r1', title: 'Attempt 1: Changes requested', reason: 'Tests fail', at: '2026-10-12T00:00:00Z' },
      { id: 'r2', title: 'Attempt 2: Validated', reason: null, at: '2026-10-13T00:00:00Z' },
    ]);
  });
});

describe('money notices', () => {
  it('refundNotice', () => {
    expect(refundNotice(5750)).toBe("We're refunding €57.50 to you.");
  });

  it('topupView shows what the customer still has to do', () => {
    expect(topupView(steering({ status: 'approved', topup_status: 'pending', topup_amount_cents: 5750, topup_checkout_url: 'https://pay/x' }))).toEqual({
      state: 'pending',
      text: 'Top-up of €57.50 pending',
      note: null,
      url: 'https://pay/x',
    });
    expect(topupView(steering({ status: 'approved', topup_status: 'expired', topup_amount_cents: 5750, topup_checkout_url: 'https://pay/x' }))).toEqual({
      state: 'expired',
      text: 'Top-up of €57.50 pending',
      note: 'The checkout link expired.',
      url: null,
    });
    expect(topupView(steering({ status: 'approved', topup_status: 'paid', topup_amount_cents: 5750 }))).toEqual({ state: 'paid', text: 'Top-up of €57.50 paid', note: null, url: null });
    expect(topupView(steering({ status: 'approved', topup_status: 'none' }))).toBeNull();
    expect(topupView(steering({ status: 'awaiting_approval', topup_status: 'pending' }))).toBeNull();
  });
});

describe('activityTimeline (progress, never raw logs)', () => {
  const ev = (seq: number, type: string, summary: string, actor: 'customer' | 'provider' | 'system' = 'provider') => ({
    id: `e${seq}`,
    seq,
    actor_role: actor,
    type,
    summary,
    created_at: `2026-10-12T10:0${seq}:00Z`,
  });
  it('keeps known event types, oldest first, with the actor', () => {
    const items = activityTimeline(
      [ev(3, 'progress_posted', 'Parser done'), ev(1, 'steering_requested', 'Customer asked for a clarification', 'customer'), ev(2, 'debug_dump', 'stack trace…'), ev(4, 'qa_verdict', 'QA validated attempt 1', 'system')],
      'customer',
    );
    expect(items.map((i) => [i.id, i.actor, i.summary])).toEqual([
      ['e1', 'You', 'Customer asked for a clarification'],
      ['e3', 'Provider', 'Parser done'],
      ['e4', 'Tulzo', 'QA validated attempt 1'],
    ]);
  });
  it('shows the first line only, clipped to 280 characters', () => {
    const long = 'x'.repeat(400);
    const [a, b] = activityTimeline([ev(1, 'progress_posted', `Line one\nLine two`), ev(2, 'progress_posted', long)], 'provider');
    expect(a.summary).toBe('Line one');
    expect(b.summary).toHaveLength(280);
    expect(b.summary.endsWith('…')).toBe(true);
  });
});

describe('chatItems (optimistic send)', () => {
  const msg = (seq: number, role: 'customer' | 'provider', body: string): RoomMessage => ({
    id: `m${seq}`,
    seq,
    author_role: role,
    kind: 'message',
    body,
    created_at: '2026-10-12T10:00:00Z',
    agent_identity_id: null,
  });
  it('lists confirmed messages, then pending and failed ones', () => {
    const items = chatItems(
      [msg(2, 'provider', 'Hi'), msg(1, 'customer', 'Hello')],
      [
        { clientId: 'c1', body: 'On its way', at: '2026-10-12T10:01:00Z', state: 'sending' },
        { clientId: 'c2', body: 'Lost', at: '2026-10-12T10:02:00Z', state: 'failed' },
      ],
      'customer',
    );
    expect(items.map((i) => [i.key, i.author, i.mine, i.body, i.state])).toEqual([
      ['m1', 'You', true, 'Hello', 'sent'],
      ['m2', 'Provider', false, 'Hi', 'sent'],
      ['c1', 'You', true, 'On its way', 'sending'],
      ['c2', 'You', true, 'Lost', 'failed'],
    ]);
  });
  it('labels progress posts and agent authors', () => {
    const [p] = chatItems([{ ...msg(1, 'provider', 'Half way'), kind: 'progress', agent_identity_id: 'a1' }], [], 'customer');
    expect(p).toMatchObject({ author: 'Provider (agent)', label: 'Progress update' });
  });
});

describe('tabFromQuery', () => {
  it('accepts known tab ids and defaults to plan', () => {
    expect(tabFromQuery('steering')).toBe('steering');
    expect(tabFromQuery('qa')).toBe('qa');
    expect(tabFromQuery('nope')).toBe('plan');
    expect(tabFromQuery(null)).toBe('plan');
  });
});

describe('createRoomClient: actions', () => {
  function fakeFetch() {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    const impl = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { calls, impl: impl as unknown as typeof fetch };
  }

  it('posts to the provider and customer action routes', async () => {
    const f = fakeFetch();
    const c = createRoomClient({ fetch: f.impl });
    await c.postProgress('c1', { summary: 'Done', details: 'More' });
    await c.saveMilestone('c1', { title: 'Parser', status: 'pending' });
    await c.respondSteering('c1', 's1', { response: 'Yes' });
    await c.approveSteering('c1', 's1');
    await c.rejectSteering('c1', 's1');
    await c.regenerateTopup('c1', 's1');
    await c.acceptVersion('c1', 'v2');
    await c.qa('c1');
    expect(f.calls).toEqual([
      { url: '/api/contracts/c1/progress', method: 'POST', body: { summary: 'Done', details: 'More' } },
      { url: '/api/contracts/c1/milestones', method: 'POST', body: { title: 'Parser', status: 'pending' } },
      { url: '/api/contracts/c1/steering/s1/respond', method: 'POST', body: { response: 'Yes' } },
      { url: '/api/contracts/c1/steering/s1/approve', method: 'POST', body: {} },
      { url: '/api/contracts/c1/steering/s1/reject', method: 'POST', body: {} },
      { url: '/api/contracts/c1/steering/s1/topup', method: 'POST', body: {} },
      { url: '/api/contracts/c1/versions/v2/accept', method: 'POST', body: {} },
      { url: '/api/contracts/c1/qa', method: undefined, body: undefined },
    ]);
  });
});
