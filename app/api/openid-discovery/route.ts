import { NextRequest, NextResponse } from 'next/server';

interface OpenIDConfiguration {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  userinfo_endpoint?: string;
  jwks_uri?: string;
  response_types_supported?: string[];
  grant_types_supported?: string[];
}

interface DiscoveryResult {
  found: boolean;
  config?: OpenIDConfiguration;
  discoveryUrl?: string;
}

/**
 * POST /api/openid-discovery
 * Attempts to discover OpenID configuration from a given URL
 * This runs server-side to avoid CORS issues
 */
export async function POST(request: NextRequest): Promise<NextResponse<DiscoveryResult>> {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ found: false });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json({ found: false });
    }

    const baseUrl = url.trim().replace(/\/$/, '');
    const domainUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Build list of URLs to try in order: 3, 4, 1, 2, 5
    // 3. {domain}/.well-known/openid-configuration
    // 4. {domain}/.well-known/oauth-authorization-server
    // 1. {url}/.well-known/openid-configuration
    // 2. {url}/.well-known/oauth-authorization-server
    // 5. {domain}/token/.well-known/openid-configuration
    const urlsToTry: string[] = [];

    // 3. Try domain/.well-known/openid-configuration
    urlsToTry.push(`${domainUrl}/.well-known/openid-configuration`);

    // 4. Try domain/.well-known/oauth-authorization-server
    urlsToTry.push(`${domainUrl}/.well-known/oauth-authorization-server`);

    // 1 & 2. Try with the full input URL (if different from domain)
    if (domainUrl !== baseUrl) {
      urlsToTry.push(`${baseUrl}/.well-known/openid-configuration`);
      urlsToTry.push(`${baseUrl}/.well-known/oauth-authorization-server`);
    }

    // 5. Try domain/token/.well-known/openid-configuration
    urlsToTry.push(`${domainUrl}/token/.well-known/openid-configuration`);

    // Try each URL
    for (const discoveryUrl of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(discoveryUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'ZipRun-OpenID-Discovery/1.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const config = await response.json() as OpenIDConfiguration;
          // Validate that it looks like an OpenID config
          if (config.authorization_endpoint || config.token_endpoint || config.issuer) {
            return NextResponse.json({
              found: true,
              config,
              discoveryUrl,
            });
          }
        }
      } catch {
        // Continue to next URL
      }
    }

    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ found: false });
  }
}

