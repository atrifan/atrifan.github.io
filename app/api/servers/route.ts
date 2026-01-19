import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import {
  getApiKeysByUser,
  getServerToolsWithDetails,
  getApiKeyByUserAndServer,
  createApiKey,
  linkToolToServer,
  getToolByName,
  hashApiKey,
  getApiKeySuffix,
} from '@/src/lib/supabase-services';

/**
 * Determine user's effective plan from Clerk session claims
 */
function getUserPlanFromClaims(sessionClaims: Record<string, unknown> | null): 'free' | 'pro' | 'plus' {
  if (!sessionClaims) return 'free';

  const plaClaim = sessionClaims.pla as string | undefined;
  if (plaClaim) {
    if (plaClaim.includes(':')) {
      const plan = plaClaim.split(':')[1];
      if (plan === 'pro' || plan === 'plus' || plan === 'free') {
        return plan;
      }
    }
    if (plaClaim === 'pro' || plaClaim === 'plus' || plaClaim === 'free') {
      return plaClaim;
    }
  }

  return 'free';
}

/**
 * List all servers (API keys) for the authenticated user
 * GET /api/servers
 * 
 * Returns servers with their linked tools
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

    // Get all API keys (servers) for this user
    const apiKeys = await getApiKeysByUser(userId);

    // For each server, get its tools
    const serversWithTools = await Promise.all(
      apiKeys.map(async (apiKey) => {
        const serverTools = await getServerToolsWithDetails(userId, apiKey.server_name);
        return {
          id: apiKey.id,
          name: apiKey.name || apiKey.server_name,
          serverName: apiKey.server_name,
          plan: apiKey.plan,
          isActive: apiKey.is_active,
          createdAt: apiKey.created_at,
          tools: serverTools.map(st => ({
            id: st.id,
            toolId: st.tool_id,
            name: st.tool.name,
            description: st.tool.description,
            category: st.tool.category,
            isEnabled: st.is_enabled,
          })),
        };
      })
    );

    return NextResponse.json({
      servers: serversWithTools,
    });
  } catch (error) {
    console.error('Error listing servers:', error);
    return NextResponse.json(
      { error: 'Failed to list servers' },
      { status: 500 }
    );
  }
}

/**
 * Create a new server (API key) with selected tools
 * POST /api/servers
 *
 * Body: { name: string, serverName: string, tools: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, serverName, tools } = body;

    if (!serverName || !Array.isArray(tools)) {
      return NextResponse.json(
        { error: 'serverName and tools array required' },
        { status: 400 }
      );
    }

    // Check if server name already exists for this user
    const existing = await getApiKeyByUserAndServer(userId, serverName);
    if (existing) {
      return NextResponse.json(
        { error: 'Server with this name already exists' },
        { status: 409 }
      );
    }

    const plan = getUserPlanFromClaims(sessionClaims as Record<string, unknown> | null);
    const provider = useClerkApiKeys() ? 'clerk' : 'custom';

    let apiKeySecret: string;

    if (provider === 'clerk') {
      // Generate via Clerk
      const client = await clerkClient();
      const clerkApiKey = await client.apiKeys.create({
        subject: userId,
        name: name || serverName,
        description: `MCP Server: ${serverName}`,
        scopes: ['mcp:access'],
      });

      if (!clerkApiKey.secret) {
        return NextResponse.json(
          { error: 'Failed to generate API key secret' },
          { status: 500 }
        );
      }

      apiKeySecret = clerkApiKey.secret;
    } else {
      // Generate custom key
      const crypto = require('crypto');
      const randomBytes = crypto.randomBytes(24);
      apiKeySecret = `ak_${randomBytes.toString('base64url').toUpperCase().slice(0, 32)}`;
    }

    // Create API key in Supabase
    const apiKeyHash = await hashApiKey(apiKeySecret);
    const apiKeySuffix = getApiKeySuffix(apiKeySecret);

    const newApiKey = await createApiKey({
      user_id: userId,
      api_key_hash: apiKeyHash,
      api_key_suffix: apiKeySuffix,
      name: name || serverName,
      server_name: serverName,
      provider,
      plan,
    });

    // Link selected tools to this server
    for (const toolName of tools) {
      const tool = await getToolByName(toolName);
      if (tool) {
        await linkToolToServer({
          user_id: userId,
          server_name: serverName,
          tool_id: tool.id,
          is_enabled: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      server: {
        id: newApiKey.id,
        name: newApiKey.name,
        serverName: newApiKey.server_name,
        apiKey: apiKeySecret,
        plan,
        createdAt: newApiKey.created_at,
      },
    });
  } catch (error) {
    console.error('Error creating server:', error);
    return NextResponse.json(
      { error: 'Failed to create server' },
      { status: 500 }
    );
  }
}

