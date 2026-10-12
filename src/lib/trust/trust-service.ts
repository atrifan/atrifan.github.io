/**
 * Trust scores: load a provider's history, score it with the pure computeTrustScore and
 * store one row per provider principal and per agent version (trust_scores).
 *
 * Recomputed on events (acceptance, dispute opened/resolved, chargeback, QA verdict, review)
 * and nightly by app/api/cron/trust-decay, so the time decay keeps moving. Also the read side
 * for the TrustBadge and the hub profile.
 */
import { jobsDb } from '../jobs/db';
import { dbError } from '../jobs/errors';
import type { ContractVersionRow, PaymentRow } from '../jobs/types';
import type { DisputeRow, Phase5ContractRow } from '../delivery/contract-data';
import { computeTrustScore, type QaAttemptVerdict, type TrustContract, type TrustReview, type TrustScore } from './trust-score';

interface ReviewRow {
  id: string;
  contract_id: string;
  reviewer_user_id: string;
  reviewer_role: 'customer' | 'provider';
  subject_user_id: string;
  subject_principal_id: string;
  subject_agent_identity_id: string | null;
  subject_agent_version: string | null;
  overall: number;
  quality: number;
  communication: number;
  timeliness: number;
  body: string | null;
  created_at: string;
}

export interface TrustSummary {
  principal_id: string;
  user_id: string;
  score: number;
  level: TrustScore['level'];
  review_count: number;
  average_rating: number | null;
  counted: number;
  breakdown: Array<{ key: string; label: string; value: number; weight: number; evidence: number }>;
  computed_at: string;
}

const LOST_RESOLUTIONS = new Set(['partial_refund', 'full_refund']);

function rows<T>(r: { data: unknown; error: { message?: string; code?: string } | null }, context: string): T[] {
  if (r.error) throw dbError(r.error, context);
  return (r.data ?? []) as T[];
}

const uniq = (xs: Array<string | null | undefined>) => Array.from(new Set(xs.filter((x): x is string => !!x)));

interface History {
  contracts: TrustContract[];
  reviews: TrustReview[];
  /** contract id → agent identity id and version that delivered it */
  agentOf: Map<string, { id: string; version: string } | null>;
  reviewRows: ReviewRow[];
}

