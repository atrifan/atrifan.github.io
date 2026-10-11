import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideSteering,
  initialSteeringStatus,
  pausesWork,
  topupAmountCents,
  remainingCredits,
  buildClassifierPrompt,
  STEERING_KINDS,
  type SteeringDecisionInput,
} from '../../src/lib/jobs/steering.ts';

function input(over: Partial<SteeringDecisionInput> = {}): SteeringDecisionInput {
  return { classified: 'clarification', specDiff: [], priceDelta: 0, deadlineDelta: 0, remainingSteeringCredits: 2, ...over };
}

test('steering kinds', () => {
  assert.deepEqual([...STEERING_KINDS], ['clarification', 'revision', 'scope_change']);
});

test('a clarification with no changes is free and needs no approval', () => {
  assert.deepEqual(decideSteering(input()), { kind: 'clarification', consumesCredit: false, requiresApproval: false });
});

test('a clarification is free even with no credits left', () => {
  assert.deepEqual(decideSteering(input({ remainingSteeringCredits: 0 })), {
    kind: 'clarification', consumesCredit: false, requiresApproval: false,
  });
});

test('a revision with a credit left uses one credit and needs no approval', () => {
  assert.deepEqual(decideSteering(input({ classified: 'revision', remainingSteeringCredits: 1 })), {
    kind: 'revision', consumesCredit: true, requiresApproval: false,
  });
});

test('a revision with no credit left becomes a scope change', () => {
  for (const remaining of [0, -1, 0.5, Number.NaN]) {
    assert.deepEqual(decideSteering(input({ classified: 'revision', remainingSteeringCredits: remaining })), {
      kind: 'scope_change', consumesCredit: false, requiresApproval: true,
    }, String(remaining));
  }
});

test('a classified scope change needs approval and uses no credit', () => {
  assert.deepEqual(decideSteering(input({ classified: 'scope_change' })), {
    kind: 'scope_change', consumesCredit: false, requiresApproval: true,
  });
});

test('any spec change forces scope_change whatever the classifier said', () => {
  for (const classified of STEERING_KINDS) {
    assert.deepEqual(decideSteering(input({ classified, specDiff: ['add an export button'] })), {
      kind: 'scope_change', consumesCredit: false, requiresApproval: true,
    }, classified);
  }
});

test('blank spec diff entries are not changes', () => {
  assert.equal(decideSteering(input({ specDiff: ['', '   '] })).kind, 'clarification');
  assert.equal(decideSteering(input({ specDiff: ['  x '] })).kind, 'scope_change');
});

test('any price change, up or down, forces scope_change', () => {
  for (const priceDelta of [1, -1, 50000, -50000]) {
    assert.equal(decideSteering(input({ classified: 'revision', priceDelta })).kind, 'scope_change', String(priceDelta));
    assert.equal(decideSteering(input({ classified: 'revision', priceDelta })).consumesCredit, false);
  }
});

test('any deadline change, earlier or later, forces scope_change', () => {
  for (const deadlineDelta of [1, -1, 86_400_000]) {
    assert.equal(decideSteering(input({ deadlineDelta })).kind, 'scope_change', String(deadlineDelta));
    assert.equal(decideSteering(input({ deadlineDelta })).requiresApproval, true);
  }
});

test('non-finite deltas are treated as a change (fail safe)', () => {
  assert.equal(decideSteering(input({ priceDelta: Number.NaN })).kind, 'scope_change');
  assert.equal(decideSteering(input({ deadlineDelta: Number.POSITIVE_INFINITY })).kind, 'scope_change');
});

test('an unknown classifier kind is treated as a scope change (fail safe)', () => {
  assert.deepEqual(decideSteering(input({ classified: 'make_it_pop' as never })), {
    kind: 'scope_change', consumesCredit: false, requiresApproval: true,
  });
});

test('initialSteeringStatus', () => {
  const clar = { kind: 'clarification', consumesCredit: false, requiresApproval: false } as const;
  const rev = { kind: 'revision', consumesCredit: true, requiresApproval: false } as const;
  const scope = { kind: 'scope_change', consumesCredit: false, requiresApproval: true } as const;
  assert.equal(initialSteeringStatus(clar, false), 'open');
  assert.equal(initialSteeringStatus(clar, true), 'open');
  assert.equal(initialSteeringStatus(rev, false), 'open');
  assert.equal(initialSteeringStatus(scope, false), 'awaiting_estimate');
  assert.equal(initialSteeringStatus(scope, true), 'awaiting_provider');
});

test('pausesWork: only an unresolved or unpaid scope change pauses work', () => {
  for (const status of ['awaiting_estimate', 'awaiting_provider', 'awaiting_approval'] as const) {
    assert.equal(pausesWork({ kind: 'scope_change', status, topup_status: 'none' }), true, status);
  }
  assert.equal(pausesWork({ kind: 'scope_change', status: 'approved', topup_status: 'pending' }), true);
  assert.equal(pausesWork({ kind: 'scope_change', status: 'approved', topup_status: 'paid' }), false);
  assert.equal(pausesWork({ kind: 'scope_change', status: 'approved', topup_status: 'none' }), false);
  for (const status of ['rejected', 'declined', 'cancelled'] as const) {
    assert.equal(pausesWork({ kind: 'scope_change', status, topup_status: 'none' }), false, status);
  }
  assert.equal(pausesWork({ kind: 'revision', status: 'open', topup_status: 'none' }), false);
  assert.equal(pausesWork({ kind: 'clarification', status: 'open', topup_status: 'none' }), false);
  // an unpaid top-up only pauses an approved scope change
  assert.equal(pausesWork({ kind: 'scope_change', status: 'rejected', topup_status: 'pending' }), false);
  assert.equal(pausesWork({ kind: 'scope_change', status: 'declined', topup_status: 'pending' }), false);
  // a non-scope request never pauses, even with odd data
  assert.equal(pausesWork({ kind: 'revision', status: 'approved', topup_status: 'pending' }), false);
});

test('topupAmountCents is the increase in customer total, never negative', () => {
  assert.equal(topupAmountCents(34500, 46000), 11500);
  assert.equal(topupAmountCents(34500, 34500), 0);
  assert.equal(topupAmountCents(34500, 23000), 0);
});

test('remainingCredits never goes below zero', () => {
  assert.equal(remainingCredits(2, 0), 2);
  assert.equal(remainingCredits(2, 1), 1);
  assert.equal(remainingCredits(2, 2), 0);
  assert.equal(remainingCredits(2, 5), 0);
  assert.equal(remainingCredits(0, 0), 0);
});

test('buildClassifierPrompt lays out terms then the message, one item per line', () => {
  assert.equal(
    buildClassifierPrompt({ message: 'Add XLSX', requirements: ['R1', 'R2'], deliverables: ['D1'], priceCents: 500, deadline: null }),
    ['Agreed requirements:', '- R1', '- R2', 'Agreed deliverables:', '- D1', 'Agreed price (cents): 500', 'Agreed deadline: none', '', 'Customer message:', 'Add XLSX'].join('\n'),
  );
});

test('buildClassifierPrompt carries the request and the current terms', () => {
  const p = buildClassifierPrompt({
    message: 'Please also add CSV export',
    requirements: ['Import CSV'],
    deliverables: ['Repo'],
    priceCents: 30000,
    deadline: '2026-12-01T00:00:00.000Z',
  });
  assert.match(p, /Please also add CSV export/);
  assert.match(p, /Import CSV/);
  assert.match(p, /Repo/);
  assert.match(p, /30000/);
  assert.match(p, /2026-12-01/);
});
