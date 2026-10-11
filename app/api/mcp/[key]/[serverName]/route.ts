import { NextRequest, NextResponse } from 'next/server';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { clerkClient } from '@clerk/nextjs/server';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { getApiKeyByHash, hashApiKey, getApiKeyByUserAndServer } from '@/src/lib/supabase-services';

interface ApiKeyUser {
  userId: string;
  apiKeyId?: string;
  serverName: string;
  plan: string;
  isSubscribed: boolean;
}

/**
 * Validate API key and get the specific server
 */
async function validateApiKeyForServer(
  key: string,
  serverName: string
): Promise<{ user: ApiKeyUser | null; error?: string }> {
  // First, check Supabase by hash to get user_id
  try {
    const keyHash = hashApiKey(key);
    const supabaseKey = await getApiKeyByHash(keyHash);

    if (supabaseKey) {
      if (!supabaseKey.is_active) {
        return { user: null, error: 'API key has been revoked.' };
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

      // Now get the specific server for this user
      const serverKey = await getApiKeyByUserAndServer(supabaseKey.user_id, serverName);
      
      if (!serverKey) {
        return { user: null, error: `Server '${serverName}' not found.` };
      }

      return {
        user: {
          userId: serverKey.user_id,
          apiKeyId: serverKey.id,
          serverName: serverKey.server_name,
          plan: serverKey.plan,
          isSubscribed: serverKey.plan !== 'free',
        },
      };
    }
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);
  }

  // Legacy fallback - use default server
  const payload = decryptApiKey(key);
  if (!payload) {
    return { user: null, error: 'Invalid API key' };
  }
  if (isApiKeyExpired(payload)) {
    return { user: null, error: 'API key has expired.' };
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

// Hand the request to the /api/mcp handler in process, with the identity this route
// authenticated from the key in the URL. No HTTP self-call, no identity headers.
async function forwardToMCP(request: NextRequest, user: ApiKeyUser, key: string) {
  return mcpPost(request, {
    pathKey: {
      userId: user.userId,
      apiKeyId: user.apiKeyId,
      serverName: user.serverName,
      plan: user.plan,
      apiKey: key,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string; serverName: string }> }
) {
  const { key, serverName } = await params;
  
  if (!key) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: 'API key required' }
    }, { status: 401 });
  }

  const decodedServerName = decodeURIComponent(serverName || 'default');
  const { user, error } = await validateApiKeyForServer(key, decodedServerName);

  if (!user) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: error || 'Invalid API key' }
    }, { status: 401 });
  }

  if (!user.isSubscribed) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32003, message: 'MCP access requires a Pro subscription' }
    }, { status: 403 });
  }

  try {
    return await forwardToMCP(request, user, key);
  } catch {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Internal server error' }
    }, { status: 500 });
  }
}

