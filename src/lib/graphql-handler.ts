/**
 * GraphQL Handler
 *
 * Executes GraphQL operations using the graphql-request client.
 */

import { GraphQLClient, gql } from 'graphql-request';
import type { GraphQLOperationRow, GraphQLSpecRow, EnvironmentRow, OAuth2AuthConfig } from '@/src/types/supabase';
import { getValidOAuthToken, type ServerReference } from './oauth-token-manager';

export interface GraphQLCallParams {
  operation: GraphQLOperationRow;
  spec: GraphQLSpecRow;
  environment: EnvironmentRow;
  variables: Record<string, unknown>;
  authToken?: string;
  apiKey?: string;
  userId?: string; // For OAuth token lookup
}

export interface GraphQLCallResult {
  success: boolean;
  data?: unknown;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: string[] }>;
  error?: string;
  // OAuth-specific fields
  needsOAuth?: boolean;
  oauthServerId?: string;
  oauthServerType?: 'graphql';
}

interface AuthInfo {
  type: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  token?: string;
  apiKey?: string;
  basicUsername?: string;
  basicPassword?: string;
}

/**
 * Build headers for a GraphQL call
 */
function buildHeaders(
  spec: GraphQLSpecRow,
  auth?: AuthInfo
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Add default headers from spec
  if (spec.default_headers) {
    Object.assign(headers, spec.default_headers);
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
          const headerName = (spec.auth_config?.header_name as string) || 'x-api-key';
          headers[headerName] = auth.apiKey;
        }
        break;
    }
  }

  return headers;
}

/**
 * Create a GraphQL client for a given endpoint
 */
export function createGraphQLClient(
  endpoint: string,
  headers?: Record<string, string>
): GraphQLClient {
  return new GraphQLClient(endpoint, {
    headers,
  });
}

/**
 * Execute a GraphQL operation using graphql-request client
 */
export async function executeGraphQLCall(params: GraphQLCallParams): Promise<GraphQLCallResult> {
  const { operation, spec, environment, variables, userId } = params;

  try {
    // Build the GraphQL endpoint URL
    const url = environment.host;

    // Determine auth type and get credentials
    const authType = spec.auth_type || 'none';
    const authConfig = spec.auth_config as Record<string, unknown> | undefined;
    let auth: AuthInfo | undefined;

    if (authType === 'oauth2' && userId && authConfig) {
      // Get OAuth token from storage
      const oauthConfig = authConfig as unknown as OAuth2AuthConfig;
      const server: ServerReference = { type: 'graphql', id: spec.id };
      const tokenResult = await getValidOAuthToken(userId, server, oauthConfig);

      if (!tokenResult.success) {
        return {
          success: false,
          error: tokenResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerId: spec.id,
          oauthServerType: 'graphql',
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
    const headers = buildHeaders(spec, auth);

    // Create GraphQL client
    const client = createGraphQLClient(url, headers);

    // Execute the query/mutation
    const data = await client.request(
      gql`${operation.operation_string}`,
      variables
    );

    return {
      success: true,
      data,
    };
  } catch (error) {
    // graphql-request throws ClientError for GraphQL errors
    const err = error as Error & {
      response?: {
        errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: string[] }>;
        data?: unknown;
        status?: number;
      }
    };

    // Check for auth failures
    if (err.response?.status === 401 || err.response?.status === 403) {
      const authType = spec.auth_type || 'none';
      if (authType === 'oauth2') {
        return {
          success: false,
          error: `Authentication failed (${err.response.status})`,
          errors: err.response.errors,
          needsOAuth: true,
          oauthServerId: spec.id,
          oauthServerType: 'graphql',
        };
      }
    }

    if (err.response?.errors) {
      return {
        success: false,
        errors: err.response.errors,
        data: err.response.data,
        error: err.response.errors.map(e => e.message).join('; '),
      };
    }

    return {
      success: false,
      error: `GraphQL request failed: ${err.message}`,
    };
  }
}

/**
 * Introspection query for fetching GraphQL schema
 */
const INTROSPECTION_QUERY = gql`
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

/**
 * Fetch GraphQL schema via introspection using graphql-request client
 */
export async function fetchGraphQLSchema(
  url: string,
  headers?: Record<string, string>
): Promise<{ success: boolean; schema?: Record<string, unknown>; error?: string }> {
  try {
    const client = createGraphQLClient(url, headers);
    const data = await client.request(INTROSPECTION_QUERY);

    const result = data as { __schema?: Record<string, unknown> };

    if (!result.__schema) {
      return {
        success: false,
        error: 'Invalid introspection response: missing __schema',
      };
    }

    return {
      success: true,
      schema: data as Record<string, unknown>,
    };
  } catch (error) {
    const err = error as Error & {
      response?: {
        errors?: Array<{ message: string }>;
        status?: number;
      }
    };

    if (err.response?.errors) {
      return {
        success: false,
        error: err.response.errors.map(e => e.message).join('; '),
      };
    }

    return {
      success: false,
      error: `Failed to fetch schema: ${err.message}`,
    };
  }
}
