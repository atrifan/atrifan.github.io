/**
 * Steering requests: persistence and flows around the pure rules in steering.ts.
 *
 *   customer asks ──► classify (LLM) ──► decideSteering ──► clarification / revision: open
 *                                                       └─► scope_change: awaiting_estimate
 *                                                           (or awaiting_provider with the
 *                                                            customer's proposed terms)
 *   provider answers (clarification → answered, revision → resolved)
 *   provider re-estimates a scope change ──► new contract version ──► awaiting_approval
 *   customer approves ──► version becomes current; a price increase opens a top-up Checkout
 *   provider accepts the customer's proposed version ──► same as approval
 *   customer rejects / provider declines ──► work resumes on the current version
 */
import { jobsDb } from './db';
import { JobsError, dbError, isUniqueViolation, notFound } from './errors';
import { isUuid, loadJob, loadSpecVersion } from './jobs-service';
import { contractCheckoutUrls, loadContractVersion } from './contracts-service';
import { ensureUserPrincipal } from './principals';
import { computeCommission } from './commission';
import { buildTopupCheckoutParams } from './checkout-params';
import { getStripe, stripeFailure } from './stripe';
import { notifyUser, excerpt } from './notifications';
import {
  classifySteering,
  decideSteering,
  initialSteeringStatus,
  topupAmountCents,
  type SteeringDecision,
  type SteeringStatus,
} from './steering';
import {
  getContractForParty,
  listSteeringRows,
  postSteeringReply,
  recordActivity,
  requireRole,
  requireWorking,
  steeringCredits,
  type Actor,
} from './room-service';
import { parseTimeCursor, type CreateSteeringInput, type SteeringListInput, type SteeringRespondInput } from './room-schemas';
import type { ContractRow, ContractVersionRow, SteeringRequestRow } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_SCOPE: readonly SteeringStatus[] = ['awaiting_estimate', 'awaiting_provider', 'awaiting_approval'];

async function loadSteering(id: string): Promise<SteeringRequestRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await jobsDb().from('steering_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'load steering');
  return data as SteeringRequestRow | null;
}

async function currentVersionOf(contract: ContractRow): Promise<ContractVersionRow> {
  const v = contract.current_version_id ? await loadContractVersion(contract.current_version_id) : null;
  if (!v) throw new JobsError('invalid_state', 409, 'The contract has no current version');
  return v;
}

/** Guarded status change; throws invalid_state if the request moved meanwhile. */
async function updateSteering(
  s: SteeringRequestRow,
  from: readonly SteeringStatus[],
  changes: Partial<SteeringRequestRow>,
): Promise<SteeringRequestRow> {
  const { data, error } = await jobsDb()
    .from('steering_requests')
    .update(changes)
    .eq('id', s.id)
    .in('status', from as SteeringStatus[])
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'update steering');
  if (!data) throw new JobsError('invalid_state', 409, 'This steering request changed; reload and try again');
  return data as SteeringRequestRow;
}

/** Next contract version from `base` with new terms, signed by whoever proposes it. */
async function createVersion(
  contract: ContractRow,
  base: ContractVersionRow,
  terms: { priceCents: number; deadline: string | null; signedBy: 'customer' | 'provider' },
): Promise<ContractVersionRow> {
  const breakdown = computeCommission(terms.priceCents, base.commission_bps);
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest, error: latestError } = await jobsDb()
      .from('contract_versions')
      .select('version')
      .eq('contract_id', contract.id)
      .order('version', { ascending: false })
      .limit(1)
      .single();
    if (latestError) throw dbError(latestError, 'latest contract version');
    const { data, error } = await jobsDb()
      .from('contract_versions')
      .insert({
        contract_id: contract.id,
        user_id: contract.customer_user_id,
        version: (latest as { version: number }).version + 1,
        spec_version_id: base.spec_version_id,
        price_cents: breakdown.bidCents,
        commission_bps: breakdown.commissionBps,
        fee_cents: breakdown.feeCents,
        customer_total_cents: breakdown.customerTotalCents,
        currency: base.currency,
        deadline: terms.deadline,
        steering_allowance: base.steering_allowance,
        qa_checks: base.qa_checks ?? null,
        signed_by_customer_at: terms.signedBy === 'customer' ? now : null,
        signed_by_provider_at: terms.signedBy === 'provider' ? now : null,
      })
      .select('*')
      .single();
    if (!error) return data as ContractVersionRow;
    if (!isUniqueViolation(error)) throw dbError(error, 'create contract version');
  }
  throw new JobsError('invalid_state', 409, 'Concurrent contract changes; try again');
}

