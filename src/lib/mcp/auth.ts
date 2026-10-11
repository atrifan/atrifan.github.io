/**
 * Credential validation for Tulzo's MCP servers, moved verbatim from app/api/mcp/route.ts.
 *
 * - validateApiKey: Supabase `api_keys` by SHA-256 hash, then legacy Clerk / custom keys.
 * - validateBearerToken: Clerk session JWT or Clerk OAuth access token (userinfo), then the
 *   user's `api_keys` row for the plan. Results are cached for 5 minutes.
 *
 * Plan gating (Free is blocked on /api/mcp with -32003) is the caller's decision.
 */
import { clerkClient, verifyToken } from '@clerk/nextjs/server';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { isHigherOrEqualTo } from '@/src/config/billing.config';
import { getApiKeyByHash, getApiKeyByUserAndServer, hashApiKey } from '@/src/lib/supabase-services';
import type { AuthResult } from './jsonrpc-core';

export type { AuthMethod, AuthResult } from './jsonrpc-core';

// Simple in-memory cache for OAuth token validation
// Cache entries expire after 5 minutes
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const authCache = new Map<string, { result: AuthResult; expiresAt: number }>();

function getCachedAuth(token: string): AuthResult | null {
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  if (cached) {
    authCache.delete(token); // Clean up expired entry
  }
  return null;
}