async function loadHistory(principalId: string): Promise<History | null> {
  const db = jobsDb();
  const contracts = rows<Phase5ContractRow>(await db.from('contracts').select('*').eq('provider_principal_id', principalId), 'trust contracts');
  const ids = contracts.map((c) => c.id);
  const reviewRows = rows<ReviewRow>(
    await db.from('reviews').select('*').eq('subject_principal_id', principalId).eq('reviewer_role', 'customer'),
    'trust reviews',
  );
  if (ids.length === 0) return { contracts: [], reviews: [], agentOf: new Map(), reviewRows };

  const [payments, versions, qa, disputes, subs] = await Promise.all([
    db.from('payments').select('*').in('contract_id', ids),
    db.from('contract_versions').select('*').in('contract_id', ids),
    db.from('qa_reviews').select('contract_id, verdict, created_at').in('contract_id', ids).order('created_at', { ascending: true }),
    db.from('disputes').select('*').in('contract_id', ids),
    db.from('submissions').select('contract_id, attempt, status, agent_identity_id').in('contract_id', ids).eq('status', 'validated'),
  ]);
  const paymentRows = rows<PaymentRow & { payer_fingerprints?: string[] }>(payments, 'trust payments');
  const versionRows = rows<ContractVersionRow>(versions, 'trust versions');
  const qaRows = rows<{ contract_id: string; verdict: QaAttemptVerdict; created_at: string }>(qa, 'trust qa');
  const disputeRows = rows<DisputeRow>(disputes, 'trust disputes');
  const subRows = rows<{ contract_id: string; attempt: number; agent_identity_id: string | null }>(subs, 'trust submissions');

  const userIds = uniq([...contracts.flatMap((c) => [c.customer_user_id, c.provider_user_id]), ...reviewRows.map((r) => r.reviewer_user_id)]);
  const agentIds = uniq(subRows.map((s) => s.agent_identity_id));
  const [contacts, profiles, agents, spend] = await Promise.all([
    db.from('user_contacts').select('user_id, email, created_at').in('user_id', userIds),
    db.from('provider_profiles').select('user_id, payout_fingerprints').in('user_id', uniq(contracts.map((c) => c.provider_user_id))),
    agentIds.length ? db.from('agent_identities').select('id, version').in('id', agentIds) : Promise.resolve({ data: [], error: null }),
    db.from('payments').select('user_id, amount_cents, amount_refunded_cents, status, created_at').in('user_id', userIds),
  ]);
  const contactBy = new Map(rows<{ user_id: string; email: string | null; created_at: string }>(contacts, 'trust contacts').map((c) => [c.user_id, c]));
  const payoutPrints = new Map(rows<{ user_id: string; payout_fingerprints: string[] | null }>(profiles, 'trust profiles').map((p) => [p.user_id, p.payout_fingerprints ?? []]));
  const agentVersion = new Map(rows<{ id: string; version: string | null }>(agents, 'trust agents').map((a) => [a.id, a.version ?? 'unversioned']));
  const spendBy = new Map<string, { cents: number; first: string | null }>();
  for (const p of rows<{ user_id: string; amount_cents: number; amount_refunded_cents: number; status: string; created_at: string }>(spend, 'trust spend')) {
    if (p.status === 'pending' || p.status === 'failed') continue;
    const s = spendBy.get(p.user_id) ?? { cents: 0, first: null };
    s.cents += p.amount_cents - p.amount_refunded_cents;
    if (!s.first || p.created_at < s.first) s.first = p.created_at;
    spendBy.set(p.user_id, s);
  }
  const emailPrint = (userId: string) => {
    const e = contactBy.get(userId)?.email;
    return e ? [`email:${e.trim().toLowerCase()}`] : [];
  };

  const agentOf = new Map<string, { id: string; version: string } | null>();
  for (const c of contracts) {
    const sub = subRows.filter((s) => s.contract_id === c.id).sort((a, b) => b.attempt - a.attempt)[0];
    agentOf.set(c.id, sub?.agent_identity_id ? { id: sub.agent_identity_id, version: agentVersion.get(sub.agent_identity_id) ?? 'unversioned' } : null);
  }

  const trustContracts: TrustContract[] = contracts.map((c) => {
    const pays = paymentRows.filter((p) => p.contract_id === c.id);
    const vers = versionRows.filter((v) => v.contract_id === c.id).sort((a, b) => a.version - b.version);
    const current = vers.find((v) => v.id === c.current_version_id) ?? vers[vers.length - 1];
    const ds = disputeRows.filter((d) => d.contract_id === c.id);
    const resolved = ds.filter((d) => d.status === 'resolved' && d.resolved_at).sort((a, b) => (a.resolved_at! < b.resolved_at! ? 1 : -1))[0];
    const qas = qaRows.filter((q) => q.contract_id === c.id);
    const firstValid = qas.find((q) => q.verdict === 'validated');
    const closed = c.status === 'completed' || c.status === 'refunded';
    return {
      contractId: c.id,
      customerUserId: c.customer_user_id,
      providerUserId: c.provider_user_id,
      paid: pays.some((p) => p.status !== 'pending' && p.status !== 'failed'),
      outcome: !closed ? 'open' : c.acceptance === 'customer' || c.acceptance === 'auto' ? 'accepted' : 'resolved',
      closedAt: c.accepted_at ?? resolved?.resolved_at ?? c.updated_at,
      qaAttempts: qas.map((q) => q.verdict),
      disputed: ds.some((d) => d.source === 'customer' || d.source === 'chargeback'),
      disputeLost: ds.some((d) => (d.resolution && LOST_RESOLUTIONS.has(d.resolution)) || (d.source === 'chargeback' && d.stripe_dispute_status === 'lost')),
      deadline: vers[0]?.deadline ?? null,
      deliveredAt: firstValid?.created_at ?? null,
      initialPriceCents: vers[0]?.price_cents ?? 0,
      finalPriceCents: current?.price_cents ?? 0,
      customerFingerprints: [...pays.flatMap((p) => p.payer_fingerprints ?? []), ...emailPrint(c.customer_user_id)],
      providerFingerprints: [...(payoutPrints.get(c.provider_user_id) ?? []), ...emailPrint(c.provider_user_id)],
    };
  });

  const reviews: TrustReview[] = reviewRows.map((r) => ({
    contractId: r.contract_id,
    reviewerUserId: r.reviewer_user_id,
    overall: r.overall,
    quality: r.quality,
    communication: r.communication,
    timeliness: r.timeliness,
    createdAt: r.created_at,
    reviewerSpendCents: spendBy.get(r.reviewer_user_id)?.cents ?? 0,
    reviewerAccountCreatedAt: contactBy.get(r.reviewer_user_id)?.created_at ?? null,
    reviewerFirstPaymentAt: spendBy.get(r.reviewer_user_id)?.first ?? null,
  }));
  return { contracts: trustContracts, reviews, agentOf, reviewRows };
}

async function store(key: string, subject: { type: 'principal' | 'agent_version'; principalId: string; userId: string; agentId?: string; version?: string }, s: TrustScore) {
  const { error } = await jobsDb()
    .from('trust_scores')
    .upsert(
      {
        subject_key: key,
        subject_type: subject.type,
        principal_id: subject.principalId,
        user_id: subject.userId,
        agent_identity_id: subject.agentId ?? null,
        agent_version: subject.version ?? null,
        score: s.score,
        level: s.level,
        counted: s.counted,
        review_count: s.reviewCount,
        average_rating: s.averageRating,
        breakdown: { components: s.components, excluded: s.excluded },
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'subject_key' },
    );
  if (error) throw dbError(error, 'store trust score');
}

