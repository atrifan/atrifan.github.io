/**
 * Steering requests: persistence and flows around the pure rules in steering.ts.
 *
 *   customer asks ──► classify (LLM, billed to the customer; rules without AI or balance)
 *                 ──► decideSteering ──► clarification / revision: open
 *                                    └─► scope_change: awaiting_estimate
 *                                        (or awaiting_provider with the customer's proposed terms)
 *   a revision claims one included credit atomically; losing the race makes it a scope change
 *   provider answers (clarification → answered, revision → resolved)
 *   provider re-estimates a scope change ──► new contract version (+ new spec version when the
 *                                            spec or deliverables change) ──► awaiting_approval
 *   customer approves ──► version (and spec) becomes current; a price increase opens a top-up
 *                         Checkout, a decrease refunds the difference (or credits it at payout)
 *   provider accepts the customer's proposed version ──► same as approval
 *   customer rejects / provider declines ──► work resumes on the current version
 *   an expired top-up Checkout ──► the customer gets a new one (regenerateTopup)
 */
import { randomUUID } from 'node:crypto';
import { jobsDb } from './db';
import { JobsError, dbError, isUniqueViolation, notFound } from './errors';
import { isUuid, loadJob, loadSpecVersion } from './jobs-service';
import { contractCheckoutUrls, loadContractVersion } from './contracts-service';
import { ensureUserPrincipal } from './principals';
import { computeCommission } from './commission';
import { buildTopupCheckoutParams } from './checkout-params';
import { getStripe, stripeFailure } from './stripe';
import { notifyUser, excerpt } from './notifications';
import { costForModel, resolveGenerationCost } from '../ai-gateway';
import { creditMarkupFromEnv } from '../../config/qa.config';
import { estimateInputTokens } from '../qa/qa-credits';
import {
  CLASSIFIER_OUTPUT_TOKENS_ESTIMATE,
  applySpecChanges,
  buildClassifierPrompt,
  classifierChargeUsd,
  classifySteering,
  decideSteering,
  initialSteeringStatus,
  nextCreditCount,
  planRefund,
  refundAmountCents,
  ruleClassifySteering,
  settleCreditClaim,
  steeringModel,
  topupAmountCents,
  topupRegenerable,
  type ClassifierContext,
  type ClassifierOutput,
  type ClassifierUsage,
  type RefundablePayment,
  type SteeringDecision,
  type SteeringKind,
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
import { formatEuros } from './client/format';
import type { ContractRow, ContractVersionRow, JobSpecVersionRow, PaymentRow, SteeringRequestRow } from './types';

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
  terms: { priceCents: number; deadline: string | null; signedBy: 'customer' | 'provider'; specVersionId?: string },
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
        spec_version_id: terms.specVersionId ?? base.spec_version_id,
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

// ---------- spec versions from a scope change ----------

/**
 * A new draft spec version for a scope change that adds requirements or deliverables. It is
 * approved (and becomes the job's current spec) when the new contract version is agreed.
 * Undefined when the changes leave the spec as it is.
 */
async function createScopeSpecVersion(
  contract: ContractRow,
  baseSpecId: string,
  changes: { specChanges: readonly string[]; deliverableChanges: readonly string[] },
): Promise<JobSpecVersionRow | undefined> {
  const base = await loadSpecVersion(baseSpecId);
  if (!base) throw new JobsError('invalid_state', 409, 'The contract spec is missing');
  const next = applySpecChanges(base, changes);
  if (!next) return undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest, error: latestError } = await jobsDb()
      .from('job_spec_versions')
      .select('version')
      .eq('job_id', base.job_id)
      .order('version', { ascending: false })
      .limit(1)
      .single();
    if (latestError) throw dbError(latestError, 'latest spec version');
    const { data, error } = await jobsDb()
      .from('job_spec_versions')
      .insert({
        job_id: base.job_id,
        user_id: contract.customer_user_id,
        version: (latest as { version: number }).version + 1,
        status: 'draft',
        source: 'manual',
        requirements: next.requirements,
        deliverables: next.deliverables,
        acceptance_criteria: base.acceptance_criteria,
        constraints: base.constraints,
        permitted_tools: base.permitted_tools,
        security: base.security,
        deadline: base.deadline,
        budget_min_cents: base.budget_min_cents,
        budget_max_cents: base.budget_max_cents,
      })
      .select('*')
      .single();
    if (!error) return data as JobSpecVersionRow;
    if (!isUniqueViolation(error)) throw dbError(error, 'create spec version');
  }
  throw new JobsError('invalid_state', 409, 'Concurrent spec changes; try again');
}

