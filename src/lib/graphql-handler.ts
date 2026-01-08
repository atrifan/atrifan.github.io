/**
 * GraphQL Handler
 * 
 * Executes GraphQL operations based on their configuration.
 */

import type { GraphQLOperationRow, GraphQLSpecRow, EnvironmentRow } from '@/src/types/supabase';

export interface GraphQLCallParams {
  operation: GraphQLOperationRow;
  spec: GraphQLSpecRow;
  environment: EnvironmentRow;
  variables: Record<string, unknown>;
  authToken?: string;
  apiKey?: string;
}

export interface GraphQLCallResult {
  success: boolean;
  data?: unknown;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: string[] }>;
  error?: string;
}

/**
 * Build headers for a GraphQL call
 */
function buildHeaders(
  spec: GraphQLSpecRow,
  authToken?: string,
  apiKey?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  // Add default headers from spec
  if (spec.default_headers) {
    Object.assign(headers, spec.default_headers);
  }
  
  // Add authorization based on auth_type
  if (spec.auth_type === 'bearer' && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  } else if (spec.auth_type === 'api_key' && apiKey) {
    // Check auth_config for header name
    const headerName = (spec.auth_config?.header_name as string) || 'x-api-key';
    headers[headerName] = apiKey;
  } else if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return headers;
}

/**
 * Execute a GraphQL operation
 */
export async function executeGraphQLCall(params: GraphQLCallParams): Promise<GraphQLCallResult> {
  const { operation, spec, environment, variables, authToken, apiKey } = params;
  
  try {
    // Build the GraphQL endpoint URL
    const url = environment.host;
    
    // Build headers
    const headers = buildHeaders(spec, authToken, apiKey);
    
    // Build the request body
    const body = {
      query: operation.operation_string,
      variables,
      operationName: operation.operation_name,
    };
    
    // Make the request
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    // Parse response
    const result = await response.json();
    
    // Check for GraphQL errors
    if (result.errors && result.errors.length > 0) {
      return {
        success: false,
        errors: result.errors,
        data: result.data,
        error: result.errors.map((e: { message: string }) => e.message).join('; '),
      };
    }
    
    // Check for HTTP errors
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        data: result,
      };
    }
    
    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: `GraphQL request failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Fetch GraphQL schema via introspection
 */
export async function fetchGraphQLSchema(
  url: string,
  headers?: Record<string, string>
): Promise<{ success: boolean; schema?: Record<string, unknown>; error?: string }> {
  const introspectionQuery = `
    query IntrospectionQuery {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          kind
          name
          description
          fields(includeDeprecated: true) {
            name
            description
            args {
              name
              description
              type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
              defaultValue
            }
            type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
            isDeprecated
            deprecationReason
          }
          inputFields {
            name
            description
            type { kind name ofType { kind name ofType { kind name } } }
            defaultValue
          }
          interfaces { kind name }
          enumValues(includeDeprecated: true) { name description }
          possibleTypes { kind name }
        }
      }
    }
  `;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query: introspectionQuery }),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const result = await response.json();
    
    if (result.errors) {
      return {
        success: false,
        error: result.errors.map((e: { message: string }) => e.message).join('; '),
      };
    }
    
    if (!result.data?.__schema) {
      return {
        success: false,
        error: 'Invalid introspection response: missing __schema',
      };
    }
    
    return {
      success: true,
      schema: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch schema: ${(error as Error).message}`,
    };
  }
}