function deltaMs(proposed: string | undefined, current: string | null): number {
  if (proposed === undefined) return 0;
  return Date.parse(proposed) - (current ? Date.parse(current) : Number.NaN);
}

export interface CreatedSteering {
  steering: SteeringRequestRow;
  decision: SteeringDecision;
}

/** The customer asks for something while the work runs. */
export async function createSteeringRequest(userId: string, contractId: string, input: CreateSteeringInput): Promise<CreatedSteering> {
  const pc = await getContractForParty(userId, contractId);
  requireRole(pc, 'customer', 'create steering requests');
  requireWorking(pc.contract);
  const { contract } = pc;
  const [current, existing, job] = await Promise.all([currentVersionOf(contract), listSteeringRows(contract.id), loadJob(contract.job_id)]);
  const spec = await loadSpecVersion(current.spec_version_id);

  const classifier = await classifySteering(
    {
      message: input.message,
      requirements: spec?.requirements ?? [],
      deliverables: spec?.deliverables ?? [],
      priceCents: current.price_cents,
      deadline: current.deadline,
    },
    { userId, requestedKind: input.requested_kind },
  );
  const decision = decideSteering({
    classified: classifier.kind,
    specDiff: input.spec_changes ?? [],
    priceDelta: input.price_cents !== undefined ? input.price_cents - current.price_cents : 0,
    deadlineDelta: deltaMs(input.deadline, current.deadline),
    remainingSteeringCredits: steeringCredits(current, existing).remaining,
  });
  const proposesTerms = input.price_cents !== undefined || input.deadline !== undefined;
  const status = initialSteeringStatus(decision, proposesTerms);

  if (decision.kind === 'scope_change' && existing.some((s) => s.kind === 'scope_change' && OPEN_SCOPE.includes(s.status))) {
    throw new JobsError('invalid_state', 409, 'A scope change is already pending on this contract; resolve it first');
  }

  const proposal =
    status === 'awaiting_provider'
      ? await createVersion(contract, current, {
          priceCents: input.price_cents ?? current.price_cents,
          deadline: input.deadline ?? current.deadline,
          signedBy: 'customer',
        })
      : null;

  const principal = await ensureUserPrincipal(userId);
  const { data, error } = await jobsDb()
    .from('steering_requests')
    .insert({
      contract_id: contract.id,
      user_id: userId,
      requested_by_principal_id: principal.id,
      message: input.message,
      requested_kind: input.requested_kind ?? null,
      kind: decision.kind,
      classifier_output: classifier,
      credit_cost: decision.consumesCredit ? 1 : 0,
      spec_changes: input.spec_changes ?? [],
      proposed_price_cents: input.price_cents ?? null,
      proposed_deadline: input.deadline ?? null,
      status,
      base_contract_version_id: current.id,
      new_contract_version_id: proposal?.id ?? null,
    })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new JobsError('invalid_state', 409, 'A scope change is already pending on this contract; resolve it first');
    throw dbError(error, 'create steering');
  }
  const steering = data as SteeringRequestRow;
  await recordActivity(contract.id, { userId, role: 'customer' }, 'steering_requested', `Customer asked for a ${decision.kind.replace('_', ' ')}`, {
    steering_id: steering.id,
    kind: decision.kind,
    status,
  });

  const notice = { jobId: contract.job_id, jobTitle: job?.title ?? 'your contract', contractId: contract.id, requestedBy: 'Your customer', summary: excerpt(input.message) };
  if (status === 'awaiting_provider' && proposal) {
    await notifyUser(contract.provider_user_id, 'scope_change_awaiting_approval', {
      ...notice,
      priceDeltaCents: proposal.price_cents - current.price_cents,
      currency: current.currency,
    }, `scope_change_awaiting_approval:${steering.id}:provider`);
  } else {
    await notifyUser(contract.provider_user_id, 'steering_awaiting_approval', notice, `steering_awaiting_approval:${steering.id}`);
  }
  return { steering, decision };
}