/** Make the agreed spec version the job's approved spec; the previous one is superseded. */
async function adoptSpecVersion(contract: ContractRow, fromSpecId: string, toSpecId: string, approvedBy: string): Promise<void> {
  if (fromSpecId === toSpecId) return;
  const db = jobsDb();
  const now = new Date().toISOString();
  const { error: oldError } = await db.from('job_spec_versions').update({ status: 'superseded' }).eq('id', fromSpecId).eq('status', 'approved');
  if (oldError) throw dbError(oldError, 'supersede spec version');
  const { error: newError } = await db
    .from('job_spec_versions')
    .update({ status: 'approved', approved_at: now, approved_by: approvedBy })
    .eq('id', toSpecId);
  if (newError) throw dbError(newError, 'approve spec version');
  const { error: jobError } = await db.from('jobs').update({ current_spec_version_id: toSpecId }).eq('id', contract.job_id);
  if (jobError) throw dbError(jobError, 'point the job at the new spec');
}

// ---------- classifier billing ----------

async function readBalance(userId: string): Promise<number> {
  const { data, error } = await jobsDb().from('user_budgets').select('remaining_balance, status').eq('user_id', userId).maybeSingle();
  if (error) throw dbError(error, 'read balance');
  if (!data || data.status !== 'active') return 0;
  return Number(data.remaining_balance) || 0;
}

async function chargeClassifier(userId: string, model: string, usage: ClassifierUsage, markup: number): Promise<number> {
  const estimate = await costForModel(model, usage.inputTokens, usage.outputTokens);
  if (estimate <= 0) return 0;
  const cost = await resolveGenerationCost(usage.generationId, estimate);
  const charge = classifierChargeUsd(cost, markup);
  const db = jobsDb();
  const { data: left, error } = await db.rpc('deduct_user_balance', { target_user_id: userId, amount: charge });
  if (error) console.error('[jobs] steering classifier: deduct_user_balance failed:', error.message);
  else if (Number(left) < 0) console.error('[jobs] steering classifier: the balance ran out before the charge');
  const { error: logError } = await db.from('paid_usage_analytics').insert({
    user_id: userId,
    device_session_id: 'gigs-steering-classifier',
    provider: model.split('/')[0] || 'unknown',
    model_name: model,
    tokens_used: usage.inputTokens + usage.outputTokens,
    cost_deducted: charge,
  });
  if (logError) console.error('[jobs] paid_usage_analytics insert failed:', logError.message);
  return charge;
}

/**
 * Classify with the AI when the requester's balance covers the call, and charge them the
 * metered cost × CREDIT_MARKUP; otherwise fall back to the rules. Never blocks the request.
 */
async function classifyBilled(
  userId: string,
  ctx: ClassifierContext,
  requestedKind: SteeringKind | undefined,
): Promise<ClassifierOutput & { charged_usd?: number }> {
  if (!process.env.AI_GATEWAY_API_KEY) return classifySteering(ctx, { userId, requestedKind });
  const model = steeringModel();
  const markup = creditMarkupFromEnv();
  const estimate = classifierChargeUsd(
    await costForModel(model, estimateInputTokens(buildClassifierPrompt(ctx)), CLASSIFIER_OUTPUT_TOKENS_ESTIMATE),
    markup,
  );
  const balance = await readBalance(userId);
  if (balance <= 0 || balance < estimate) {
    return { source: 'rules', kind: ruleClassifySteering(ctx.message, requestedKind), error: 'insufficient_balance' };
  }
  const out = await classifySteering(ctx, { userId, requestedKind, model });
  if (out.source !== 'ai') return out;
  return { ...out, charged_usd: await chargeClassifier(userId, model, out.usage, markup) };
}

// ---------- steering credits ----------

async function creditsUsed(contractId: string): Promise<number> {
  const { data, error } = await jobsDb().from('contracts').select('steering_credits_used').eq('id', contractId).single();
  if (error) throw dbError(error, 'read steering credits');
  return (data as { steering_credits_used: number }).steering_credits_used;
}

