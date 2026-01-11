import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { isHigherOrEqualTo } from '@/src/config/billing.config';
import { getApiKeyByHash, hashApiKey } from '@/src/lib/supabase-services';

interface ApiKeyUser {
  userId: string;
  apiKeyId?: string;
  serverName: string;
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
    // Check publicMetadata.plan (set by billing webhooks)
    if (user.publicMetadata?.plan) {
      return user.publicMetadata.plan as string;
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
 * Validate API key against Supabase first, then Clerk/custom as fallback
 *
 * Flow:
 * 1. Hash key and look up in Supabase api_keys table
 * 2. Validate the requested server exists for this user
 * 3. If Clerk provider, also verify with Clerk
 * 4. Fallback to legacy validation
 */
async function validateApiKey(key: string, serverName: string = 'default'): Promise<{ user: ApiKeyUser | null; error?: string }> {
  // First, check Supabase by hash
  try {
    const keyHash = hashApiKey(key);
    const supabaseKey = await getApiKeyByHash(keyHash);

    if (supabaseKey) {
      if (!supabaseKey.is_active) {
        return { user: null, error: 'API key has been revoked. Please generate a new one from your dashboard.' };
      }

      // Validate that the requested server exists for this user
      // The API key's server_name must match the requested serverName
      // OR the user must have a separate API key for that server
      if (supabaseKey.server_name !== serverName) {
        // Check if user has a server with the requested name
        const { getApiKeyByUserAndServer } = await import('@/src/lib/supabase-services');
        const requestedServer = await getApiKeyByUserAndServer(supabaseKey.user_id, serverName);

        if (!requestedServer) {
          return { user: null, error: `Server '${serverName}' not found. Create it from your dashboard first.` };
        }

        // Use the requested server's details
        if (!requestedServer.is_active) {
          return { user: null, error: 'Server has been deactivated.' };
        }

        return {
          user: {
            userId: requestedServer.user_id,
            apiKeyId: requestedServer.id,
            serverName: requestedServer.server_name,
            plan: requestedServer.plan,
            isSubscribed: requestedServer.plan !== 'free',
          },
        };
      }

      // If Clerk provider, also verify with Clerk
      if (supabaseKey.provider === 'clerk' && useClerkApiKeys()) {
        try {
          const client = await clerkClient();
          const clerkKey = await client.apiKeys.verify(key);
          if (!clerkKey || clerkKey.revoked || clerkKey.expired) {
            return { user: null, error: 'API key has been revoked or expired.' };
          }
        } catch (e) {
          console.error('Clerk verification failed:', e);
          return { user: null, error: 'API key verification failed.' };
        }
      }

      return {
        user: {
          userId: supabaseKey.user_id,
          apiKeyId: supabaseKey.id,
          serverName: supabaseKey.server_name,
          plan: supabaseKey.plan,
          isSubscribed: supabaseKey.plan !== 'free',
        },
      };
    }
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);
    // Continue to legacy validation
  }

  // Legacy: Try Clerk API Keys if enabled
  const client = await clerkClient();
  if (useClerkApiKeys()) {
    try {
      const apiKey = await client.apiKeys.verify(key);
      if (apiKey && !apiKey.revoked && !apiKey.expired) {
        const userId = apiKey.subject;
        return {
          user: {
            userId,
            serverName: 'default',
            plan: 'pro',
            isSubscribed: true,
          },
        };
      }
    } catch (error) {
      console.error('Error validating API key with Clerk:', error);
    }
  }

  // Legacy: Try custom encryption
  const payload = decryptApiKey(key);
  if (!payload) {
    return { user: null, error: 'Invalid API key' };
  }
  if (isApiKeyExpired(payload)) {
    return { user: null, error: 'API key has expired. Please generate a new one from your dashboard.' };
  }

  return {
    user: {
      userId: payload.userId,
      serverName: 'default',
      plan: 'pro',
      isSubscribed: true,
    },
  };
}

// Forward request to main MCP handler with user context
async function forwardToMCP(request: NextRequest, user: ApiKeyUser) {
  const body = await request.text();

  // Get the base URL for internal request
  // Use localhost for internal requests - going through external URL (ngrok/proxy) causes SSL issues
  const externalOrigin = request.nextUrl.origin;
  const isLocalDev = process.env.NODE_ENV === 'development';
  const port = process.env.PORT || '3000';
  const baseUrl = isLocalDev ? `http://localhost:${port}` : externalOrigin;

  console.log('[MCP Key Route] Forwarding to:', `${baseUrl}/api/mcp`, '(external origin was:', externalOrigin, ')');

  // Forward client info for connection logging
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                   request.headers.get('x-real-ip') ||
                   'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': user.userId,
    'X-User-Plan': user.plan,
    'X-Auth-Method': 'path',
    'X-Server-Name': user.serverName,
    'x-forwarded-for': clientIp,
    'user-agent': userAgent,
  };

  // Pass API key ID if available (from Supabase)
  if (user.apiKeyId) {
    headers['X-Api-Key-Id'] = user.apiKeyId;
  }

  const mcpResponse = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers,
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
  } catch (err) {
    console.error('[MCP Key Route] Error forwarding to MCP:', err);
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}` }
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

