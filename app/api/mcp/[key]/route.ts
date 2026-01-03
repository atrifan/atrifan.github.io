import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { isHigherOrEqualTo } from '@/src/config/billing.config';

interface ApiKeyUser {
  userId: string;
  plan: string;
  email?: string;
  isSubscribed: boolean;
}

/**
 * Get user's plan from metadata
 */
async function getUserPlan(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<string> {
  try {
    const user = await client.users.getUser(userId);

    // Check publicMetadata first
    if (user.publicMetadata?.plan) {
      return user.publicMetadata.plan as string;
    }

    // Check for active subscription
    if (user.publicMetadata?.subscription === 'active') {
      return 'pro';
    }

    // Check unsafeMetadata
    if (user.unsafeMetadata?.plan) {
      return user.unsafeMetadata.plan as string;
    }

    // Check organization memberships for plan
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    for (const membership of memberships.data) {
      const org = await client.organizations.getOrganization({ organizationId: membership.organization.id });
      if (org.publicMetadata?.plan) {
        return org.publicMetadata.plan as string;
      }
      if (org.publicMetadata?.subscription === 'active') {
        return 'pro';
      }
    }

    return 'free';
  } catch (error) {
    console.error('Error getting user plan:', error);
    return 'free';
  }
}

/**
 * Check if user has Pro or higher subscription
 */
async function checkProSubscription(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<boolean> {
  const plan = await getUserPlan(client, userId);
  return isHigherOrEqualTo(plan, 'pro');
}

/**
 * Validate API key - supports both custom encryption and Clerk API Keys
 */
async function validateApiKey(key: string): Promise<{ user: ApiKeyUser | null; error?: string }> {
  const client = await clerkClient();

  // Try Clerk API Keys first if enabled
  if (useClerkApiKeys()) {
    try {
      const apiKey = await client.apiKeys.verify(key);

      if (!apiKey) {
        return { user: null, error: 'Invalid API key' };
      }

      if (apiKey.revoked) {
        return { user: null, error: 'API key has been revoked. Please generate a new one from your dashboard.' };
      }

      if (apiKey.expired) {
        return { user: null, error: 'API key has expired. Please generate a new one from your dashboard.' };
      }

      const userId = apiKey.subject;
      const user = await client.users.getUser(userId);
      const isSubscribed = await checkProSubscription(client, userId);

      return {
        user: {
          userId,
          plan: isSubscribed ? 'pro' : 'free',
          email: user.primaryEmailAddress?.emailAddress,
          isSubscribed,
        },
      };
    } catch (error) {
      console.error('Error validating API key with Clerk:', error);
      return { user: null, error: 'Invalid API key' };
    }
  }

  // Use custom encryption (default)
  const payload = decryptApiKey(key);
  if (!payload) {
    return { user: null, error: 'Invalid API key format or decryption failed' };
  }
  if (isApiKeyExpired(payload)) {
    return { user: null, error: 'API key has expired. Please generate a new one from your dashboard.' };
  }
  try {
    const user = await client.users.getUser(payload.userId);
    if (!user) {
      return { user: null, error: 'User not found. Account may have been deleted.' };
    }
    const storedKey = user.unsafeMetadata?.apiKey as string | undefined;
    if (storedKey && storedKey !== key) {
      return { user: null, error: 'API key has been revoked. Please generate a new one from your dashboard.' };
    }
    const isSubscribed = await checkProSubscription(client, payload.userId);
    return {
      user: {
        userId: user.id,
        plan: isSubscribed ? 'pro' : 'free',
        email: user.primaryEmailAddress?.emailAddress,
        isSubscribed,
      },
    };
  } catch (error) {
    console.error('Error validating API key:', error);
    return { user: null, error: 'Failed to verify user. Please try again.' };
  }
}

// Forward request to main MCP handler with user context
async function forwardToMCP(request: NextRequest, user: ApiKeyUser) {
  const body = await request.text();

  // Get the base URL for internal request
  const baseUrl = request.nextUrl.origin;

  // Forward client info for connection logging
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                   request.headers.get('x-real-ip') ||
                   'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const mcpResponse = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': user.userId,
      'X-User-Plan': user.plan,
      'X-Auth-Method': 'path',
      'x-forwarded-for': clientIp,
      'user-agent': userAgent,
    },
    body,
  });

  const result = await mcpResponse.json();
  return NextResponse.json(result);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  
  if (!key) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { 
        code: -32001, 
        message: 'API key required in URL path: /api/mcp/{your_api_key}' 
      }
    }, { status: 401 });
  }

  const { user, error } = await validateApiKey(key);

  if (!user) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: error || 'Invalid API key. Generate a new key from your dashboard at tulzo.vercel.app/dashboard'
      }
    }, { status: 401 });
  }

  // Check if user has pro plan for MCP access
  if (!user.isSubscribed) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32003,
        message: 'MCP access is not allowed for free users. Upgrade at tulzo.vercel.app/pricing'
      }
    }, { status: 403 });
  }

  try {
    return await forwardToMCP(request, user);
  } catch {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    }, { status: 400 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  
  if (!key) {
    return NextResponse.json({
      name: 'Tulzo MCP Server',
      version: '1.0.0',
      description: 'API key required. Get your key at tulzo.vercel.app/dashboard',
      endpoint: '/api/mcp/{your_api_key}',
    });
  }

  const { user, error } = await validateApiKey(key);

  if (!user) {
    return NextResponse.json({
      error: 'Invalid API key',
      message: error || 'Generate a new key from your dashboard at tulzo.vercel.app/dashboard',
    }, { status: 401 });
  }

  if (!user.isSubscribed) {
    return NextResponse.json({
      error: 'MCP access not allowed',
      message: 'MCP access is not allowed for free users. Upgrade at tulzo.vercel.app/pricing',
      currentPlan: user.plan,
    }, { status: 403 });
  }

  return NextResponse.json({
    name: 'Tulzo MCP Server',
    version: '1.0.0',
    description: 'Model Context Protocol server for Tulzo tools',
    authenticated: true,
    user: {
      plan: user.plan,
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  });
}

