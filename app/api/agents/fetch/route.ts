/**
 * GET /api/agents/fetch
 *
 * Fetch agent card from a URL by trying well-known paths:
 * - /.well-known/agent.json
 * - /.well-known/agent.yaml
 * - /.well-known/agent-card.json
 *
 * Also tries to fetch favicon if no iconUrl in agent card.
 * Supports OAuth2 authentication for protected agents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getValidOAuthToken } from '@/src/lib/oauth-token-manager';
import type { OAuth2AuthConfig } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface AgentCard {
  name?: string;
  version?: string;
  protocolVersion?: string;
  url?: string;
  description?: string;
  tags?: string[];
  iconUrl?: string;
  [key: string]: unknown;
}

// Well-known paths to try for agent card discovery
const AGENT_CARD_PATHS = [
  '/.well-known/agent.json',
  '/.well-known/agent.yaml',
  '/.well-known/agent-card.json',
  '/.well-known/agent-card.yaml',
];

// Favicon paths to try
const FAVICON_PATHS = [
  '/favicon.png',
  '/favicon.svg',
  '/favicon.ico',
];

async function tryFetchAgentCard(
  baseUrl: string,
  authHeaders?: Record<string, string>
): Promise<{ card: AgentCard | null; path: string | null; needsAuth?: boolean }> {
  let lastStatus = 0;

  for (const path of AGENT_CARD_PATHS) {
    try {
      const url = new URL(path, baseUrl).toString();
      const headers: Record<string, string> = { 'Accept': 'application/json, text/yaml, */*' };
      if (authHeaders) {
        Object.assign(headers, authHeaders);
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      lastStatus = response.status;

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        let card: AgentCard;
        if (contentType.includes('yaml') || path.endsWith('.yaml')) {
          // Simple YAML parsing for basic cases
          const yaml = await import('js-yaml');
          card = yaml.load(text) as AgentCard;
        } else {
          card = JSON.parse(text);
        }

        return { card, path };
      }
    } catch {
      // Continue to next path
    }
  }

  // If we got 401/403, indicate auth is needed
  if (lastStatus === 401 || lastStatus === 403) {
    return { card: null, path: null, needsAuth: true };
  }

  return { card: null, path: null };
}

async function tryFetchFavicon(baseUrl: string): Promise<string | null> {
  for (const path of FAVICON_PATHS) {
    try {
      const url = new URL(path, baseUrl).toString();
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        return url;
      }
    } catch {
      // Continue to next path
    }
  }
  return null;
}

// GET handler for simple fetches without auth
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    let baseUrl: string;
    try {
      const parsed = new URL(url);
      baseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Try to fetch agent card
    const { card, path, needsAuth } = await tryFetchAgentCard(baseUrl);

    // Try to fetch favicon if no iconUrl in card
    let iconUrl = card?.iconUrl || null;
    if (!iconUrl) {
      iconUrl = await tryFetchFavicon(baseUrl);
    }

    return NextResponse.json({
      success: true,
      agentCard: card,
      discoveredPath: path,
      baseUrl,
      iconUrl,
      hasAgentCard: card !== null,
      needsAuth,
    });
  } catch (error) {
    console.error('Error fetching agent card:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to fetch agent card'
    }, { status: 500 });
  }
}

interface PostFetchRequest {
  url: string;
  authType?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  oauth2Config?: OAuth2AuthConfig;
  apiKey?: string;
  bearerToken?: string;
  basicCredentials?: string; // base64 encoded username:password
  headers?: Record<string, string>;
  agentId?: string; // For OAuth token lookup
}

// POST handler for fetches with auth (including OAuth)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: PostFetchRequest = await request.json();
    const { url, authType, oauth2Config, apiKey, bearerToken, basicCredentials, headers: customHeaders, agentId } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    let baseUrl: string;
    try {
      const parsed = new URL(url);
      baseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Build auth headers - start with custom headers
    const authHeaders: Record<string, string> = { ...customHeaders };

    // Handle different auth types
    if (authType === 'api_key' && apiKey) {
      // API key typically goes in X-API-Key header
      authHeaders['X-API-Key'] = apiKey;
    } else if (authType === 'bearer' && bearerToken) {
      authHeaders['Authorization'] = `Bearer ${bearerToken}`;
    } else if (authType === 'basic' && basicCredentials) {
      authHeaders['Authorization'] = `Basic ${basicCredentials}`;
    } else if (authType === 'oauth2' && oauth2Config) {
      const serverId = agentId || `temp_${Buffer.from(url).toString('base64').slice(0, 32)}`;
      const tokenResult = await getValidOAuthToken(userId, { type: 'a2a', id: serverId }, oauth2Config);

      if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({
          success: false,
          error: tokenResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerType: 'a2a',
        });
      }
      authHeaders['Authorization'] = `${tokenResult.tokenType || 'Bearer'} ${tokenResult.accessToken}`;
    }

    // Try to fetch agent card with auth headers
    const { card, path, needsAuth } = await tryFetchAgentCard(baseUrl, authHeaders);

    // If still needs auth after providing OAuth token, return error
    if (needsAuth && authType === 'oauth2') {
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        needsOAuth: true,
        oauthServerType: 'a2a',
      });
    }

    // Try to fetch favicon if no iconUrl in card
    let iconUrl = card?.iconUrl || null;
    if (!iconUrl) {
      iconUrl = await tryFetchFavicon(baseUrl);
    }

    return NextResponse.json({
      success: true,
      agentCard: card,
      discoveredPath: path,
      baseUrl,
      iconUrl,
      hasAgentCard: card !== null,
      needsAuth,
    });
  } catch (error) {
    console.error('Error fetching agent card:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to fetch agent card'
    }, { status: 500 });
  }
}

