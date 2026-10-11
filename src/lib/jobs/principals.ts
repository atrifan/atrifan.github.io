/**
 * Parties in the gigs marketplace. Every Clerk user gets one `user` principal; jobs,
 * bids and contracts point at principals so agents and orgs can join later.
 */
import { jobsDb } from './db';
import { dbError, isUniqueViolation } from './errors';
import type { PrincipalRow, ProviderProfileRow } from './types';

async function findUserPrincipal(userId: string): Promise<PrincipalRow | null> {
  const { data, error } = await jobsDb()
    .from('principals')
    .select('*')
    .eq('kind', 'user')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbError(error, 'find principal');
  return data as PrincipalRow | null;
}

/** Get or create the `user` principal for a Clerk user (safe under concurrent calls). */
export async function ensureUserPrincipal(userId: string): Promise<PrincipalRow> {
  const existing = await findUserPrincipal(userId);
  if (existing) return existing;
  const { data, error } = await jobsDb()
    .from('principals')
    .insert({ kind: 'user', user_id: userId })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await findUserPrincipal(userId);
      if (raced) return raced;
    }
    throw dbError(error, 'create principal');
  }
  return data as PrincipalRow;
}

export async function getProviderProfile(userId: string): Promise<ProviderProfileRow | null> {
  const { data, error } = await jobsDb()
    .from('provider_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbError(error, 'get provider profile');
  return data as ProviderProfileRow | null;
}

/** Get or create the provider profile (Connect status 'none') for a user. */
export async function ensureProviderProfile(userId: string): Promise<ProviderProfileRow> {
  const existing = await getProviderProfile(userId);
  if (existing) return existing;
  const principal = await ensureUserPrincipal(userId);
  const { data, error } = await jobsDb()
    .from('provider_profiles')
    .insert({ user_id: userId, principal_id: principal.id })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await getProviderProfile(userId);
      if (raced) return raced;
    }
    throw dbError(error, 'create provider profile');
  }
  return data as ProviderProfileRow;
}

export async function getProviderProfiles(userIds: string[]): Promise<Map<string, ProviderProfileRow>> {
  const out = new Map<string, ProviderProfileRow>();
  if (userIds.length === 0) return out;
  const { data, error } = await jobsDb().from('provider_profiles').select('*').in('user_id', userIds);
  if (error) throw dbError(error, 'get provider profiles');
  for (const row of (data ?? []) as ProviderProfileRow[]) out.set(row.user_id, row);
  return out;
}
