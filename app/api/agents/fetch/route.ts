/**
 * GET /api/agents/fetch
 *
 * Fetch agent card from a URL by trying well-known paths:
 * - /.well-known/agent.json
 * - /.well-known/agent.yaml
 * - /.well-known/agent-card.json
 *
 * Also tries to fetch favicon if no iconUrl in agent card.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

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

async function tryFetchAgentCard(baseUrl: string): Promise<{ card: AgentCard | null; path: string | null }> {
  for (const path of AGENT_CARD_PATHS) {
    try {
      const url = new URL(path, baseUrl).toString();
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json, text/yaml, */*' },
        signal: AbortSignal.timeout(10000),
      });
      
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
    const { card, path } = await tryFetchAgentCard(baseUrl);
    
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
    });
  } catch (error) {
    console.error('Error fetching agent card:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to fetch agent card'
    }, { status: 500 });
  }
}