/** Compare-and-swap contracts.steering_credits_used from `from` to `to`; false if it moved meanwhile. */
async function swapCreditsUsed(contractId: string, from: number, to: number): Promise<boolean> {
  const { data, error } = await jobsDb()
    .from('contracts')
    .update({ steering_credits_used: to })
    .eq('id', contractId)
    .eq('steering_credits_used', from)
    .select('id')
    .maybeSingle();
  if (error) throw dbError(error, 'update steering credits');
  return data != null;
}

/**
 * Take one included steering credit. A conditional update on the contract row, so two
 * concurrent revisions can never both take the last credit. False when none is left.
 */
async function claimSteeringCredit(contractId: string, allowance: number): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const used = await creditsUsed(contractId);
    const next = nextCreditCount(used, allowance);
    if (next === null) return false;
    if (await swapCreditsUsed(contractId, used, next)) return true;
  }
  throw new JobsError('invalid_state', 409, 'Too many steering requests at once; try again');
}

/** Give a claimed credit back when the request it was for could not be saved. */
async function releaseSteeringCredit(contractId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const used = await creditsUsed(contractId);
    if (used <= 0) return;
    if (await swapCreditsUsed(contractId, used, used - 1)) return;
  }
  console.error('[jobs] could not release a steering credit on', contractId);
}

