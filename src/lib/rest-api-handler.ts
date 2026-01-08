/**
 * REST API Handler
 * 
 * Executes REST API tools based on their endpoint configuration.
 * Based on Python reference implementation.
 */

import type { RestApiEndpointRow, RestApiSpecRow, EnvironmentRow } from '@/src/types/supabase';

export interface RestApiCallParams {
  endpoint: RestApiEndpointRow;
  spec: RestApiSpecRow;
  environment: EnvironmentRow;
  arguments: Record<string, unknown>;
  authToken?: string;
  apiKey?: string;
}

export interface RestApiCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
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

/**
 * Build headers for a REST API call
 */
function buildHeaders(
  endpoint: RestApiEndpointRow,
  spec: RestApiSpecRow,
  authToken?: string,
  apiKey?: string
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
  
  // Add authorization
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  // Add API key
  if (apiKey) {
    headers['x-api-key'] = apiKey;
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
 * Execute a REST API call
 */
export async function executeRestApiCall(params: RestApiCallParams): Promise<RestApiCallResult> {
  const { endpoint, spec, environment, arguments: args, authToken, apiKey } = params;
  
  try {
    // Build URL
    const url = buildUrl(
      environment.host,
      endpoint.path,
      endpoint.path_params || [],
      endpoint.query_params || [],
      args
    );
    
    // Build headers
    const headers = buildHeaders(endpoint, spec, authToken, apiKey);
    
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