export interface SteeringResponse {
  steering: SteeringRequestRow;
  new_contract_version?: ContractVersionRow;
}

/** The provider answers a request, re-estimates a scope change, or declines it. */
export async function respondSteering(userId: string, input: SteeringRespondInput, agentIdentityId: string | null): Promise<SteeringResponse> {
  const s = await loadSteering(input.steering_id);
  if (!s) throw notFound('Steering request not found');
  const pc = await getContractForParty(userId, s.contract_id);
  requireRole(pc, 'provider', 'respond to steering requests');
  const actor: Actor = { userId, role: 'provider', agentIdentityId };
  const now = new Date().toISOString();
  const answered = { response: input.response, responded_by: userId, responded_at: now };
  const isEstimate =
    input.estimate_delta_cents !== undefined || input.eta_days !== undefined || (input.deliverable_changes?.length ?? 0) > 0;
  const pendingScope = s.kind === 'scope_change' && (s.status === 'awaiting_estimate' || s.status === 'awaiting_provider');

  let result: SteeringResponse;
  if (input.decline) {
    if (!pendingScope) throw new JobsError('invalid_state', 409, 'Only a pending scope change can be declined');
    result = { steering: await updateSteering(s, [s.status], { ...answered, status: 'declined', decided_at: now }) };
  } else if (isEstimate) {
    if (!pendingScope) throw new JobsError('invalid_state', 409, 'Only a pending scope change can be re-estimated');
    requireWorking(pc.contract);
    const base = await loadContractVersion(s.base_contract_version_id);
    if (!base) throw new JobsError('invalid_state', 409, 'The base contract version is missing');
    const delta = input.estimate_delta_cents ?? (s.proposed_price_cents != null ? s.proposed_price_cents - base.price_cents : 0);
    const priceCents = base.price_cents + delta;
    if (priceCents <= 0) throw new JobsError('invalid_request', 400, 'The new price must stay above zero');
    const deadline = input.eta_days !== undefined
      ? new Date(Date.now() + input.eta_days * DAY_MS).toISOString()
      : s.proposed_deadline ?? base.deadline;
    const version = await createVersion(pc.contract, base, { priceCents, deadline, signedBy: 'provider' });
    const steering = await updateSteering(s, [s.status], {
      ...answered,
      status: 'awaiting_approval',
      estimate_delta_cents: delta,
      estimate_eta_days: input.eta_days ?? null,
      deliverable_changes: input.deliverable_changes ?? [],
      new_contract_version_id: version.id,
    });
    const job = await loadJob(pc.contract.job_id);
    await notifyUser(pc.contract.customer_user_id, 'scope_change_awaiting_approval', {
      jobId: pc.contract.job_id,
      jobTitle: job?.title ?? 'your contract',
      contractId: pc.contract.id,
      requestedBy: 'Your provider',
      summary: excerpt(input.response),
      priceDeltaCents: delta,
      currency: base.currency,
    }, `scope_change_awaiting_approval:${s.id}:${version.id}`);
    result = { steering, new_contract_version: version };
  } else {
    if (s.kind === 'scope_change') {
      throw new JobsError('invalid_state', 409, 'A scope change needs an estimate (estimate_delta_cents and/or eta_days) or decline: true');
    }
    if (s.status !== 'open') throw new JobsError('invalid_state', 409, `This request is already ${s.status}`);
    const next: SteeringStatus = s.kind === 'clarification' ? 'answered' : 'resolved';
    result = { steering: await updateSteering(s, ['open'], { ...answered, status: next, decided_at: now }) };
  }

  await postSteeringReply(pc.contract.id, actor, input.response, s.id);
  await recordActivity(pc.contract.id, actor, 'steering_responded', `Provider ${result.steering.status === 'awaiting_approval' ? 're-estimated' : result.steering.status} a ${s.kind.replace('_', ' ')}`, {
    steering_id: s.id,
    status: result.steering.status,
    new_contract_version_id: result.new_contract_version?.id ?? null,
  });
  return result;
}

