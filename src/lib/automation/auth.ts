import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getApiKeyByHash, hashApiKey } from '@/src/lib/supabase-services';
import { clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

export interface AuthResult {
  userId: string | null;
  error?: string;
  statusCode?: number;
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
 */
export async function validateAutomationAccess(
  request: NextRequest,
  automationId: string
): Promise<AuthResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let userId: string | null = null;

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
    }
  } catch {
    // Clerk auth failed, try API key
  }

  // 3. Try API key from headers
  if (!userId) {
    const authHeader = request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-api-key');
    
    let apiKey: string | null = null;
    
    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (apiKey) {
      const keyHash = hashApiKey(apiKey);
      const apiKeyRecord = await getApiKeyByHash(keyHash);

      if (!apiKeyRecord) {
        return { userId: null, error: 'Invalid API key', statusCode: 401 };
      }

      if (!apiKeyRecord.is_active) {
        return { userId: null, error: 'API key has been revoked', statusCode: 401 };
      }

      // If Clerk provider, also verify with Clerk
      if (apiKeyRecord.provider === 'clerk' && useClerkApiKeys()) {
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

      userId = apiKeyRecord.user_id;
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

  return { userId };
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

