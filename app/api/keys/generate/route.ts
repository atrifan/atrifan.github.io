import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import {
  getApiKeyByUserAndServer,
  createApiKey,
  deleteApiKey,
  linkAllNativeToolsToServer,
  hashApiKey,
  getApiKeySuffix,
} from '@/src/lib/supabase-services';

/**
 * Determine user's effective plan from Clerk session claims
 * Session claims contain `pla` field with format like 'u:pro', 'u:plus', 'u:free'
 */
function getUserPlanFromClaims(sessionClaims: Record<string, unknown> | null): 'free' | 'pro' | 'plus' {
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
 * Generate a new API key for the authenticated user
 * POST /api/keys/generate
 *
 * - Uses Clerk's API Keys feature for key generation
 * - Stores key metadata in Supabase
 * - Links all NATIVE tools to the new server
 * - Handles plan changes by regenerating key
 */
export async function POST() {
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

    // Determine user's plan from session claims
    const plan = getUserPlanFromClaims(sessionClaims as Record<string, unknown> | null);

    // Check if user already has an API key for default server
    const existingKey = await getApiKeyByUserAndServer(userId, 'default');

    // If existing key, delete it from Supabase
    if (existingKey) {
      // Delete from Supabase (cascades to server_tools)
      await deleteApiKey(existingKey.id);
    }

    // Always clean up any existing Clerk API keys for this user (revoked or not)
    // This prevents "token with same name and subject already exists" conflicts
    // includeInvalid: true ensures we also get revoked keys
    try {
      const existingClerkKeys = await client.apiKeys.list({
        subject: userId,
        includeInvalid: true
      });
      console.log(`Found ${existingClerkKeys.data.length} existing Clerk keys for user ${userId}`);
      for (const key of existingClerkKeys.data) {
        // Delete the key entirely (not just revoke)
        try {
          console.log(`Deleting Clerk key ${key.id} (revoked: ${key.revoked})`);
          await client.apiKeys.delete(key.id);
        } catch (deleteErr) {
          console.error(`Error deleting Clerk key ${key.id}:`, deleteErr);
        }
      }
    } catch (e) {
      console.error('Error listing/deleting Clerk keys:', e);
    }

    // Generate new API key
    let apiKeySecret: string;
    let provider: 'clerk' | 'custom' = 'clerk';

    if (useClerkApiKeys()) {
      // Use Clerk's API Keys feature
      const apiKey = await client.apiKeys.create({
        name: 'MCP Server Access',
        subject: userId,
        description: 'API key for MCP server access',
        scopes: ['mcp:access'],
      });

      if (!apiKey.secret) {
        return NextResponse.json(
          { error: 'Failed to generate API key secret' },
          { status: 500 }
        );
      }

      apiKeySecret = apiKey.secret;
      provider = 'clerk';
    } else {
      // Generate a random API key (custom provider)
      const randomBytes = require('crypto').randomBytes(24);
      apiKeySecret = `ak_${randomBytes.toString('base64url').toUpperCase().slice(0, 32)}`;
      provider = 'custom';
    }

    // Store in Supabase
    const newApiKey = await createApiKey({
      user_id: userId,
      api_key_hash: hashApiKey(apiKeySecret),
      api_key_suffix: getApiKeySuffix(apiKeySecret),
      name: 'Default Key',
      server_name: 'default',
      provider,
      plan,
    });

    // Link all NATIVE tools to this server
    await linkAllNativeToolsToServer(newApiKey.id);

    return NextResponse.json({
      success: true,
      apiKey: apiKeySecret,
      apiKeyId: newApiKey.id,
      provider,
      plan,
      createdAt: newApiKey.created_at,
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    return NextResponse.json(
      { error: 'Failed to generate API key' },
      { status: 500 }
    );
  }
}

