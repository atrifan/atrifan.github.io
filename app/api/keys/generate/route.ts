import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { encryptApiKey, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';

/**
 * Generate a new API key for the authenticated user
 * POST /api/keys/generate
 *
 * Supports two modes based on NEXT_PUBLIC_USE_CLERK_API_KEY:
 * - false (default): Custom encryption stored in unsafeMetadata
 * - true: Clerk's built-in API Keys feature (beta)
 */
export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const plan = (user.unsafeMetadata?.plan as string) || 'free';

    // Check which API key provider to use
    if (useClerkApiKeys()) {
      // Use Clerk's API Keys feature (beta)

      // First, revoke any existing API keys for this user
      const existingKeys = await client.apiKeys.list({ subject: userId });
      for (const key of existingKeys.data) {
        if (!key.revoked) {
          await client.apiKeys.revoke({
            apiKeyId: key.id,
            revocationReason: 'Replaced by new key'
          });
        }
      }

      // Create a new API key using Clerk's API Keys feature
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

      // Store provider info in unsafeMetadata for provider change detection
      await client.users.updateUser(userId, {
        unsafeMetadata: {
          ...user.unsafeMetadata,
          apiKeyProvider: 'clerk',
          apiKeyCreatedAt: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        success: true,
        apiKey: apiKey.secret,
        apiKeyId: apiKey.id,
        provider: 'clerk',
        createdAt: new Date(apiKey.createdAt).toISOString(),
      });
    } else {
      // Use custom encryption (default)

      const apiKey = encryptApiKey({
        userId,
        plan: plan as 'free' | 'pro',
        createdAt: Date.now(),
      });

      // Store the key in user metadata (for reference/revocation)
      await client.users.updateUser(userId, {
        unsafeMetadata: {
          ...user.unsafeMetadata,
          apiKey,
          apiKeyCreatedAt: new Date().toISOString(),
          apiKeyProvider: 'custom',
        },
      });

      return NextResponse.json({
        success: true,
        apiKey,
        provider: 'custom',
        plan,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error generating API key:', error);
    return NextResponse.json(
      { error: 'Failed to generate API key' },
      { status: 500 }
    );
  }
}

