import { describe, expect, it } from 'vitest';
import {
  applySpecChanges,
  classifierChargeUsd,
  nextCreditCount,
  pausesWork,
  planRefund,
  progressEmailCutoff,
  refundAmountCents,
  ruleClassifySteering,
  settleCreditClaim,
  topupRegenerable,
  type SteeringDecision,
} from '@/src/lib/jobs/steering';
import { budgetFilterClauses, budgetOverlaps } from '@/src/lib/jobs/budget-filter';

describe('ruleClassifySteering (no AI, or no balance for it)', () => {
  it('uses the kind the customer picked', () => {
    expect(ruleClassifySteering('Please add an export', 'clarification')).toBe('clarification');
    expect(ruleClassifySteering('Which DB?', 'scope_change')).toBe('scope_change');
    expect(ruleClassifySteering('Which DB?', 'revision')).toBe('revision');
  });

  it('reads scope words as a scope change', () => {
    for (const m of [
      'Can you also export to Excel?',
      'Please ADD a login page',
      'Add-on: an admin view',
      'We need an extra report',
      'Remove the CSV step',
      'Integrate with Slack',
      'Extend it to handle XML',
      'One more page with charts',
      'Support for German, please',
      'Please make it a new feature flag',
    ]) {
      expect(ruleClassifySteering(m), m).toBe('scope_change');
    }
  });

  it('reads rework words as a revision', () => {
    for (const m of ['Please fix the header', 'Redo the logo', 'Adjust the spacing', 'Tweak the copy', 'Rename the column', 'Correct the typo', 'The total is wrong']) {
      expect(ruleClassifySteering(m), m).toBe('revision');
    }
  });

  it('prefers a scope change when both kinds of words appear', () => {
    expect(ruleClassifySteering('Fix the header and add a footer')).toBe('scope_change');
  });

  it('treats anything else as a clarification', () => {
    expect(ruleClassifySteering('Which Postgres version do you target?')).toBe('clarification');
    expect(ruleClassifySteering('Thanks, looks great')).toBe('clarification');
    expect(ruleClassifySteering('')).toBe('clarification');
    // whole words only: "address" is not "add", "prefix" is not "fix"
    expect(ruleClassifySteering('What address and prefix do you use?')).toBe('clarification');
  });
});

describe('classifierChargeUsd', () => {
  it('is the metered cost times the markup, rounded up to a millionth of a dollar', () => {
    expect(classifierChargeUsd(0.001, 1.3)).toBe(0.0013);
    expect(classifierChargeUsd(0.0000011, 1.3)).toBe(0.000002);
    expect(classifierChargeUsd(0.000001, 1)).toBe(0.000001);
  });
  it('is zero for free or invalid costs', () => {
    expect(classifierChargeUsd(0, 1.3)).toBe(0);
    expect(classifierChargeUsd(-1, 1.3)).toBe(0);
    expect(classifierChargeUsd(Number.NaN, 1.3)).toBe(0);
  });
});

describe('steering credit race helpers', () => {
  const revision: SteeringDecision = { kind: 'revision', consumesCredit: true, requiresApproval: false };
  const clarification: SteeringDecision = { kind: 'clarification', consumesCredit: false, requiresApproval: false };

  it('nextCreditCount: the next used-count, or null when none is left', () => {
    expect(nextCreditCount(0, 3)).toBe(1);
    expect(nextCreditCount(2, 3)).toBe(3);
    expect(nextCreditCount(3, 3)).toBeNull();
    expect(nextCreditCount(4, 3)).toBeNull();
    expect(nextCreditCount(0, 0)).toBeNull();
  });

  it('settleCreditClaim keeps a revision that got its credit', () => {
    expect(settleCreditClaim(revision, true)).toEqual(revision);
  });

  it('settleCreditClaim turns a revision that lost the race into a scope change', () => {
    expect(settleCreditClaim(revision, false)).toEqual({ kind: 'scope_change', consumesCredit: false, requiresApproval: true });
  });

  it('settleCreditClaim leaves decisions without a credit alone', () => {
    expect(settleCreditClaim(clarification, false)).toEqual(clarification);
    expect(settleCreditClaim(clarification, true)).toEqual(clarification);
  });
});

describe('refunds on a price decrease', () => {
  it('refundAmountCents is the drop in the customer total', () => {
    expect(refundAmountCents(34500, 28750)).toBe(5750);
    expect(refundAmountCents(34500, 34500)).toBe(0);
    expect(refundAmountCents(34500, 40250)).toBe(0);
  });

  const pay = (id: string, amount: number, refunded = 0, status = 'succeeded', pi: string | null = `pi_${id}`) => ({
    id,
    stripe_payment_intent_id: pi,
    amount_cents: amount,
    amount_refunded_cents: refunded,
    status,
    created_at: `2026-10-0${id.length}T00:00:00Z`,
  });

  it('refunds from the newest refundable payment first', () => {
    expect(planRefund([pay('a', 34500), pay('bb', 5750)], 5000)).toEqual({ parts: [{ paymentId: 'bb', paymentIntentId: 'pi_bb', amountCents: 5000 }], leftoverCents: 0 });
  });

  it('splits over several payments and reports what cannot be refunded', () => {
    expect(planRefund([pay('a', 1000, 400), pay('bb', 500)], 2000)).toEqual({
      parts: [
        { paymentId: 'bb', paymentIntentId: 'pi_bb', amountCents: 500 },
        { paymentId: 'a', paymentIntentId: 'pi_a', amountCents: 600 },
      ],
      leftoverCents: 900,
    });
  });

  it('skips payments that are not refundable', () => {
    const r = planRefund(
      [pay('a', 1000, 0, 'pending'), pay('bb', 1000, 1000, 'refunded'), pay('ccc', 1000, 0, 'succeeded', null), pay('dddd', 1000, 0, 'disputed'), pay('eeeee', 1000, 200, 'partially_refunded')],
      500,
    );
    expect(r).toEqual({ parts: [{ paymentId: 'eeeee', paymentIntentId: 'pi_eeeee', amountCents: 500 }], leftoverCents: 0 });
  });

  it('with no payment everything is left over (credited at payout)', () => {
    expect(planRefund([], 5750)).toEqual({ parts: [], leftoverCents: 5750 });
    expect(planRefund([pay('a', 1000)], 0)).toEqual({ parts: [], leftoverCents: 0 });
  });
});

