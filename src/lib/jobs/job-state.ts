/**
 * Allowed status transitions for jobs and contracts. Pure.
 *
 * Job:      draft → open (spec approved) → awarded (bid accepted, awaiting payment)
 *           → in_progress (paid) → delivered → completed.
 *           awarded → open when the checkout expires; disputes and cancellation per table.
 * Contract: pending_payment → active (paid) → in_qa (send_project) → delivered (QA validated)
 *           → completed, with rework (QA requires changes), disputed (QA rejected),
 *           cancelled and refunded branches. `submitted` is the pre-QA path, kept for compatibility.
 */

export const JOB_STATUSES = [
  'draft',
  'open',
  'awarded',
  'in_progress',
  'delivered',
  'completed',
  'cancelled',
  'disputed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const CONTRACT_STATUSES = [
  'pending_payment',
  'active',
  'submitted',
  'in_qa',
  'rework',
  'delivered',
  'completed',
  'disputed',
  'cancelled',
  'refunded',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  draft: ['open', 'cancelled'],
  open: ['awarded', 'cancelled'],
  awarded: ['in_progress', 'open', 'cancelled'],
  in_progress: ['delivered', 'disputed', 'cancelled'],
  delivered: ['completed', 'in_progress', 'disputed'],
  disputed: ['in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const CONTRACT_TRANSITIONS: Readonly<Record<ContractStatus, readonly ContractStatus[]>> = {
  pending_payment: ['active', 'cancelled'],
  active: ['submitted', 'in_qa', 'disputed', 'cancelled', 'refunded'],
  submitted: ['rework', 'delivered', 'disputed', 'refunded'],
  in_qa: ['delivered', 'rework', 'disputed', 'refunded'],
  rework: ['submitted', 'in_qa', 'disputed', 'cancelled', 'refunded'],
  delivered: ['completed', 'disputed', 'refunded'],
  disputed: ['active', 'completed', 'refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
};

export class InvalidTransitionError extends Error {
  readonly entity: 'job' | 'contract';
  readonly from: string;
  readonly to: string;

  constructor(entity: 'job' | 'contract', from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

function lookup<S extends string>(table: Readonly<Record<S, readonly S[]>>, from: S): readonly S[] {
  return Object.prototype.hasOwnProperty.call(table, from) ? table[from] : [];
}

export function nextJobStatuses(from: JobStatus): readonly JobStatus[] {
  return lookup(JOB_TRANSITIONS, from);
}

export function nextContractStatuses(from: ContractStatus): readonly ContractStatus[] {
  return lookup(CONTRACT_TRANSITIONS, from);
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return nextJobStatuses(from).includes(to);
}

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return nextContractStatuses(from).includes(to);
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return nextJobStatuses(status).length === 0;
}

export function isTerminalContractStatus(status: ContractStatus): boolean {
  return nextContractStatuses(status).length === 0;
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) throw new InvalidTransitionError('job', from, to);
}

export function assertContractTransition(from: ContractStatus, to: ContractStatus): void {
  if (!canTransitionContract(from, to)) throw new InvalidTransitionError('contract', from, to);
}
