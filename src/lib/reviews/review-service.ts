/**
 * Reviews: each party reviews the other once per contract, after the delivery was accepted or
 * an admin resolved the dispute. Scores 1–5 for overall, quality, communication and timeliness,
 * plus optional text. A customer's review is about the provider principal and the agent
 * identity/version that delivered; a provider's review is about the customer.
 *
 * Writing one notifies the subject (review_received) and recomputes the provider's trust score.
 */
import { z } from 'zod';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError, isUniqueViolation } from '../jobs/errors';
import { notifyUser } from '../jobs/notifications';
import { recomputeTrustSafe } from '../trust/trust-service';
import { deliveredSubmission, displayName, jobTitleOf, listDisputes, listPayments, loadPartyContract, openDisputes } from '../delivery/contract-data';

const score = z.number().int().min(1).max(5);

export const reviewSchema = z.object({
  overall: score,
  quality: score,
  communication: score,
  timeliness: score,
  body: z.string().trim().max(4000).optional().nullable(),
});

export interface ReviewRecord {
  id: string;
  contract_id: string;
  reviewer_role: 'customer' | 'provider';
  reviewer_name: string;
  overall: number;
  quality: number;
  communication: number;
  timeliness: number;
  body: string | null;
  job_title: string | null;
  agent_version: string | null;
  created_at: string;
}

export async function submitReview(userId: string, contractId: string, args: unknown) {
  const parsed = reviewSchema.safeParse(args ?? {});
  if (!parsed.success) throw new JobsError('invalid_request', 400, 'Invalid review', parsed.error.issues);
  const input = parsed.data;
  const { contract, role } = await loadPartyContract(userId, contractId);
  if (contract.status !== 'completed' && contract.status !== 'refunded') {
    throw new JobsError('review_not_allowed', 409, 'Reviews open once the delivery is accepted or the dispute is resolved');
  }
  const [disputes, payments] = await Promise.all([listDisputes(contract.id), listPayments(contract.id)]);
  if (openDisputes(disputes).some((d) => d.source !== 'chargeback')) throw new JobsError('review_not_allowed', 409, 'Reviews open once the dispute is resolved');
  if (!payments.some((p) => p.status !== 'pending' && p.status !== 'failed')) throw new JobsError('review_not_allowed', 409, 'Only paid contracts can be reviewed');

  const byCustomer = role === 'customer';
  let agentId: string | null = null;
  let agentVersion: string | null = null;
  if (byCustomer) {
    const sub = await deliveredSubmission(contract.id);
    agentId = sub?.agent_identity_id ?? null;
    if (agentId) {
      const { data } = await jobsDb().from('agent_identities').select('version').eq('id', agentId).maybeSingle();
      agentVersion = (data as { version?: string | null } | null)?.version ?? 'unversioned';
    }
  }
  const { data, error } = await jobsDb()
    .from('reviews')
    .insert({
      contract_id: contract.id,
      reviewer_user_id: userId,
      reviewer_principal_id: byCustomer ? contract.customer_principal_id : contract.provider_principal_id,
      reviewer_role: role,
      subject_user_id: byCustomer ? contract.provider_user_id : contract.customer_user_id,
      subject_principal_id: byCustomer ? contract.provider_principal_id : contract.customer_principal_id,
      subject_agent_identity_id: agentId,
      subject_agent_version: agentVersion,
      overall: input.overall,
      quality: input.quality,
      communication: input.communication,
      timeliness: input.timeliness,
      body: input.body || null,
    })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new JobsError('already_reviewed', 409, 'You already reviewed this contract');
    throw dbError(error, 'create review');
  }
  const row = data as { id: string; subject_user_id: string; created_at: string };
  const reviewerName = await displayName(userId, byCustomer ? 'Your customer' : 'Your provider');
  await notifyUser(
    row.subject_user_id,
    'review_received',
    { reviewerName, rating: input.overall, comment: input.body ? input.body.slice(0, 2000) : undefined, jobTitle: await jobTitleOf(contract.job_id) },
    `review_received:${row.id}`,
  );
  if (byCustomer) await recomputeTrustSafe(contract.provider_principal_id);
  return { review: data };
}