describe('top-up checkout', () => {
  const s = (status: string, topup_status: string) => ({ kind: 'scope_change' as const, status: status as never, topup_status: topup_status as never });

  it('can be regenerated while an approved top-up is unpaid', () => {
    expect(topupRegenerable(s('approved', 'expired'))).toBe(true);
    expect(topupRegenerable(s('approved', 'pending'))).toBe(true);
    expect(topupRegenerable(s('approved', 'paid'))).toBe(false);
    expect(topupRegenerable(s('approved', 'none'))).toBe(false);
    expect(topupRegenerable(s('awaiting_approval', 'pending'))).toBe(false);
  });

  it('an expired top-up keeps the work paused', () => {
    expect(pausesWork(s('approved', 'expired'))).toBe(true);
    expect(pausesWork(s('approved', 'pending'))).toBe(true);
    expect(pausesWork(s('approved', 'paid'))).toBe(false);
  });
});

describe('applySpecChanges', () => {
  const base = { requirements: ['Import CSV'], deliverables: ['Pull request'] };

  it('appends new requirements and deliverables, trimmed and without duplicates', () => {
    expect(applySpecChanges(base, { specChanges: ['  Export to Excel ', '', 'Import CSV', 'Export to Excel'], deliverableChanges: ['README', 'Pull request'] })).toEqual({
      requirements: ['Import CSV', 'Export to Excel'],
      deliverables: ['Pull request', 'README'],
    });
  });

  it('returns null when nothing changes', () => {
    expect(applySpecChanges(base, { specChanges: [], deliverableChanges: [] })).toBeNull();
    expect(applySpecChanges(base, { specChanges: ['Import CSV', ' '], deliverableChanges: ['Pull request'] })).toBeNull();
  });

  it('does not mutate the base spec', () => {
    applySpecChanges(base, { specChanges: ['X'], deliverableChanges: ['Y'] });
    expect(base).toEqual({ requirements: ['Import CSV'], deliverables: ['Pull request'] });
  });
});

describe('progressEmailCutoff', () => {
  it('is one hour before now', () => {
    expect(progressEmailCutoff(new Date('2026-10-12T10:30:00.000Z'))).toBe('2026-10-12T09:30:00.000Z');
  });
});

describe('budget filter (price range overlap)', () => {
  const job = (min: number | null, max: number | null) => ({ budget_min_cents: min, budget_max_cents: max });

  it('without a filter every job matches', () => {
    expect(budgetOverlaps(job(null, null), {})).toBe(true);
    expect(budgetOverlaps(job(100, 200), { min: null, max: null })).toBe(true);
  });

  it('treats an open maximum as unbounded ("From €500" matches min 450 and min 600)', () => {
    expect(budgetOverlaps(job(50000, null), { min: 45000 })).toBe(true);
    expect(budgetOverlaps(job(50000, null), { min: 60000 })).toBe(true);
    expect(budgetOverlaps(job(50000, null), { max: 40000 })).toBe(false);
    expect(budgetOverlaps(job(50000, null), { max: 50000 })).toBe(true);
  });

  it('treats an open minimum as zero ("Up to €400")', () => {
    expect(budgetOverlaps(job(null, 40000), { max: 25000 })).toBe(true);
    expect(budgetOverlaps(job(null, 40000), { min: 45000 })).toBe(false);
    expect(budgetOverlaps(job(null, 40000), { min: 40000 })).toBe(true);
  });

  it('overlaps closed ranges, inclusive at the edges', () => {
    expect(budgetOverlaps(job(20000, 40000), { min: 45000 })).toBe(false);
    expect(budgetOverlaps(job(20000, 40000), { min: 40000 })).toBe(true);
    expect(budgetOverlaps(job(20000, 40000), { max: 20000 })).toBe(true);
    expect(budgetOverlaps(job(20000, 40000), { max: 19999 })).toBe(false);
    expect(budgetOverlaps(job(20000, 40000), { min: 25000, max: 30000 })).toBe(true);
    expect(budgetOverlaps(job(30000, 30000), { min: 45000 })).toBe(false);
  });

  it('leaves jobs with no budget at all out of a price filter', () => {
    expect(budgetOverlaps(job(null, null), { min: 1 })).toBe(false);
    expect(budgetOverlaps(job(null, null), { max: 100000 })).toBe(false);
  });

  it('builds the matching PostgREST or-filters', () => {
    expect(budgetFilterClauses({})).toEqual([]);
    expect(budgetFilterClauses({ min: 45000 })).toEqual(['budget_max_cents.gte.45000,and(budget_max_cents.is.null,budget_min_cents.not.is.null)']);
    expect(budgetFilterClauses({ max: 25000 })).toEqual(['budget_min_cents.lte.25000,and(budget_min_cents.is.null,budget_max_cents.not.is.null)']);
    expect(budgetFilterClauses({ min: 1, max: 2 })).toHaveLength(2);
  });
});
