/**
 * GraphQL Handler
 *
 * Executes GraphQL operations using the graphql-request client.
 */

import { GraphQLClient, gql } from 'graphql-request';
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
  const headers: Record<string, string> = {};

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
  const { operation, spec, environment, variables, authToken, apiKey } = params;

  try {
    // Build the GraphQL endpoint URL
    const url = environment.host;

    // Build headers
    const headers = buildHeaders(spec, authToken, apiKey);

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
