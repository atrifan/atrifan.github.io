/**
 * Offers: what a provider is willing to do, independent of a job.
 */
import { jobsDb } from './db';
import { dbError } from './errors';
import { ensureUserPrincipal } from './principals';
import type { CreateOfferInput, OfferListQuery } from './schemas';
import type { OfferRow } from './types';

export async function createOffer(userId: string, input: CreateOfferInput): Promise<OfferRow> {
  const principal = await ensureUserPrincipal(userId);
  const { data, error } = await jobsDb()
    .from('offers')
    .insert({
      user_id: userId,
      provider_principal_id: principal.id,
      title: input.title,
      description: input.description,
      price_cents: input.price_cents,
      delivery_days: input.delivery_days,
      tags: input.tags,
      category: input.category ?? null,
    })
    .select('*')
    .single();
  if (error) throw dbError(error, 'create offer');
  return data as OfferRow;
}

/** Public listing shows active offers; `mine` shows all of the caller's offers. */
export async function listOffers(
  userId: string,
  query: OfferListQuery,
): Promise<{ offers: OfferRow[]; total: number; limit: number; offset: number }> {
  let q = jobsDb().from('offers').select('*', { count: 'exact' });
  q = query.mine ? q.eq('user_id', userId) : q.eq('status', 'active');
  if (query.category) q = q.eq('category', query.category);
  if (query.q) q = q.or(`title.ilike.*${query.q}*,description.ilike.*${query.q}*`);
  if (query.min_price_cents != null) q = q.gte('price_cents', query.min_price_cents);
  if (query.max_price_cents != null) q = q.lte('price_cents', query.max_price_cents);
  q = q.order('created_at', { ascending: false }).range(query.offset, query.offset + query.limit - 1);
  const { data, error, count } = await q;
  if (error) throw dbError(error, 'list offers');
  const offers = (data ?? []) as OfferRow[];
  return { offers, total: count ?? offers.length, limit: query.limit, offset: query.offset };
}
