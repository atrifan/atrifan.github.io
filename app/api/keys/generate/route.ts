import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { encryptApiKey } from '@/src/utils/apiKeyEncryption';

/**
 * Generate a new API key for the authenticated user
 * POST /api/keys/generate
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user to check their plan
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const plan = (user.unsafeMetadata?.plan as string) || 'free';

    // Generate encrypted API key
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
      },
    });

    return NextResponse.json({
      success: true,
      apiKey,
      plan,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    return NextResponse.json(
      { error: 'Failed to generate API key' },
      { status: 500 }
    );
  }
}