// ---------- create ----------

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

  const classifier = await classifyBilled(
    userId,
    {
      message: input.message,
      requirements: spec?.requirements ?? [],
      deliverables: spec?.deliverables ?? [],
      priceCents: current.price_cents,
      deadline: current.deadline,
    },
    input.requested_kind,
  );
  let decision = decideSteering({
    classified: classifier.kind,
    specDiff: input.spec_changes ?? [],
    priceDelta: input.price_cents !== undefined ? input.price_cents - current.price_cents : 0,
    deadlineDelta: deltaMs(input.deadline, current.deadline),
    remainingSteeringCredits: steeringCredits(current, contract).remaining,
  });
  const proposesTerms = input.price_cents !== undefined || input.deadline !== undefined;
  const scopePending = () => existing.some((s) => s.kind === 'scope_change' && OPEN_SCOPE.includes(s.status));
  const pendingError = () => new JobsError('invalid_state', 409, 'A scope change is already pending on this contract; resolve it first');

  if (decision.kind === 'scope_change' && scopePending()) throw pendingError();
  // The credit is claimed on the contract row; a revision that loses the race for the last one
  // becomes a scope change.
  const claimed = decision.consumesCredit ? await claimSteeringCredit(contract.id, current.steering_allowance) : false;
  decision = settleCreditClaim(decision, claimed);
  if (decision.kind === 'scope_change' && scopePending()) throw pendingError();
  const status = initialSteeringStatus(decision, proposesTerms);

  let principalId: string;
  let proposal: ContractVersionRow | null = null;
  let newSpec: JobSpecVersionRow | undefined;
  try {
    if (status === 'awaiting_provider') {
      newSpec = await createScopeSpecVersion(contract, current.spec_version_id, { specChanges: input.spec_changes ?? [], deliverableChanges: [] });
      proposal = await createVersion(contract, current, {
        priceCents: input.price_cents ?? current.price_cents,
        deadline: input.deadline ?? current.deadline,
        signedBy: 'customer',
        specVersionId: newSpec?.id,
      });
    }
    principalId = (await ensureUserPrincipal(userId)).id;
  } catch (err) {
    if (claimed) await releaseSteeringCredit(contract.id);
    throw err;
  }

  const { data, error } = await jobsDb()
    .from('steering_requests')
    .insert({
      contract_id: contract.id,
      user_id: userId,
      requested_by_principal_id: principalId,
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
      new_spec_version_id: newSpec?.id ?? null,
    })
    .select('*')
    .single();
  if (error) {
    if (claimed) await releaseSteeringCredit(contract.id);
    if (isUniqueViolation(error)) throw pendingError();
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

// ---------- respond ----------

export interface SteeringResponse {
  steering: SteeringRequestRow;
  new_contract_version?: ContractVersionRow;
}

/** The provider answers a request, re-estimates a scope change, or declines it. */
export async function respondSteering(
  userId: string,
  input: SteeringRespondInput,
  agentIdentityId: string | null,
  contractId?: string,
): Promise<SteeringResponse> {
  const s = await loadSteering(input.steering_id);
  if (!s || (contractId !== undefined && s.contract_id !== contractId)) throw notFound('Steering request not found');
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
    const newSpec = await createScopeSpecVersion(pc.contract, base.spec_version_id, {
      specChanges: s.spec_changes ?? [],
      deliverableChanges: input.deliverable_changes ?? [],
    });
    const version = await createVersion(pc.contract, base, { priceCents, deadline, signedBy: 'provider', specVersionId: newSpec?.id });
    const steering = await updateSteering(s, [s.status], {
      ...answered,
      status: 'awaiting_approval',
      estimate_delta_cents: delta,
      estimate_eta_days: input.eta_days ?? null,
      deliverable_changes: input.deliverable_changes ?? [],
      new_contract_version_id: version.id,
      new_spec_version_id: newSpec?.id ?? null,
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

// ---------- approve / reject ----------

export interface AppliedVersion {
  steering: SteeringRequestRow;
  contract: ContractRow;
  version: ContractVersionRow;
  checkout_url?: string;
  refund?: { amount_cents: number; status: 'refunded' | 'credit_pending' };
}

async function topupSession(contract: ContractRow, s: SteeringRequestRow, version: ContractVersionRow, amountCents: number, idempotencyKey: string) {
  const job = await loadJob(contract.job_id);
  const { successUrl, cancelUrl } = contractCheckoutUrls(contract.id);
  let session: { id: string; url: string | null };
  try {
    session = await getStripe().checkout.sessions.create(
      buildTopupCheckoutParams({
        contractId: contract.id,
        jobId: contract.job_id,
        steeringRequestId: s.id,
        contractVersionId: version.id,
        version: version.version,
        jobTitle: job?.title ?? 'Gig contract',
        amountCents,
        currency: version.currency,
        successUrl,
        cancelUrl,
      }),
      { idempotencyKey },
    );
  } catch (err) {
    if (err instanceof JobsError) throw err;
    throw stripeFailure(err, 'top-up checkout session');
  }
  if (!session.url) throw stripeFailure(new Error('no url'), 'top-up checkout session');
  return session as { id: string; url: string };
}

/**
 * A scope change lowered the customer's total: refund the difference through Stripe, newest
 * payment first. Whatever can't be refunded (no payment, or Stripe refused) is recorded on the
 * steering request as a credit to apply at payout.
 */
async function refundDecrease(contract: ContractRow, s: SteeringRequestRow, amountCents: number, actor: Actor) {
  const db = jobsDb();
  const { data, error } = await db.from('payments').select('*').eq('contract_id', contract.id);
  if (error) throw dbError(error, 'list payments');
  const payments = (data ?? []) as PaymentRow[];
  const plan = planRefund(payments as RefundablePayment[], amountCents);
  let leftover = plan.leftoverCents;
  for (const part of plan.parts) {
    let refund: { id: string; status: string | null };
    try {
      refund = await getStripe().refunds.create(
        {
          payment_intent: part.paymentIntentId,
          amount: part.amountCents,
          reason: 'requested_by_customer',
          metadata: { kind: 'contract_scope_change', contract_id: contract.id, steering_request_id: s.id },
        },
        { idempotencyKey: `steering_refund_${s.id}_${part.paymentId}` },
      );
    } catch (err) {
      console.error('[jobs] scope-change refund failed; crediting at payout:', err instanceof Error ? err.message : err);
      leftover += part.amountCents;
      continue;
    }
    const payment = payments.find((p) => p.id === part.paymentId)!;
    const refunded = payment.amount_refunded_cents + part.amountCents;
    const { error: payError } = await db
      .from('payments')
      .update({ amount_refunded_cents: refunded, status: refunded >= payment.amount_cents ? 'refunded' : 'partially_refunded' })
      .eq('id', payment.id);
    if (payError) throw dbError(payError, 'record refunded amount');
    const { error: refundError } = await db.from('refunds').upsert(
      {
        payment_id: payment.id,
        contract_id: contract.id,
        user_id: contract.customer_user_id,
        stripe_refund_id: refund.id,
        amount_cents: part.amountCents,
        currency: payment.currency,
        reason: 'scope_change_price_decrease',
        status: refund.status ?? 'pending',
      },
      { onConflict: 'stripe_refund_id', ignoreDuplicates: true },
    );
    if (refundError) throw dbError(refundError, 'record refund');
  }
  const status = leftover > 0 ? 'credit_pending' : 'refunded';
  const steering = await updateSteering(s, ['approved'], { refund_amount_cents: amountCents, refund_status: status, refund_credit_cents: leftover });
  await recordActivity(
    contract.id,
    actor,
    'refund_issued',
    status === 'refunded'
      ? `${formatEuros(amountCents)} refunded to the customer for the lower price`
      : `${formatEuros(amountCents)} owed to the customer for the lower price, settled at payout`,
    { steering_id: s.id, amount_cents: amountCents, credited_cents: leftover },
  );
  return { steering, refund: { amount_cents: amountCents, status } as const };
}

/** Make an agreed version current; a price increase opens a top-up Checkout, a decrease refunds. */
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
  const session = topup > 0 ? await topupSession(contract, s, version, topup, `steering_topup_${s.id}`) : null;

  const now = new Date().toISOString();
  const db = jobsDb();
  const signature = actor.role === 'customer' ? { signed_by_customer_at: now } : { signed_by_provider_at: now };
  const { data: signed, error: signError } = await db.from('contract_versions').update(signature).eq('id', version.id).select('*').single();
  if (signError) throw dbError(signError, 'sign contract version');

  let steering = await updateSteering(s, [s.status], {
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
  await adoptSpecVersion(contract, base.spec_version_id, version.spec_version_id, contract.customer_user_id);

  await recordActivity(contract.id, actor, 'scope_change_approved', `Contract version ${version.version} agreed${topup > 0 ? ', top-up payment pending' : ''}`, {
    steering_id: s.id,
    contract_version_id: version.id,
    topup_amount_cents: topup,
  });
  const out: AppliedVersion = { steering, contract: moved as ContractRow, version: signed as ContractVersionRow };
  const refundCents = refundAmountCents(base.customer_total_cents, version.customer_total_cents);
  if (refundCents > 0) {
    const r = await refundDecrease(moved as ContractRow, steering, refundCents, actor);
    steering = r.steering;
    out.steering = steering;
    out.refund = r.refund;
  }
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

// ---------- top-up checkout ----------

/**
 * A fresh top-up Checkout for an approved scope change whose top-up is unpaid (typically its
 * Checkout expired, which keeps the work paused). A still-open session is returned as is.
 */
export async function regenerateTopup(userId: string, contractId: string, steeringId: string): Promise<{ steering: SteeringRequestRow; checkout_url: string }> {
  const pc = await getContractForParty(userId, contractId);
  requireRole(pc, 'customer', 'pay a top-up');
  const s = await steeringOnContract(pc.contract.id, steeringId);
  if (!topupRegenerable(s) || s.topup_amount_cents <= 0 || !s.new_contract_version_id) {
    throw new JobsError('invalid_state', 409, 'There is no unpaid top-up on this request');
  }
  const previous = s.topup_checkout_session_id;
  if (s.topup_status === 'pending' && previous) {
    let old: { status: string | null; url: string | null };
    try {
      old = await getStripe().checkout.sessions.retrieve(previous);
    } catch (err) {
      throw stripeFailure(err, 'top-up checkout lookup');
    }
    if (old.status === 'open' && old.url) return { steering: s, checkout_url: old.url };
    if (old.status === 'complete') throw new JobsError('invalid_state', 409, 'This top-up is already paid; it will show up in a moment');
  }
  const version = await loadContractVersion(s.new_contract_version_id);
  if (!version) throw new JobsError('invalid_state', 409, 'The agreed contract version is missing');
  const session = await topupSession(pc.contract, s, version, s.topup_amount_cents, `steering_topup_${s.id}_${randomUUID()}`);
  let q = jobsDb()
    .from('steering_requests')
    .update({ topup_status: 'pending', topup_checkout_session_id: session.id, topup_checkout_url: session.url })
    .eq('id', s.id)
    .in('topup_status', ['pending', 'expired']);
  q = previous ? q.eq('topup_checkout_session_id', previous) : q.is('topup_checkout_session_id', null);
  const { data, error } = await q.select('*').maybeSingle();
  if (error) throw dbError(error, 'save top-up checkout');
  if (!data) {
    await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
    throw new JobsError('invalid_state', 409, 'This top-up changed; reload and try again');
  }
  return { steering: data as SteeringRequestRow, checkout_url: session.url };
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
