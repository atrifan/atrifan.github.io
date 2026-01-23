import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { getApiKeyByUserAndServer } from '@/src/lib/supabase-services';
import { isHigherOrEqualTo } from '@/src/config/billing.config';

/**
 * Determine user's effective plan from Clerk session claims
 * Session claims contain `pla` field with format like 'u:pro', 'u:plus', 'u:free'
 */
function getUserPlanFromClaims(sessionClaims: Record<string, unknown> | null): string {
  if (!sessionClaims) return 'free';

  // Check pla (plan) claim - format is 'u:pro', 'u:plus', etc.
  const plaClaim = sessionClaims.pla as string | undefined;
  if (plaClaim) {
    // Extract plan from 'u:pro' format
    if (plaClaim.includes(':')) {
      const plan = plaClaim.split(':')[1];
      if (plan === 'pro' || plan === 'plus' || plan === 'free') {
        return plan;
      }
    }
    // Direct value
    if (plaClaim === 'pro' || plaClaim === 'plus' || plaClaim === 'free') {
      return plaClaim;
    }
  }

  return 'free';
}

/**
 * List API keys for the authenticated user
 * GET /api/keys/list
 *
 * Fetches API key from Supabase, validates plan matches current user plan.
 * If plan differs, returns needsRegenerate flag.
 */
export async function GET() {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Get current user plan from session claims
    const userPlan = getUserPlanFromClaims(sessionClaims as Record<string, unknown> | null);

    // Check Supabase for existing API key
    const supabaseKey = await getApiKeyByUserAndServer(userId, 'default');

    // Detect provider mismatch - compare Supabase provider with current config
    const currentProvider = useClerkApiKeys() ? 'clerk' : 'custom';
    const providerChanged = supabaseKey && supabaseKey.provider !== currentProvider;

    if (supabaseKey) {
      // Check if plan changed - need to regenerate (case-insensitive comparison)
      const storedPlan = supabaseKey.plan?.toLowerCase() || 'free';
      const currentPlan = userPlan.toLowerCase();
      const needsRegenerate = storedPlan !== currentPlan;

      // For Clerk provider, get the actual secret
      if (supabaseKey.provider === 'clerk' && useClerkApiKeys()) {
        try {
          const apiKeys = await client.apiKeys.list({ subject: userId });
          const activeKey = apiKeys.data.find(key => !key.revoked && !key.expired);

          if (activeKey) {
            const secretResponse = await client.apiKeys.getSecret(activeKey.id);

            return NextResponse.json({
              hasKey: true,
              apiKey: secretResponse.secret,
              apiKeyId: supabaseKey.id,
              provider: 'clerk',
              plan: supabaseKey.plan,
              currentPlan: userPlan,
              needsRegenerate,
              providerChanged,
              createdAt: supabaseKey.created_at,
              lastUsedAt: supabaseKey.last_used_at,
            });
          }
        } catch (e) {
          console.error('Error fetching Clerk API key:', e);
        }
      }

      // For custom provider or if Clerk fetch failed, return stored key
      return NextResponse.json({
        hasKey: true,
        apiKey: supabaseKey.api_key || null, // Return stored plaintext key
        apiKeySuffix: supabaseKey.api_key_suffix,
        apiKeyId: supabaseKey.id,
        provider: supabaseKey.provider,
        plan: supabaseKey.plan,
        currentPlan: userPlan,
        needsRegenerate,
        providerChanged,
        createdAt: supabaseKey.created_at,
        lastUsedAt: supabaseKey.last_used_at,
      });
    }

    // No key found
    return NextResponse.json({
      hasKey: false,
      apiKey: null,
      provider: currentProvider,
      currentPlan: userPlan,
      providerChanged,
    });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}

