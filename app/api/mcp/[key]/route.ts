import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { decryptApiKey, isApiKeyExpired, ApiKeyPayload } from '@/src/utils/apiKeyEncryption';

interface ApiKeyUser {
  userId: string;
  plan: string;
  email?: string;
  isSubscribed: boolean;
}

/**
 * Validate API key by decrypting it and verifying the user exists with subscription
 */
async function validateApiKey(key: string): Promise<{ user: ApiKeyUser | null; error?: string }> {
  // Step 1: Decrypt the API key
  const payload = decryptApiKey(key);

  if (!payload) {
    return { user: null, error: 'Invalid API key format or decryption failed' };
  }

  // Step 2: Check if key is expired
  if (isApiKeyExpired(payload)) {
    return { user: null, error: 'API key has expired. Please generate a new one from your dashboard.' };
  }

  try {
    // Step 3: Verify user exists in Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(payload.userId);

    if (!user) {
      return { user: null, error: 'User not found. Account may have been deleted.' };
    }

    // Step 4: Check current subscription status from user metadata
    const currentPlan = (user.unsafeMetadata?.plan as string) || 'free';
    const isSubscribed = currentPlan === 'pro';

    // Step 5: Verify the stored API key matches (for revocation support)
    const storedKey = user.unsafeMetadata?.apiKey as string | undefined;
    if (storedKey && storedKey !== key) {
      return { user: null, error: 'API key has been revoked. Please generate a new one from your dashboard.' };
    }

    return {
      user: {
        userId: user.id,
        plan: currentPlan,
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
  
  const mcpResponse = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': user.userId,
      'X-User-Plan': user.plan,
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
        message: 'MCP access requires Pro plan. Upgrade at tulzo.vercel.app/pricing'
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
      error: 'Pro plan required',
      message: 'Upgrade to Pro at tulzo.vercel.app/pricing for MCP access',
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