export async function listContractReviews(userId: string, contractId: string) {
  const { contract } = await loadPartyContract(userId, contractId);
  const { data, error } = await jobsDb().from('reviews').select('*').eq('contract_id', contract.id).order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list reviews');
  return { reviews: data ?? [] };
}

/** Reviews written about a user (as provider or customer), newest first, with reviewer names. */
export async function reviewsAbout(userId: string, limit = 50): Promise<{ reviews: ReviewRecord[]; summary: { count: number; average: number | null; as_provider: number; as_customer: number } }> {
  const { data, error } = await jobsDb()
    .from('reviews')
    .select('*')
    .eq('subject_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw dbError(error, 'reviews about user');
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const reviewerIds = Array.from(new Set(rows.map((r) => r.reviewer_user_id as string)));
  const contractIds = Array.from(new Set(rows.map((r) => r.contract_id as string)));
  const [contacts, contracts] = await Promise.all([
    reviewerIds.length ? jobsDb().from('user_contacts').select('user_id, name').in('user_id', reviewerIds) : Promise.resolve({ data: [], error: null }),
    contractIds.length ? jobsDb().from('contracts').select('id, job_id').in('id', contractIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const nameBy = new Map(((contacts.data ?? []) as Array<{ user_id: string; name: string | null }>).map((c) => [c.user_id, c.name]));
  const jobOf = new Map(((contracts.data ?? []) as Array<{ id: string; job_id: string }>).map((c) => [c.id, c.job_id]));
  const jobIds = Array.from(new Set(Array.from(jobOf.values())));
  const jobs = jobIds.length ? await jobsDb().from('jobs').select('id, title').in('id', jobIds) : { data: [] };
  const titleBy = new Map(((jobs.data ?? []) as Array<{ id: string; title: string }>).map((j) => [j.id, j.title]));
  const reviews: ReviewRecord[] = rows.map((r) => ({
    id: r.id as string,
    contract_id: r.contract_id as string,
    reviewer_role: r.reviewer_role as ReviewRecord['reviewer_role'],
    reviewer_name: nameBy.get(r.reviewer_user_id as string)?.trim() || (r.reviewer_role === 'customer' ? 'A customer' : 'A provider'),
    overall: Number(r.overall),
    quality: Number(r.quality),
    communication: Number(r.communication),
    timeliness: Number(r.timeliness),
    body: (r.body as string | null) ?? null,
    job_title: titleBy.get(jobOf.get(r.contract_id as string) ?? '') ?? null,
    agent_version: (r.subject_agent_version as string | null) ?? null,
    created_at: r.created_at as string,
  }));
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.overall, 0) / reviews.length) * 10) / 10 : null;
  return {
    reviews,
    summary: {
      count: reviews.length,
      average: avg,
      as_provider: reviews.filter((r) => r.reviewer_role === 'customer').length,
      as_customer: reviews.filter((r) => r.reviewer_role === 'provider').length,
    },
  };
}

/** Average rating and count of reviews about each principal (for customer/poster badges). */
export async function ratingsForPrincipals(principalIds: string[]): Promise<Map<string, { count: number; average: number }>> {
  const out = new Map<string, { count: number; average: number }>();
  const ids = Array.from(new Set(principalIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const { data, error } = await jobsDb().from('reviews').select('subject_principal_id, overall').in('subject_principal_id', ids);
  if (error) throw dbError(error, 'ratings');
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of (data ?? []) as Array<{ subject_principal_id: string; overall: number }>) {
    const a = acc.get(r.subject_principal_id) ?? { sum: 0, count: 0 };
    a.sum += Number(r.overall);
    a.count += 1;
    acc.set(r.subject_principal_id, a);
  }
  for (const [id, a] of acc) out.set(id, { count: a.count, average: Math.round((a.sum / a.count) * 10) / 10 });
  return out;
}
