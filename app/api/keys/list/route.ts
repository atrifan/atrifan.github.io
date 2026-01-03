import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';

/**
 * List API keys for the authenticated user
 * GET /api/keys/list
 *
 * Supports two modes based on NEXT_PUBLIC_USE_CLERK_API_KEY:
 * - false (default): Read from unsafeMetadata
 * - true: Use Clerk's API Keys feature (beta)
 */
export async function GET() {
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

    // Detect provider mismatch for warning
    const storedProvider = user.unsafeMetadata?.apiKeyProvider as string | undefined;
    const currentProvider = useClerkApiKeys() ? 'clerk' : 'custom';
    const providerChanged = storedProvider && storedProvider !== currentProvider;

    if (useClerkApiKeys()) {
      // Use Clerk's API Keys feature (beta)
      const apiKeys = await client.apiKeys.list({ subject: userId });
      const activeKey = apiKeys.data.find(key => !key.revoked && !key.expired);

      if (activeKey) {
        const secretResponse = await client.apiKeys.getSecret(activeKey.id);

        return NextResponse.json({
          hasKey: true,
          apiKey: secretResponse.secret,
          apiKeyId: activeKey.id,
          provider: 'clerk',
          providerChanged,
          createdAt: new Date(activeKey.createdAt).toISOString(),
          lastUsedAt: activeKey.lastUsedAt ? new Date(activeKey.lastUsedAt).toISOString() : null,
        });
      }

      return NextResponse.json({
        hasKey: false,
        apiKey: null,
        provider: 'clerk',
        providerChanged,
      });
    } else {
      // Use custom encryption (default)
      const apiKey = user.unsafeMetadata?.apiKey as string | undefined;
      const apiKeyCreatedAt = user.unsafeMetadata?.apiKeyCreatedAt as string | undefined;

      if (apiKey) {
        return NextResponse.json({
          hasKey: true,
          apiKey,
          provider: 'custom',
          providerChanged,
          createdAt: apiKeyCreatedAt || null,
        });
      }

      return NextResponse.json({
        hasKey: false,
        apiKey: null,
        provider: 'custom',
        providerChanged,
      });
    }
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}