function setCachedAuth(token: string, result: AuthResult): void {
  // Limit cache size to prevent memory issues
  if (authCache.size > 1000) {
    // Clear oldest entries (first 100)
    const keys = Array.from(authCache.keys()).slice(0, 100);
    keys.forEach(k => authCache.delete(k));
  }
  authCache.set(token, { result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

/**
 * Check if user has Pro or higher subscription
 * Checks user metadata which is updated by billing webhooks
 */
async function checkProSubscription(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<{ isPro: boolean; plan: string }> {
  try {
    const user = await client.users.getUser(userId);

    // Check publicMetadata first (set by billing webhooks)
    if (user.publicMetadata?.plan) {
      const plan = user.publicMetadata.plan as string;
      return { isPro: isHigherOrEqualTo(plan, 'pro'), plan };
    }

    // Check for active subscription
    if (user.publicMetadata?.subscription === 'active') {
      return { isPro: true, plan: 'pro' };
    }

    return { isPro: false, plan: 'free' };
  } catch (error) {
    console.error('Error checking subscription:', error);
    return { isPro: false, plan: 'free' };
  }
}

/**
 * Validate API key against Supabase first, then Clerk if provider is clerk
 *
 * Flow:
 * 1. Hash the key and look it up in Supabase api_keys table
 * 2. If found and active, get plan from DB
 * 3. If provider is 'clerk', also verify with Clerk API
 * 4. If not in Supabase, try legacy validation (Clerk or custom encryption)
 */
export async function validateApiKey(key: string, serverName: string = 'default'): Promise<AuthResult> {
  // First, check Supabase by hash
  try {
    const keyHash = hashApiKey(key);
    const supabaseKey = await getApiKeyByHash(keyHash);

    if (supabaseKey) {
      // Key found in Supabase
      if (!supabaseKey.is_active) {
        return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
      }

      // Check plan - free users cannot use MCP
      if (supabaseKey.plan === 'free') {
        return {
          authenticated: true,
          userId: supabaseKey.user_id,
          apiKeyId: supabaseKey.id,
          serverName: supabaseKey.server_name,
          plan: 'free',
          isSubscribed: false,
          authMethod: 'header',
        };
      }

      // If Clerk provider, also verify with Clerk
      if (supabaseKey.provider === 'clerk' && useClerkApiKeys()) {
        try {
          const client = await clerkClient();
          const clerkKey = await client.apiKeys.verify(key);
          if (!clerkKey || clerkKey.revoked || clerkKey.expired) {
            return { authenticated: false, authMethod: 'none', error: 'API key has been revoked or expired' };
          }
        } catch (e) {
          console.error('Clerk verification failed:', e);
          return { authenticated: false, authMethod: 'none', error: 'API key verification failed' };
        }
      }

      // Valid key with pro/plus plan
      return {
        authenticated: true,
        userId: supabaseKey.user_id,
        apiKeyId: supabaseKey.id,
        serverName: supabaseKey.server_name,
        plan: supabaseKey.plan,
        isSubscribed: true,
        authMethod: 'header',
      };
    }
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);
    // Continue to legacy validation
  }

  // Legacy validation for keys not in Supabase
  const client = await clerkClient();

  // Try Clerk API Keys if enabled
  if (useClerkApiKeys()) {
    try {
      const apiKey = await client.apiKeys.verify(key);

      if (!apiKey) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid API key' };
      }

      if (apiKey.revoked) {
        return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
      }

      if (apiKey.expired) {
        return { authenticated: false, authMethod: 'none', error: 'API key has expired' };
      }

      const userId = apiKey.subject;

      // Legacy Clerk key - assume Pro (only Pro+ could generate)
      return {
        authenticated: true,
        userId,
        plan: 'pro',
        isSubscribed: true,
        authMethod: 'header',
      };
    } catch (error) {
      console.error('Error validating API key with Clerk:', error);
    }
  }

  // Try custom encryption (legacy)
  const payload = decryptApiKey(key);
  if (!payload) {
    return { authenticated: false, authMethod: 'none', error: 'Invalid API key' };
  }
  if (isApiKeyExpired(payload)) {
    return { authenticated: false, authMethod: 'none', error: 'API key expired' };
  }

  // Legacy custom key - assume Pro
  return {
    authenticated: true,
    userId: payload.userId,
    plan: 'pro',
    isSubscribed: true,
    authMethod: 'header',
  };
}

/**
 * Get Clerk frontend API URL from publishable key
 */
export function getClerkFrontendApi(): string {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (publishableKey) {
    try {
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
      let decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      // Remove trailing $ that Clerk adds to the encoded domain
      decoded = decoded.replace(/\$+$/, '');
      if (decoded && decoded.includes('.clerk.')) {
        return `https://${decoded}`;
      }
    } catch {
      // Use default
    }
  }
  return process.env.CLERK_HOST || 'https://quick-adder-16.clerk.accounts.dev';
}

/**
 * Validate OAuth bearer token
 *
 * For bearer tokens: First try as Clerk session JWT, then as OAuth access token.
 * After validating identity, check Supabase for API key and plan.
 * If no API key in Supabase, user cannot use MCP (even if Pro).
 *
 * Results are cached for 5 minutes to avoid repeated API calls.
 */
export async function validateBearerToken(token: string, serverName: string = 'default'): Promise<AuthResult> {
  // Check cache first
  const cached = getCachedAuth(token);
  if (cached) {
    return cached;
  }

  let userId: string | null = null;

  // First, try to verify as a Clerk session JWT
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (payload && payload.sub) {
      userId = payload.sub;
    }
  } catch (jwtError) {
    // Not a valid JWT, try as OAuth access token
    console.log('Token is not a JWT, trying as OAuth access token...');
  }

  // If not a JWT, try OAuth access token via userinfo endpoint
  if (!userId) {
    try {
      const clerkApi = getClerkFrontendApi();
      const userinfoResponse = await fetch(`${clerkApi}/oauth/userinfo`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!userinfoResponse.ok) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid OAuth access token' };
      }

      const userinfo = await userinfoResponse.json();

      if (!userinfo.sub) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid userinfo response' };
      }

      userId = userinfo.sub;
    } catch (error) {
      console.error('Error validating OAuth access token:', error);
      return { authenticated: false, authMethod: 'none', error: 'Invalid or expired bearer token' };
    }
  }

  if (!userId) {
    return { authenticated: false, authMethod: 'none', error: 'Could not determine user identity' };
  }

  // Now check Supabase for user's API key
  try {
    const apiKey = await getApiKeyByUserAndServer(userId, serverName);

    if (!apiKey) {
      // No API key in Supabase - user needs to generate one
      return {
        authenticated: true,
        userId,
        plan: 'unknown',
        isSubscribed: false,
        authMethod: 'oauth',
        error: 'No API key found. Please generate an API key from your dashboard.',
      };
    }

    if (!apiKey.is_active) {
      return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
    }

    // Check plan - free users cannot use MCP
    const isSubscribed = apiKey.plan !== 'free';

    const result: AuthResult = {
      authenticated: true,
      userId,
      apiKeyId: apiKey.id,
      serverName: apiKey.server_name,
      plan: apiKey.plan,
      isSubscribed,
      authMethod: 'oauth',
    };

    setCachedAuth(token, result);
    return result;
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);

    // Fallback to Clerk metadata check
    const client = await clerkClient();
    const subscription = await checkProSubscription(client, userId);

    const result: AuthResult = {
      authenticated: true,
      userId,
      plan: subscription.plan,
      isSubscribed: subscription.isPro,
      authMethod: 'oauth',
    };
    setCachedAuth(token, result);
    return result;
  }
}
