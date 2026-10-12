/** Edge cases for the job room's pure steering rules (several found by mutation testing). */
import { describe, expect, it } from 'vitest';
import { applySpecChanges, pausesWork, planRefund, ruleClassifySteering, topupRegenerable } from '@/src/lib/jobs/steering';

const s = (kind: string, status: string, topup_status: string) => ({ kind: kind as never, status: status as never, topup_status: topup_status as never });

describe('pausesWork and topupRegenerable', () => {
  it('pause only for scope changes: open ones always, approved ones while unpaid', () => {
    expect(pausesWork(s('revision', 'awaiting_estimate', 'pending'))).toBe(false);
    expect(pausesWork(s('scope_change', 'awaiting_estimate', 'none'))).toBe(true);
    expect(pausesWork(s('scope_change', 'awaiting_approval', 'none'))).toBe(true);
    expect(pausesWork(s('scope_change', 'rejected', 'pending'))).toBe(false);
    expect(pausesWork(s('scope_change', 'approved', 'none'))).toBe(false);
  });

  it('a top-up can only be regenerated on a scope change', () => {
    expect(topupRegenerable(s('revision', 'approved', 'expired'))).toBe(false);
  });
});

describe('planRefund', () => {
  const pay = (id: string, at: string, status = 'succeeded', pi: string | null = `pi_${id}`, refunded = 0, amount = 1000) => ({
    id,
    stripe_payment_intent_id: pi,
    amount_cents: amount,
    amount_refunded_cents: refunded,
    status,
    created_at: at,
  });

  it('ignores a non-refundable payment even when it is the newest', () => {
    const old = pay('old', '2026-10-01T00:00:00Z');
    for (const newest of [
      pay('n1', '2026-10-09T00:00:00Z', 'pending'),
      pay('n2', '2026-10-09T00:00:00Z', 'succeeded', null),
      pay('n3', '2026-10-09T00:00:00Z', 'succeeded', 'pi_n3', 1000),
    ]) {
      expect(planRefund([old, newest], 300)).toEqual({ parts: [{ paymentId: 'old', paymentIntentId: 'pi_old', amountCents: 300 }], leftoverCents: 0 });
    }
  });

  it('goes newest first whatever the input order', () => {
    const order = (ps: ReturnType<typeof pay>[]) => planRefund(ps, 3000).parts.map((p) => p.paymentId);
    const [a, b, c] = [pay('a', '2026-10-01'), pay('b', '2026-10-02'), pay('c', '2026-10-03')];
    expect(order([b, c, a])).toEqual(['c', 'b', 'a']);
    expect(order([a, b, c])).toEqual(['c', 'b', 'a']);
    expect(order([c, a, b])).toEqual(['c', 'b', 'a']);
  });
});

describe('applySpecChanges', () => {
  it('notices a change to either list alone', () => {
    const base = { requirements: ['A'], deliverables: ['B'] };
    expect(applySpecChanges(base, { specChanges: ['C'], deliverableChanges: [] })).toEqual({ requirements: ['A', 'C'], deliverables: ['B'] });
    expect(applySpecChanges(base, { specChanges: [], deliverableChanges: ['D'] })).toEqual({ requirements: ['A'], deliverables: ['B', 'D'] });
  });
});

describe('ruleClassifySteering word forms', () => {
  it.each(['Removing the export', 'An integration with Slack', 'Extending the parser', 'Adding a chart'])('%s → scope change', (m) => {
    expect(ruleClassifySteering(m)).toBe('scope_change');
  });
  it.each(['Adjusting the font', 'The copy needs tweaking', 'Renamed columns please', 'Corrected totals please', 'Polish the UI'])('%s → revision', (m) => {
    expect(ruleClassifySteering(m)).toBe('revision');
  });
});
