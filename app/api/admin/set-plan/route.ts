import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/set-plan
 * 
 * Admin endpoint to manually set a user's plan for testing.
 * Only works in development or for the user themselves.
 * 
 * Body: { plan: 'free' | 'pro' | 'plus' }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !['free', 'pro', 'plus'].includes(plan)) {
      return NextResponse.json({ 
        error: 'Invalid plan. Must be one of: free, pro, plus' 
      }, { status: 400 });
    }

    const client = await clerkClient();

    // Update user's public metadata with the new plan
    await client.users.updateUser(userId, {
      publicMetadata: {
        plan: plan,
        subscription: plan === 'free' ? 'inactive' : 'active',
      },
    });

    console.log(`[admin] Set plan for user ${userId} to: ${plan}`);

    return NextResponse.json({ 
      success: true, 
      userId,
      plan,
      message: `Plan set to ${plan}. You may need to sign out and back in for session claims to update.`
    });
  } catch (error) {
    console.error('Error setting plan:', error);
    return NextResponse.json({ error: 'Failed to set plan' }, { status: 500 });
  }
}

/**
 * GET /api/admin/set-plan
 * 
 * Get current user's plan info
 */
export async function GET() {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    return NextResponse.json({
      userId,
      publicMetadata: user.publicMetadata,
      sessionClaims: {
        pla: sessionClaims?.pla,
        // Include other relevant claims
      },
      detectedPlan: user.publicMetadata?.plan || 'free',
    });
  } catch (error) {
    console.error('Error getting plan:', error);
    return NextResponse.json({ error: 'Failed to get plan' }, { status: 500 });
  }
}

