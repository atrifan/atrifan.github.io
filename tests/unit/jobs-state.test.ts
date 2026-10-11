import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_STATUSES,
  CONTRACT_STATUSES,
  canTransitionJob,
  canTransitionContract,
  assertJobTransition,
  assertContractTransition,
  nextJobStatuses,
  nextContractStatuses,
  isTerminalJobStatus,
  isTerminalContractStatus,
  InvalidTransitionError,
} from '../../src/lib/jobs/job-state.ts';

const JOB_ALLOWED: Record<string, string[]> = {
  draft: ['open', 'cancelled'],
  open: ['awarded', 'cancelled'],
  awarded: ['in_progress', 'open', 'cancelled'],
  in_progress: ['delivered', 'disputed', 'cancelled'],
  delivered: ['completed', 'in_progress', 'disputed'],
  disputed: ['in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const CONTRACT_ALLOWED: Record<string, string[]> = {
  pending_payment: ['active', 'cancelled'],
  active: ['submitted', 'disputed', 'cancelled', 'refunded'],
  submitted: ['rework', 'delivered', 'disputed', 'refunded'],
  rework: ['submitted', 'disputed', 'cancelled', 'refunded'],
  delivered: ['completed', 'disputed', 'refunded'],
  disputed: ['active', 'completed', 'refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
};

test('job statuses are exactly the documented set', () => {
  assert.deepEqual([...JOB_STATUSES].sort(), Object.keys(JOB_ALLOWED).sort());
});

test('contract statuses are exactly the documented set', () => {
  assert.deepEqual([...CONTRACT_STATUSES].sort(), Object.keys(CONTRACT_ALLOWED).sort());
});

test('every job transition pair matches the table', () => {
  for (const from of JOB_STATUSES) {
    for (const to of JOB_STATUSES) {
      assert.equal(canTransitionJob(from, to), JOB_ALLOWED[from].includes(to), `${from} -> ${to}`);
    }
  }
});

test('every contract transition pair matches the table', () => {
  for (const from of CONTRACT_STATUSES) {
    for (const to of CONTRACT_STATUSES) {
      assert.equal(canTransitionContract(from, to), CONTRACT_ALLOWED[from].includes(to), `${from} -> ${to}`);
    }
  }
});

test('next statuses list the allowed targets', () => {
  assert.deepEqual([...nextJobStatuses('draft')].sort(), ['cancelled', 'open']);
  assert.deepEqual([...nextContractStatuses('pending_payment')].sort(), ['active', 'cancelled']);
  assert.deepEqual([...nextJobStatuses('completed')], []);
});

test('unknown statuses never transition', () => {
  assert.equal(canTransitionJob('nope' as never, 'open'), false);
  assert.equal(canTransitionJob('draft', 'nope' as never), false);
  assert.equal(canTransitionContract('nope' as never, 'active'), false);
  assert.deepEqual([...nextJobStatuses('nope' as never)], []);
  assert.deepEqual([...nextContractStatuses('nope' as never)], []);
});

test('terminal statuses', () => {
  for (const s of JOB_STATUSES) {
    assert.equal(isTerminalJobStatus(s), JOB_ALLOWED[s].length === 0, s);
  }
  for (const s of CONTRACT_STATUSES) {
    assert.equal(isTerminalContractStatus(s), CONTRACT_ALLOWED[s].length === 0, s);
  }
});

test('assert helpers throw a typed error naming the transition', () => {
  assert.doesNotThrow(() => assertJobTransition('draft', 'open'));
  assert.doesNotThrow(() => assertContractTransition('pending_payment', 'active'));
  assert.throws(
    () => assertJobTransition('draft', 'in_progress'),
    (err: unknown) =>
      err instanceof InvalidTransitionError &&
      err.name === 'InvalidTransitionError' &&
      err.entity === 'job' &&
      err.from === 'draft' &&
      err.to === 'in_progress' &&
      err.message === 'Invalid job transition: draft -> in_progress',
  );
  assert.throws(
    () => assertContractTransition('completed', 'active'),
    (err: unknown) =>
      err instanceof InvalidTransitionError &&
      err.entity === 'contract' &&
      err.message === 'Invalid contract transition: completed -> active',
  );
});
