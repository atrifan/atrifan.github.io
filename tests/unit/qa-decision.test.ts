import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideQaVerdict,
  isQaVerdict,
  QA_VERDICTS,
  QaDecisionError,
  isOpenSubmissionStatus,
  type QaDecisionInput,
} from '../../src/lib/qa/qa-decision.ts';
import { canTransitionContract } from '../../src/lib/jobs/job-state.ts';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const base: QaDecisionInput = {
  verdict: 'validated',
  reason: null,
  submissionStatus: 'in_review',
  contractStatus: 'in_qa',
  attempt: 1,
  now: NOW,
  autoAcceptDays: 7,
};

const types = (effects: { type: string }[]) => effects.map((e) => e.type);

test('verdicts are validated, requires_changes and rejected', () => {
  assert.deepEqual([...QA_VERDICTS], ['validated', 'requires_changes', 'rejected']);
  for (const v of QA_VERDICTS) assert.equal(isQaVerdict(v), true);
  for (const v of ['pass', '', null, 1, 'VALIDATED']) assert.equal(isQaVerdict(v), false);
});

test('only awaiting_qa and in_review submissions are open', () => {
  assert.equal(isOpenSubmissionStatus('awaiting_qa'), true);
  assert.equal(isOpenSubmissionStatus('in_review'), true);
  for (const s of ['validated', 'requires_changes', 'rejected']) assert.equal(isOpenSubmissionStatus(s), false);
});

test('validated: delivered, delivery unlocked, auto-accept clock starts, customer told delivery is ready', () => {
  const d = decideQaVerdict({ ...base, reason: '  looks good  ' });
  assert.equal(d.verdict, 'validated');
  assert.equal(d.submissionTo, 'validated');
  assert.equal(d.contractTo, 'delivered');
  assert.equal(d.jobTo, 'delivered');
  assert.equal(d.reason, 'looks good');
  assert.equal(d.usesSteeringCredit, false);
  assert.deepEqual(d.effects, [
    { type: 'unlock_delivery' },
    { type: 'start_auto_accept', autoAcceptAt: '2026-10-19T10:00:00.000Z' },
    { type: 'notify', to: 'customer', notification: 'qa_verdict', verdict: 'pass' },
    { type: 'notify', to: 'provider', notification: 'qa_verdict', verdict: 'pass' },
    { type: 'notify', to: 'customer', notification: 'delivery_ready' },
    { type: 'revoke_review_key' },
    { type: 'settle_credits' },
  ]);
});

test('validated without a reason is fine (reason becomes null)', () => {
  assert.equal(decideQaVerdict({ ...base, reason: undefined }).reason, null);
  assert.equal(decideQaVerdict({ ...base, reason: '   ' }).reason, null);
});

test('auto-accept uses JOBS_AUTO_ACCEPT_DAYS', () => {
  const d = decideQaVerdict({ ...base, autoAcceptDays: 1 });
  assert.deepEqual(d.effects.find((e) => e.type === 'start_auto_accept'), { type: 'start_auto_accept', autoAcceptAt: '2026-10-13T10:00:00.000Z' });
});

test('requires_changes: rework, resubmission allowed as attempt+1, no steering credit used', () => {
  const d = decideQaVerdict({ ...base, verdict: 'requires_changes', reason: 'Tests fail on Node 24', attempt: 2, submissionStatus: 'awaiting_qa' });
  assert.equal(d.submissionTo, 'requires_changes');
  assert.equal(d.contractTo, 'rework');
  assert.equal(d.jobTo, null);
  assert.equal(d.usesSteeringCredit, false);
  assert.equal(d.reason, 'Tests fail on Node 24');
  assert.deepEqual(d.effects, [
    { type: 'allow_resubmission', nextAttempt: 3 },
    { type: 'notify', to: 'customer', notification: 'qa_verdict', verdict: 'needs_changes' },
    { type: 'notify', to: 'provider', notification: 'qa_verdict', verdict: 'needs_changes' },
    { type: 'revoke_review_key' },
    { type: 'settle_credits' },
  ]);
});

test('rejected: disputed with a full refund pending admin confirmation, and a QA-failure trust mark', () => {
  const d = decideQaVerdict({ ...base, verdict: 'rejected', reason: 'Not the requested software' });
  assert.equal(d.submissionTo, 'rejected');
  assert.equal(d.contractTo, 'disputed');
  assert.equal(d.jobTo, 'disputed');
  assert.deepEqual(d.effects, [
    { type: 'open_dispute', defaultResolution: 'full_refund', resolutionStatus: 'pending_admin_confirmation' },
    { type: 'trust_mark', mark: 'qa_failure' },
    { type: 'notify', to: 'customer', notification: 'qa_verdict', verdict: 'fail' },
    { type: 'notify', to: 'provider', notification: 'qa_verdict', verdict: 'fail' },
    { type: 'revoke_review_key' },
    { type: 'settle_credits' },
  ]);
});

test('a reason is required for requires_changes and rejected', () => {
  for (const verdict of ['requires_changes', 'rejected'] as const) {
    for (const reason of [null, undefined, '', '   ']) {
      assert.throws(() => decideQaVerdict({ ...base, verdict, reason }), (e: unknown) =>
        e instanceof QaDecisionError && e.code === 'reason_required');
    }
  }
});

test('unknown verdicts are rejected', () => {
  for (const verdict of ['pass', 'approve', '', null]) {
    assert.throws(() => decideQaVerdict({ ...base, verdict: verdict as never, reason: 'x' }), (e: unknown) =>
      e instanceof QaDecisionError && e.code === 'invalid_verdict');
  }
});

test('only open submissions on a contract in QA can be marked', () => {
  for (const submissionStatus of ['validated', 'requires_changes', 'rejected'] as const) {
    assert.throws(() => decideQaVerdict({ ...base, submissionStatus }), (e: unknown) =>
      e instanceof QaDecisionError && e.code === 'invalid_state');
  }
  for (const contractStatus of ['active', 'rework', 'delivered', 'disputed', 'completed'] as const) {
    assert.throws(() => decideQaVerdict({ ...base, contractStatus }), (e: unknown) =>
      e instanceof QaDecisionError && e.code === 'invalid_state');
  }
  assert.equal(decideQaVerdict({ ...base, submissionStatus: 'awaiting_qa' }).submissionTo, 'validated');
});

test('every verdict maps to an allowed contract transition from in_qa', () => {
  for (const verdict of QA_VERDICTS) {
    const d = decideQaVerdict({ ...base, verdict, reason: 'because' });
    assert.ok(canTransitionContract('in_qa', d.contractTo), `${verdict} -> ${d.contractTo}`);
  }
});

test('the reason is capped and errors carry a readable message', () => {
  const long = 'x'.repeat(5000);
  assert.equal(decideQaVerdict({ ...base, verdict: 'rejected', reason: long }).reason?.length, 4000);
  try {
    decideQaVerdict({ ...base, verdict: 'rejected', reason: '' });
  } catch (e) {
    assert.ok(e instanceof QaDecisionError);
    assert.match((e as Error).message, /reason/i);
    assert.equal((e as Error).name, 'QaDecisionError');
  }
});
