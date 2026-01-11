/**
 * OpenID Connect Discovery utility
 * Uses server-side API to discover OpenID configuration (avoids CORS issues)
 */

export interface OpenIDConfiguration {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  // Additional fields we might use
  userinfo_endpoint?: string;
  jwks_uri?: string;
  response_types_supported?: string[];
  grant_types_supported?: string[];
}

export interface DiscoveryResult {
  found: boolean;
  config?: OpenIDConfiguration;
  discoveryUrl?: string;
}

/**
 * Attempts to discover OpenID configuration from a given URL
 * Uses server-side API proxy to avoid CORS issues
 *
 * The API tries multiple well-known endpoints in order:
 * 1. {domain}/.well-known/openid-configuration
 * 2. {domain}/.well-known/oauth-authorization-server
 * 3. {url}/.well-known/openid-configuration (if url differs from domain)
 * 4. {url}/.well-known/oauth-authorization-server (if url differs from domain)
 * 5. {domain}/token/.well-known/openid-configuration
 */
export async function discoverOpenIDConfig(inputUrl: string): Promise<DiscoveryResult> {
  if (!inputUrl.trim()) {
    return { found: false };
  }

  // Validate URL format before making API call
  try {
    new URL(inputUrl.trim());
  } catch {
    return { found: false };
  }

  try {
    const response = await fetch('/api/openid-discovery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: inputUrl.trim() }),
    });

    if (response.ok) {
      const result = await response.json() as DiscoveryResult;
      return result;
    }
  } catch {
    // Discovery failed, return not found
  }

  return { found: false };
}

/**
 * Extract default scopes from OpenID configuration
 */
export function getDefaultScopes(config: OpenIDConfiguration): string {
  if (config.scopes_supported && config.scopes_supported.length > 0) {
    // Filter to common scopes, prioritize openid
    const commonScopes = ['openid', 'profile', 'email', 'offline_access'];
    const filtered = config.scopes_supported.filter(s => commonScopes.includes(s));
    if (filtered.length > 0) {
      return filtered.join(' ');
    }
    // If no common scopes, return first few
    return config.scopes_supported.slice(0, 3).join(' ');
  }
  return 'openid';
}