export interface AppliedVersion {
  steering: SteeringRequestRow;
  contract: ContractRow;
  version: ContractVersionRow;
  checkout_url?: string;
}

/** Make an agreed version current; a price increase opens a top-up Checkout. */
async function applyVersion(
  contract: ContractRow,
  s: SteeringRequestRow,
  version: ContractVersionRow,
  actor: Actor,
): Promise<AppliedVersion> {
  if (contract.current_version_id !== s.base_contract_version_id) {
    throw new JobsError('invalid_state', 409, 'The contract changed since this request was made');
  }
  const base = await loadContractVersion(s.base_contract_version_id);
  if (!base) throw new JobsError('invalid_state', 409, 'The base contract version is missing');
  const topup = topupAmountCents(base.customer_total_cents, version.customer_total_cents);

  let session: { id: string; url: string | null } | null = null;
  if (topup > 0) {
    const job = await loadJob(contract.job_id);
    const { successUrl, cancelUrl } = contractCheckoutUrls(contract.id);
    try {
      session = await getStripe().checkout.sessions.create(
        buildTopupCheckoutParams({
          contractId: contract.id,
          jobId: contract.job_id,
          steeringRequestId: s.id,
          contractVersionId: version.id,
          version: version.version,
          jobTitle: job?.title ?? 'Gig contract',
          amountCents: topup,
          currency: version.currency,
          successUrl,
          cancelUrl,
        }),
        { idempotencyKey: `steering_topup_${s.id}` },
      );
    } catch (err) {
      if (err instanceof JobsError) throw err;
      throw stripeFailure(err, 'top-up checkout session');
    }
    if (!session.url) throw stripeFailure(new Error('no url'), 'top-up checkout session');
  }

  const now = new Date().toISOString();
  const db = jobsDb();
  const signature = actor.role === 'customer' ? { signed_by_customer_at: now } : { signed_by_provider_at: now };
  const { data: signed, error: signError } = await db.from('contract_versions').update(signature).eq('id', version.id).select('*').single();
  if (signError) throw dbError(signError, 'sign contract version');

  const steering = await updateSteering(s, [s.status], {
    status: 'approved',
    decided_at: now,
    topup_amount_cents: topup,
    topup_status: topup > 0 ? 'pending' : 'none',
    topup_checkout_session_id: session?.id ?? null,
    topup_checkout_url: session?.url ?? null,
  });
  const { data: moved, error: moveError } = await db
    .from('contracts')
    .update({ current_version_id: version.id })
    .eq('id', contract.id)
    .eq('current_version_id', base.id)
    .select('*')
    .maybeSingle();
  if (moveError) throw dbError(moveError, 'adopt contract version');
  if (!moved) throw new JobsError('invalid_state', 409, 'The contract changed since this request was made');

  await recordActivity(contract.id, actor, 'scope_change_approved', `Contract version ${version.version} agreed${topup > 0 ? ', top-up payment pending' : ''}`, {
    steering_id: s.id,
    contract_version_id: version.id,
    topup_amount_cents: topup,
  });
  const out: AppliedVersion = { steering, contract: moved as ContractRow, version: signed as ContractVersionRow };
  if (session?.url) out.checkout_url = session.url;
  return out;
}

