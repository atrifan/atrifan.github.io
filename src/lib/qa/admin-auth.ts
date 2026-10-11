/**
 * Caller identity + admin rights for the Admin QA MCP.
 *
 * Same credentials as the other MCP servers:
 *  - `x-api-key: ak_…` (or `Authorization: Bearer ak_…|tlz_…`): an active device key,
 *    looked up by SHA-256 hash. QA review keys are refused here: they only work on /api/chat.
 *  - `Authorization: Bearer <token>`: a Clerk session JWT (verifyToken) or a Clerk OAuth
 *    access token (FAPI /oauth/userinfo).
 *  - the gigs e2e identity header (non-production with JOBS_E2E_AUTH_SECRET only).
 * Admin = src/lib/admin.ts allow-list (seed + ADMIN_EMAILS), Clerk publicMetadata.role
 * 'admin', or ADMIN_USER_IDS. For the e2e identity only ADMIN_USER_IDS counts (no Clerk call).
 *
 * The minimal Clerk pieces below are copied from app/api/mcp/route.ts (not exported there).
 */
import { createHash } from 'node:crypto';
import { clerkClient, verifyToken } from '@clerk/nextjs/server';
import { jobsDb } from '../jobs/db';
import { e2eUser } from '../jobs/http';
import { getAdminEmails } from '../admin';
import { adminUserIdsFromEnv, isQaAdmin } from './admin-check';

export type QaCaller =
  | { authenticated: true; userId: string; isAdmin: boolean; method: 'api_key' | 'bearer' | 'e2e' }
  | { authenticated: false; error: string };

function clerkFrontendApi(): string | null {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (publishableKey) {
    try {
      const decoded = Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ''), 'base64').toString('utf-8').replace(/\$+$/, '');
      if (decoded.includes('.clerk.')) return `https://${decoded}`;
    } catch {
      // fall through
    }
  }
  return process.env.CLERK_HOST || null;
}

async function userFromApiKey(key: string): Promise<string | null> {
  const { data, error } = await jobsDb()
    .from('api_keys')
    .select('user_id, is_active, purpose')
    .eq('api_key_hash', createHash('sha256').update(key).digest('hex'))
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { user_id: string; is_active: boolean; purpose: string | null };
  if (!row.is_active || row.purpose === 'qa_review') return null;
  return row.user_id;
}

async function userFromBearer(token: string): Promise<string | null> {
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    if (payload?.sub) return payload.sub;
  } catch {
    // not a Clerk session JWT; try as an OAuth access token
  }
  const fapi = clerkFrontendApi();
  if (!fapi) return null;
  try {
    const res = await fetch(`${fapi}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const info = (await res.json()) as { sub?: string };
    return info.sub || null;
  } catch {
    return null;
  }
}

export async function clerkAdmin(userId: string): Promise<boolean> {
  const policy = { adminEmails: getAdminEmails(), adminUserIds: adminUserIdsFromEnv() };
  if (isQaAdmin({ userId }, policy)) return true;
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return isQaAdmin(
      {
        userId,
        emails: (user.emailAddresses ?? []).map((e: { emailAddress: string }) => e.emailAddress),
        publicMetadata: (user.publicMetadata ?? {}) as Record<string, unknown>,
      },
      policy,
    );
  } catch (err) {
    console.error('[qa] admin lookup failed:', err instanceof Error ? err.message : 'error');
    return false;
  }
}

export async function authenticateQaCaller(request: Request): Promise<QaCaller> {
  const testUser = e2eUser(request);
  if (testUser) {
    return { authenticated: true, userId: testUser, isAdmin: adminUserIdsFromEnv().includes(testUser), method: 'e2e' };
  }
  const headerKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const apiKey = headerKey || (/^(ak_|tlz_)/.test(bearer) ? bearer : '');

  let userId: string | null = null;
  let method: 'api_key' | 'bearer' = 'api_key';
  if (apiKey) {
    userId = await userFromApiKey(apiKey);
    if (!userId) return { authenticated: false, error: 'Invalid, revoked or non-admin-capable API key' };
  } else if (bearer) {
    method = 'bearer';
    userId = await userFromBearer(bearer);
    if (!userId) return { authenticated: false, error: 'Invalid or expired bearer token' };
  } else {
    return { authenticated: false, error: 'Authentication required. Use x-api-key or an OAuth bearer token.' };
  }
  return { authenticated: true, userId, isAdmin: await clerkAdmin(userId), method };
}
