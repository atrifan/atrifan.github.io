import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getApiKeyByHash, hashApiKey } from '@/src/lib/supabase-services';
import { clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { decryptApiKey, isApiKeyExpired } from '@/src/utils/apiKeyEncryption';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

export interface AuthResult {
  userId: string | null;
  plan?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Validate API key - supports both Clerk-created and internally-created keys
 *
 * Flow:
 * 1. Hash key and look up in Supabase api_keys table
 * 2. If found and active, get user_id and plan
 * 3. If provider is 'clerk', also verify with Clerk API
 * 4. If not in Supabase, try legacy validation (encrypted key or Clerk direct)
 */
async function validateApiKey(apiKey: string): Promise<AuthResult> {
  // 1. Check Supabase by hash (works for both Clerk and internal keys)
  try {
    const keyHash = hashApiKey(apiKey);
    const supabaseKey = await getApiKeyByHash(keyHash);

    if (supabaseKey) {
      if (!supabaseKey.is_active) {
        return { userId: null, error: 'API key has been revoked', statusCode: 401 };
      }

      // If Clerk provider, also verify with Clerk
      if (supabaseKey.provider === 'clerk' && useClerkApiKeys()) {
        try {
          const client = await clerkClient();
          const clerkKey = await client.apiKeys.verify(apiKey);
          if (!clerkKey || clerkKey.revoked || clerkKey.expired) {
            return { userId: null, error: 'API key has been revoked or expired', statusCode: 401 };
          }
        } catch {
          return { userId: null, error: 'API key verification failed', statusCode: 401 };
        }
      }

      return {
        userId: supabaseKey.user_id,
        plan: supabaseKey.plan
      };
    }
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);
  }

  // 2. Try legacy encrypted key (tlz_* format)
  if (apiKey.startsWith('tlz_')) {
    const payload = decryptApiKey(apiKey);
    if (payload && !isApiKeyExpired(payload)) {
      return { userId: payload.userId, plan: payload.plan };
    }
  }

  // 3. Try Clerk API Keys directly if enabled
  if (useClerkApiKeys()) {
    try {
      const client = await clerkClient();
      const clerkKey = await client.apiKeys.verify(apiKey);
      if (clerkKey && !clerkKey.revoked && !clerkKey.expired) {
        return { userId: clerkKey.subject, plan: 'pro' };
      }
    } catch {
      // Not a valid Clerk key
    }
  }

  return { userId: null, error: 'Invalid API key', statusCode: 401 };
}

/**
 * Extract and validate API key from request headers
 *
 * Checks:
 * 1. Authorization: Bearer <api_key>
 * 2. X-API-Key: <api_key>
 *
 * Returns userId and plan if valid, error if not.
 * Requires pro+ plan for API access.
 */
export async function validateApiKeyFromRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');

  let apiKey: string | null = null;

  if (authHeader?.startsWith('Bearer ') && !authHeader.slice(7).startsWith('ey')) {
    // Bearer token that's not a JWT (JWTs start with 'ey')
    apiKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader;
  }

  if (!apiKey) {
    return { userId: null, error: 'No API key provided', statusCode: 401 };
  }

  const keyResult = await validateApiKey(apiKey);
  if (keyResult.error) {
    return keyResult;
  }

  // Check plan - require pro+ for API access
  if (keyResult.plan === 'free') {
    return {
      userId: null,
      error: 'API access requires Pro plan. Upgrade at tulzo.com/pricing',
      statusCode: 403
    };
  }

  return keyResult;
}

/**
 * Validate request for automation endpoints
 *
 * Supports multiple auth methods:
 * 1. Clerk session (for UI calls)
 * 2. API key in Authorization header: "Bearer <api_key>"
 * 3. API key in X-API-Key header
 * 4. Internal call header (x-internal-call: true) - trusts automation ownership
 *
 * After getting userId, verifies ownership of the automation.
 * Requires pro+ plan for API key access.
 */
export async function validateAutomationAccess(
  request: NextRequest,
  automationId: string
): Promise<AuthResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let userId: string | null = null;
  let plan: string | undefined;

  // 1. Check for internal call (bypasses auth, trusts automation ownership)
  const isInternalCall = request.headers.get('x-internal-call') === 'true';
  if (isInternalCall) {
    const { data: automation } = await supabase
      .from('automations')
      .select('user_id')
      .eq('id', automationId)
      .single();

    if (!automation) {
      return { userId: null, error: 'Automation not found', statusCode: 404 };
    }
    return { userId: automation.user_id };
  }

  // 2. Try Clerk session auth (for UI calls)
  try {
    const { userId: clerkUserId } = await auth();
    if (clerkUserId) {
      userId = clerkUserId;
      plan = 'session'; // Session users have their plan checked elsewhere
    }
  } catch {
    // Clerk auth failed, try API key
  }

  // 3. Try API key from headers
  if (!userId) {
    const authHeader = request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-api-key');

    let apiKey: string | null = null;

    if (authHeader?.startsWith('Bearer ') && !authHeader.slice(7).startsWith('ey')) {
      // Bearer token that's not a JWT (JWTs start with 'ey')
      apiKey = authHeader.slice(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (apiKey) {
      const keyResult = await validateApiKey(apiKey);
      if (keyResult.error) {
        return keyResult;
      }
      userId = keyResult.userId;
      plan = keyResult.plan;

      // Check plan - require pro+ for API access
      if (plan === 'free') {
        return {
          userId: null,
          error: 'API access requires Pro plan. Upgrade at tulzo.com/pricing',
          statusCode: 403
        };
      }
    }
  }

  // No auth found
  if (!userId) {
    return { userId: null, error: 'Unauthorized', statusCode: 401 };
  }

  // Verify automation ownership
  const { data: automation, error: fetchError } = await supabase
    .from('automations')
    .select('id')
    .eq('id', automationId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !automation) {
    return { userId: null, error: 'Automation not found or access denied', statusCode: 404 };
  }

  return { userId, plan };
}

/**
 * Validate request for execution endpoints
 * 
 * Same as validateAutomationAccess but also verifies the execution belongs to the automation.
 */
export async function validateExecutionAccess(
  request: NextRequest,
  automationId: string,
  executionId: string
): Promise<AuthResult> {
  const authResult = await validateAutomationAccess(request, automationId);
  if (authResult.error) {
    return authResult;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify execution belongs to automation
  const { data: execution, error } = await supabase
    .from('automation_executions')
    .select('id')
    .eq('id', executionId)
    .eq('automation_id', automationId)
    .single();

  if (error || !execution) {
    return { userId: null, error: 'Execution not found', statusCode: 404 };
  }

  return authResult;
}