async function steeringOnContract(contractId: string, steeringId: string): Promise<SteeringRequestRow> {
  const s = await loadSteering(steeringId);
  if (!s || s.contract_id !== contractId) throw notFound('Steering request not found');
  return s;
}

/** The customer approves the provider's re-estimate. */
export async function approveSteering(userId: string, contractId: string, steeringId: string): Promise<AppliedVersion> {
  const pc = await getContractForParty(userId, contractId);
  requireRole(pc, 'customer', 'approve scope changes');
  const s = await steeringOnContract(pc.contract.id, steeringId);
  if (s.status !== 'awaiting_approval' || !s.new_contract_version_id) {
    throw new JobsError('invalid_state', 409, `This request is ${s.status}; only a re-estimated scope change can be approved`);
  }
  const version = await loadContractVersion(s.new_contract_version_id);
  if (!version) throw new JobsError('invalid_state', 409, 'The proposed contract version is missing');
  return applyVersion(pc.contract, s, version, { userId, role: 'customer' });
}

/** The provider signs a version the customer proposed (scope change with the customer's terms). */
export async function acceptProposedVersion(
  userId: string,
  contractId: string,
  versionId: string,
  agentIdentityId: string | null,
): Promise<AppliedVersion> {
  const pc = await getContractForParty(userId, contractId);
  requireRole(pc, 'provider', 'accept a proposed contract version');
  const version = isUuid(versionId) ? await loadContractVersion(versionId) : null;
  if (!version || version.contract_id !== pc.contract.id) throw notFound('Contract version not found');
  const { data, error } = await jobsDb()
    .from('steering_requests')
    .select('*')
    .eq('contract_id', pc.contract.id)
    .eq('new_contract_version_id', version.id)
    .eq('status', 'awaiting_provider')
    .maybeSingle();
  if (error) throw dbError(error, 'find proposal');
  if (!data) throw new JobsError('invalid_state', 409, 'This contract version is not waiting for your signature');
  return applyVersion(pc.contract, data as SteeringRequestRow, version, { userId, role: 'provider', agentIdentityId });
}

/** The customer rejects (or withdraws) a pending scope change. */
export async function rejectSteering(userId: string, contractId: string, steeringId: string): Promise<{ steering: SteeringRequestRow }> {
  const pc = await getContractForParty(userId, contractId);
  requireRole(pc, 'customer', 'reject scope changes');
  const s = await steeringOnContract(pc.contract.id, steeringId);
  if (s.kind !== 'scope_change' || !OPEN_SCOPE.includes(s.status)) {
    throw new JobsError('invalid_state', 409, `This request is ${s.status}; only a pending scope change can be rejected`);
  }
  const steering = await updateSteering(s, OPEN_SCOPE, { status: 'rejected', decided_at: new Date().toISOString() });
  await recordActivity(pc.contract.id, { userId, role: 'customer' }, 'scope_change_rejected', 'Customer rejected a scope change', { steering_id: s.id });
  return { steering };
}

export async function listSteering(userId: string, contractId: string, query: SteeringListInput = {}) {
  const { contract } = await getContractForParty(userId, contractId);
  const since = parseTimeCursor(query.since);
  if (since === 'invalid') throw new JobsError('invalid_request', 400, 'since must be a cursor returned as next_cursor');
  let q = jobsDb().from('steering_requests').select('*').eq('contract_id', contract.id);
  if (query.status) q = q.eq('status', query.status);
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list steering');
  const steering = (data ?? []) as SteeringRequestRow[];
  const latest = steering.reduce<string | null>((max, s) => (!max || s.updated_at > max ? s.updated_at : max), since);
  return { steering, next_cursor: latest ?? new Date(0).toISOString() };
}
