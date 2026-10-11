/**
 * Who is calling the Jobs MCP. The agent acts as the user behind the credentials:
 *   - Tulzo API key (x-api-key or Bearer tlz_…)       → validateApiKey
 *   - Clerk OAuth access token or session JWT (Bearer) → validateBearerToken
 *   - dev-only test identity (x-e2e-user + x-e2e-secret, see jobs/http.ts)
 * Unlike /api/mcp, the Free plan is allowed: posting jobs and bidding is free.
 * Forwarded identity headers (X-User-Id from /api/mcp/[key]) are never trusted here.
 */
import { clerkClient } from '@clerk/nextjs/server';
import { extractAuth, type AuthResult } from '@/src/lib/mcp/jsonrpc-core';
import { validateApiKey, validateBearerToken } from '@/src/lib/mcp/auth';
import { normalizePlan, type PlanKey } from '@/src/lib/plans';
import { e2eUser } from '../http';
import type { AgentClient } from '../agent-identities';

export interface JobsCaller {
  userId: string;
  plan: PlanKey;
  authMethod: 'api_key' | 'oauth' | 'test';
  client: AgentClient;
}

export type JobsAuth = { ok: true; caller: JobsCaller } | { ok: false; message: string };

const CLIENT_ID_TTL_MS = 5 * 60 * 1000;
const clientIdCache = new Map<string, { clientId: string; expiresAt: number }>();

function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The OAuth client behind an already-validated token: `client_id` / `azp` for JWTs, else
 * Clerk's access-token lookup. Every agent signing in through the /api/oauth proxy gets a
 * token for the one Clerk OAuth app, so this is usually the same id for all of a user's agents.
 */
async function oauthClientId(token: string): Promise<string> {
  const cached = clientIdCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.clientId;
  const claims = jwtClaims(token);
  let clientId = typeof claims?.client_id === 'string' ? claims.client_id : typeof claims?.azp === 'string' ? claims.azp : null;
  if (!clientId) {
    try {
      const verified = await (await clerkClient()).idPOAuthAccessToken.verify(token);
      clientId = verified.clientId || null;
    } catch {
      // older tokens or a Clerk outage: fall back to the proxy's client id below
    }
  }
  clientId ??= process.env.NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID || 'clerk-oauth';
  if (clientIdCache.size > 1000) clientIdCache.clear();
  clientIdCache.set(token, { clientId, expiresAt: Date.now() + CLIENT_ID_TTL_MS });
  return clientId.slice(0, 200);
}

function fromResult(result: AuthResult): { userId: string; plan: PlanKey } | null {
  if (!result.authenticated || !result.userId) return null;
  return { userId: result.userId, plan: normalizePlan(result.plan) };
}

export async function authenticateJobsAgent(request: Request): Promise<JobsAuth> {
  const testUser = e2eUser(request);
  if (testUser) {
    const clientId = (request.headers.get('x-e2e-client') || 'default').slice(0, 200);
    return {
      ok: true,
      caller: { userId: testUser, plan: normalizePlan(request.headers.get('x-e2e-plan')), authMethod: 'test', client: { kind: 'test', clientId } },
    };
  }

  const { apiKey, authMethod } = extractAuth(request.headers);
  if (!apiKey || (authMethod !== 'header' && authMethod !== 'oauth')) {
    return { ok: false, message: 'Authentication required. Sign in with OAuth or send a Tulzo API key (x-api-key or Bearer).' };
  }
  try {
    if (authMethod === 'header') {
      const result = await validateApiKey(apiKey);
      const who = fromResult(result);
      if (!who) return { ok: false, message: result.error || 'Invalid API key' };
      const client: AgentClient = result.apiKeyId ? { kind: 'api_key', apiKeyId: result.apiKeyId } : { kind: 'oauth', clientId: 'legacy-api-key' };
      return { ok: true, caller: { ...who, authMethod: 'api_key', client } };
    }
    const result = await validateBearerToken(apiKey);
    const who = fromResult(result);
    if (!who) return { ok: false, message: result.error || 'Invalid or expired bearer token' };
    return { ok: true, caller: { ...who, authMethod: 'oauth', client: { kind: 'oauth', clientId: await oauthClientId(apiKey) } } };
  } catch (err) {
    console.error('[jobs-mcp] credential check failed:', err instanceof Error ? err.message : err);
    return { ok: false, message: 'Could not verify credentials' };
  }
}