/** Recompute and store the principal's score and one per agent version it delivered with. */
export async function recomputeProviderTrust(principalId: string, now: Date = new Date()): Promise<TrustScore | null> {
  const { data: principal, error } = await jobsDb().from('principals').select('id, user_id').eq('id', principalId).maybeSingle();
  if (error) throw dbError(error, 'trust principal');
  if (!principal) return null;
  const userId = (principal as { user_id: string }).user_id;
  const history = await loadHistory(principalId);
  if (!history) return null;
  const score = computeTrustScore({ contracts: history.contracts, reviews: history.reviews, now });
  await store(`principal:${principalId}`, { type: 'principal', principalId, userId }, score);

  const byAgent = new Map<string, { id: string; version: string }>();
  for (const a of history.agentOf.values()) if (a) byAgent.set(`${a.id}:${a.version}`, a);
  for (const r of history.reviewRows) {
    if (r.subject_agent_identity_id) {
      const a = { id: r.subject_agent_identity_id, version: r.subject_agent_version ?? 'unversioned' };
      byAgent.set(`${a.id}:${a.version}`, a);
    }
  }
  for (const [k, a] of byAgent) {
    const contracts = history.contracts.filter((c) => {
      const d = history.agentOf.get(c.contractId);
      return d?.id === a.id && d.version === a.version;
    });
    const ids = new Set(contracts.map((c) => c.contractId));
    const reviews = history.reviews.filter((r, i) => ids.has(r.contractId) && history.reviewRows[i].subject_agent_identity_id === a.id);
    await store(`agent:${k}`, { type: 'agent_version', principalId, userId, agentId: a.id, version: a.version }, computeTrustScore({ contracts, reviews, now }));
  }
  return score;
}

/** Best effort: an event's recompute never fails the action that triggered it. */
export async function recomputeTrustSafe(principalId: string): Promise<void> {
  try {
    await recomputeProviderTrust(principalId);
  } catch (err) {
    console.error('[trust] recompute failed:', err instanceof Error ? err.message : String(err));
  }
}

/** Nightly: every provider principal with at least one contract, for the time decay. */
export async function recomputeAllTrust(limit = 1000): Promise<{ recomputed: number; failed: number }> {
  const { data, error } = await jobsDb().from('contracts').select('provider_principal_id').limit(10_000);
  if (error) throw dbError(error, 'trust principals');
  const ids = uniq(((data ?? []) as Array<{ provider_principal_id: string }>).map((r) => r.provider_principal_id)).slice(0, limit);
  let recomputed = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await recomputeProviderTrust(id);
      recomputed += 1;
    } catch (err) {
      failed += 1;
      console.error('[trust] nightly recompute failed for a principal:', err instanceof Error ? err.message : 'error');
    }
  }
  return { recomputed, failed };
}

function summary(row: Record<string, unknown>): TrustSummary {
  const breakdown = (row.breakdown as { components?: TrustSummary['breakdown'] } | null)?.components ?? [];
  return {
    principal_id: row.principal_id as string,
    user_id: row.user_id as string,
    score: Number(row.score),
    level: row.level as TrustScore['level'],
    review_count: Number(row.review_count ?? 0),
    average_rating: row.average_rating === null || row.average_rating === undefined ? null : Number(row.average_rating),
    counted: Number(row.counted ?? 0),
    breakdown: breakdown.map((c) => ({ key: c.key, label: c.label, value: c.value, weight: c.weight, evidence: c.evidence })),
    computed_at: row.computed_at as string,
  };
}

/** Stored principal scores by principal id (missing = no score yet). */
export async function trustForPrincipals(principalIds: string[]): Promise<Map<string, TrustSummary>> {
  const out = new Map<string, TrustSummary>();
  const ids = uniq(principalIds);
  if (ids.length === 0) return out;
  const { data, error } = await jobsDb().from('trust_scores').select('*').eq('subject_type', 'principal').in('principal_id', ids);
  if (error) throw dbError(error, 'read trust scores');
  for (const row of (data ?? []) as Array<Record<string, unknown>>) out.set(row.principal_id as string, summary(row));
  return out;
}

/** The user's provider score and per-agent-version scores, if any. */
export async function trustForUser(userId: string): Promise<{ provider: TrustSummary | null; agents: Array<TrustSummary & { agent_identity_id: string; agent_version: string }> }> {
  const { data, error } = await jobsDb().from('trust_scores').select('*').eq('user_id', userId).order('computed_at', { ascending: false });
  if (error) throw dbError(error, 'read user trust');
  const list = (data ?? []) as Array<Record<string, unknown>>;
  const provider = list.find((r) => r.subject_type === 'principal');
  return {
    provider: provider ? summary(provider) : null,
    agents: list
      .filter((r) => r.subject_type === 'agent_version')
      .map((r) => ({ ...summary(r), agent_identity_id: r.agent_identity_id as string, agent_version: r.agent_version as string })),
  };
}
