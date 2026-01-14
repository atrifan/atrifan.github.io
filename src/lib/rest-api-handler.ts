/**
 * REST API Handler
 *
 * Executes REST API tools based on their endpoint configuration.
 * Based on Python reference implementation.
 */

import type { RestApiEndpointRow, RestApiSpecRow, EnvironmentRow, OAuth2AuthConfig } from '@/src/types/supabase';
import { getValidOAuthToken, type ServerReference } from './oauth-token-manager';

export interface RestApiCallParams {
  endpoint: RestApiEndpointRow;
  spec: RestApiSpecRow;
  environment: EnvironmentRow;
  arguments: Record<string, unknown>;
  authToken?: string;
  apiKey?: string;
  userId?: string; // For OAuth token lookup
}

export interface RestApiCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  // OAuth-specific fields
  needsOAuth?: boolean; // True if OAuth authentication is required
  oauthServerId?: string; // Server ID for OAuth re-authentication
  oauthServerType?: 'rest_api'; // Server type for OAuth
}

/**
 * Build the full URL for a REST API call
 */
function buildUrl(
  baseUrl: string,
  path: string,
  pathParams: string[],
  queryParams: Array<{ name: string; required: boolean }>,
  args: Record<string, unknown>
): string {
  // Replace path parameters
  let url = path;
  for (const param of pathParams) {
    if (args[param] !== undefined) {
      url = url.replace(`{${param}}`, encodeURIComponent(String(args[param])));
    }
  }
  
  // Build query string
  const queryParts: string[] = [];
  for (const param of queryParams) {
    if (args[param.name] !== undefined) {
      queryParts.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(String(args[param.name]))}`);
    }
  }
  
  const fullUrl = `${baseUrl.replace(/\/$/, '')}${url}`;
  return queryParts.length > 0 ? `${fullUrl}?${queryParts.join('&')}` : fullUrl;
}

export interface AuthInfo {
  type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  token?: string; // Bearer token or OAuth access token
  apiKey?: string;
  basicUsername?: string;
  basicPassword?: string;
}

/**
 * Build headers for a REST API call
 */
function buildHeaders(
  endpoint: RestApiEndpointRow,
  spec: RestApiSpecRow,
  auth?: AuthInfo
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': endpoint.request_content_type || 'application/json',
    'Accept': endpoint.response_content_type || 'application/json',
  };

  // Add default headers from spec
  if (spec.default_headers) {
    Object.assign(headers, spec.default_headers);
  }

  // Add endpoint-specific headers
  if (endpoint.headers) {
    Object.assign(headers, endpoint.headers);
  }

  // Add authentication based on type
  if (auth) {
    switch (auth.type) {
      case 'bearer':
      case 'oauth2':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;
      case 'basic':
        if (auth.basicUsername && auth.basicPassword) {
          const credentials = Buffer.from(`${auth.basicUsername}:${auth.basicPassword}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;
      case 'api_key':
        if (auth.apiKey) {
          headers['x-api-key'] = auth.apiKey;
        }
        break;
    }
  }

  return headers;
}

/**
 * Build request body for POST/PUT/PATCH requests
 */
function buildBody(
  endpoint: RestApiEndpointRow,
  args: Record<string, unknown>
): unknown | undefined {
  if (!['POST', 'PUT', 'PATCH'].includes(endpoint.http_method)) {
    return undefined;
  }
  
  // Collect non-path, non-query params as body
  const pathParamNames = new Set(endpoint.path_params || []);
  const queryParamNames = new Set((endpoint.query_params || []).map(p => p.name));
  const headerParamNames = new Set(endpoint.header_params || []);
  
  const bodyArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!pathParamNames.has(key) && !queryParamNames.has(key) && !headerParamNames.has(key)) {
      bodyArgs[key] = value;
    }
  }
  
  return Object.keys(bodyArgs).length > 0 ? bodyArgs : undefined;
}

/**
 * Execute a REST API call with full auth support
 */
export async function executeRestApiCall(params: RestApiCallParams): Promise<RestApiCallResult> {
  const { endpoint, spec, environment, arguments: args, userId } = params;

  try {
    // Build URL
    const url = buildUrl(
      environment.host,
      endpoint.path,
      endpoint.path_params || [],
      endpoint.query_params || [],
      args
    );

    // Determine auth type and get credentials
    const authType = spec.auth_type || 'none';
    const authConfig = spec.auth_config as Record<string, unknown> | undefined;
    let auth: AuthInfo | undefined;

    if (authType === 'oauth2' && userId && authConfig) {
      // Get OAuth token from storage
      const oauthConfig = authConfig as unknown as OAuth2AuthConfig;
      const server: ServerReference = { type: 'rest_api', id: spec.id };
      const tokenResult = await getValidOAuthToken(userId, server, oauthConfig);

      if (!tokenResult.success) {
        // Need OAuth authentication
        return {
          success: false,
          error: tokenResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerId: spec.id,
          oauthServerType: 'rest_api',
        };
      }

      auth = { type: 'oauth2', token: tokenResult.accessToken };
    } else if (authType === 'bearer' && authConfig) {
      auth = { type: 'bearer', token: authConfig.token as string };
    } else if (authType === 'basic' && authConfig) {
      auth = {
        type: 'basic',
        basicUsername: authConfig.username as string,
        basicPassword: authConfig.password as string,
      };
    } else if (authType === 'api_key' && authConfig) {
      auth = { type: 'api_key', apiKey: authConfig.api_key as string };
    }

    // Build headers with auth
    const headers = buildHeaders(endpoint, spec, auth);

    // Build body
    const body = buildBody(endpoint, args);

    // Make request
    const response = await fetch(url, {
      method: endpoint.http_method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Parse response
    const contentType = response.headers.get('content-type') || '';
    let data: unknown;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Handle auth failures
    if (response.status === 401 || response.status === 403) {
      if (authType === 'oauth2') {
        // OAuth auth failed - need re-authentication
        return {
          success: false,
          error: `HTTP ${response.status}: Authentication failed`,
          statusCode: response.status,
          data,
          needsOAuth: true,
          oauthServerId: spec.id,
          oauthServerType: 'rest_api',
        };
      }
      // Non-OAuth auth failure - just return error
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        statusCode: response.status,
        data,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        statusCode: response.status,
        data,
      };
    }

    return {
      success: true,
      data,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: `Request failed: ${(error as Error).message}`,
    };
  }
}

