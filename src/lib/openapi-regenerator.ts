/**
 * OpenAPI Spec Regenerator
 *
 * Rebuilds OpenAPI spec from database state (endpoints, tools, environments).
 * Enables bidirectional sync: edit broken-down data → regenerate spec.
 */

import YAML from 'yaml';
import type { RestApiSpecRow, RestApiEndpointRow, ToolRow, EnvironmentRow, QueryParamDef } from '@/src/types/supabase';

export interface EndpointWithTool extends RestApiEndpointRow {
  tools?: ToolRow;
}

export interface RegenerateInput {
  spec: RestApiSpecRow;
  endpoints: EndpointWithTool[];
  environments: EnvironmentRow[];
}

export interface RegeneratedSpec {
  json: Record<string, unknown>;
  yaml: string;
  raw: string;
}

/**
 * Regenerate OpenAPI spec from database state
 */
export function regenerateOpenAPISpec(input: RegenerateInput): RegeneratedSpec {
  const { spec, endpoints, environments } = input;

  // Determine OpenAPI version
  const isOpenAPI3 = spec.openapi_version?.startsWith('3');

  // Build base spec
  const openApiSpec: Record<string, unknown> = isOpenAPI3
    ? buildOpenAPI3Spec(spec, endpoints, environments)
    : buildSwagger2Spec(spec, endpoints, environments);

  // Generate YAML
  const yamlContent = YAML.stringify(openApiSpec, { indent: 2 });

  // Use original format preference
  const raw = spec.spec_format === 'yaml' ? yamlContent : JSON.stringify(openApiSpec, null, 2);

  return {
    json: openApiSpec,
    yaml: yamlContent,
    raw,
  };
}

/**
 * Build OpenAPI 3.x spec
 */
function buildOpenAPI3Spec(
  spec: RestApiSpecRow,
  endpoints: EndpointWithTool[],
  environments: EnvironmentRow[]
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  // Group endpoints by path
  for (const endpoint of endpoints) {
    const tool = endpoint.tools;
    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {};
    }

    const operation = buildOperation3(endpoint, tool);
    paths[endpoint.path][endpoint.http_method.toLowerCase()] = operation;
  }

  return {
    openapi: spec.openapi_version || '3.0.0',
    info: {
      title: spec.api_title || spec.server_name,
      description: spec.api_description || '',
      version: spec.api_version || '1.0.0',
    },
    servers: environments.map(env => ({
      url: env.host,
      description: env.name,
    })),
    paths,
  };
}

/**
 * Build Swagger 2.0 spec
 */
function buildSwagger2Spec(
  spec: RestApiSpecRow,
  endpoints: EndpointWithTool[],
  environments: EnvironmentRow[]
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of endpoints) {
    const tool = endpoint.tools;
    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {};
    }

    const operation = buildOperation2(endpoint, tool);
    paths[endpoint.path][endpoint.http_method.toLowerCase()] = operation;
  }

  // Use first environment as host
  const primaryEnv = environments[0];
  let host = '';
  let basePath = '/';
  let schemes: string[] = ['https'];

  if (primaryEnv?.host) {
    try {
      const url = new URL(primaryEnv.host);
      host = url.host;
      basePath = url.pathname || '/';
      schemes = [url.protocol.replace(':', '')];
    } catch {
      host = primaryEnv.host;
    }
  }

  return {
    swagger: '2.0',
    info: {
      title: spec.api_title || spec.server_name,
      description: spec.api_description || '',
      version: spec.api_version || '1.0.0',
    },
    host,
    basePath,
    schemes,
    paths,
  };
}

/**
 * Build OpenAPI 3.x operation
 */
function buildOperation3(endpoint: EndpointWithTool, tool?: ToolRow): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: endpoint.operation_id,
    summary: tool?.name || endpoint.operation_id,
    description: tool?.description || '',
  };

  // Add tags from tool category
  if (tool?.category) {
    operation.tags = [tool.category];
  }

  // Add x-has-widget extension
  if (tool?.has_widget) {
    operation['x-has-widget'] = true;
  }

  // Build parameters
  const parameters = buildParameters3(endpoint);
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  // Build request body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.http_method)) {
    operation.requestBody = buildRequestBody3(endpoint, tool);
  }

  // Build responses
  operation.responses = buildResponses3(endpoint);

  return operation;
}

/**
 * Build OpenAPI 3.x parameters
 */
function buildParameters3(endpoint: EndpointWithTool): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];

  // Path parameters
  for (const name of endpoint.path_params || []) {
    params.push({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  }

  // Query parameters
  for (const qp of endpoint.query_params || []) {
    params.push({
      name: qp.name,
      in: 'query',
      required: qp.required || false,
      schema: { type: qp.type || 'string' },
      description: qp.description || '',
    });
  }

  // Header parameters
  for (const name of endpoint.header_params || []) {
    params.push({
      name,
      in: 'header',
      required: false,
      schema: { type: 'string' },
    });
  }

  return params;
}

/**
 * Build OpenAPI 3.x request body
 */
function buildRequestBody3(endpoint: EndpointWithTool, tool?: ToolRow): Record<string, unknown> {
  const contentType = endpoint.request_content_type || 'application/json';

  // Try to extract body schema from tool input_schema
  let schema: Record<string, unknown> = { type: 'object' };

  if (tool?.input_schema) {
    const inputSchema = tool.input_schema as Record<string, unknown>;
    // Remove path/query/header params from schema to get body-only schema
    const properties = (inputSchema.properties || {}) as Record<string, unknown>;
    const pathParams = new Set(endpoint.path_params || []);
    const queryParams = new Set((endpoint.query_params || []).map(p => p.name));
    const headerParams = new Set(endpoint.header_params || []);

    const bodyProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!pathParams.has(key) && !queryParams.has(key) && !headerParams.has(key)) {
        bodyProperties[key] = value;
      }
    }

    if (Object.keys(bodyProperties).length > 0) {
      schema = {
        type: 'object',
        properties: bodyProperties,
      };
    }
  }

  return {
    required: true,
    content: {
      [contentType]: { schema },
    },
  };
}

/**
 * Build OpenAPI 3.x responses
 */
function buildResponses3(endpoint: EndpointWithTool): Record<string, unknown> {
  const contentType = endpoint.response_content_type || 'application/json';

  return {
    '200': {
      description: 'Successful response',
      content: {
        [contentType]: {
          schema: { type: 'object' },
        },
      },
    },
    '400': { description: 'Bad request' },
    '401': { description: 'Unauthorized' },
    '500': { description: 'Internal server error' },
  };
}

/**
 * Build Swagger 2.0 operation
 */
function buildOperation2(endpoint: EndpointWithTool, tool?: ToolRow): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: endpoint.operation_id,
    summary: tool?.name || endpoint.operation_id,
    description: tool?.description || '',
    produces: [endpoint.response_content_type || 'application/json'],
    consumes: [endpoint.request_content_type || 'application/json'],
  };

  if (tool?.category) {
    operation.tags = [tool.category];
  }

  if (tool?.has_widget) {
    operation['x-has-widget'] = true;
  }

  // Build parameters (including body for Swagger 2.0)
  const parameters = buildParameters2(endpoint, tool);
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  operation.responses = {
    '200': { description: 'Successful response' },
    '400': { description: 'Bad request' },
    '401': { description: 'Unauthorized' },
    '500': { description: 'Internal server error' },
  };

  return operation;
}

/**
 * Build Swagger 2.0 parameters (includes body as parameter)
 */
function buildParameters2(endpoint: EndpointWithTool, tool?: ToolRow): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];

  // Path parameters
  for (const name of endpoint.path_params || []) {
    params.push({
      name,
      in: 'path',
      required: true,
      type: 'string',
    });
  }

  // Query parameters
  for (const qp of endpoint.query_params || []) {
    params.push({
      name: qp.name,
      in: 'query',
      required: qp.required || false,
      type: qp.type || 'string',
      description: qp.description || '',
    });
  }

  // Header parameters
  for (const name of endpoint.header_params || []) {
    params.push({
      name,
      in: 'header',
      required: false,
      type: 'string',
    });
  }

  // Body parameter for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.http_method) && tool?.input_schema) {
    const inputSchema = tool.input_schema as Record<string, unknown>;
    const properties = (inputSchema.properties || {}) as Record<string, unknown>;
    const pathParams = new Set(endpoint.path_params || []);
    const queryParams = new Set((endpoint.query_params || []).map(p => p.name));
    const headerParams = new Set(endpoint.header_params || []);

    const bodyProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!pathParams.has(key) && !queryParams.has(key) && !headerParams.has(key)) {
        bodyProperties[key] = value;
      }
    }

    if (Object.keys(bodyProperties).length > 0) {
      params.push({
        name: 'body',
        in: 'body',
        required: true,
        schema: {
          type: 'object',
          properties: bodyProperties,
        },
      });
    }
  }

  return params;
}

/**
 * Update spec in database with regenerated content
 */
export async function updateSpecFromEndpoints(
  supabase: { from: (table: string) => { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } } },
  specId: string,
  regenerated: RegeneratedSpec
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('rest_api_specs')
    .update({
      swagger_spec: regenerated.json,
      raw_spec: regenerated.raw,
      updated_at: new Date().toISOString(),
    })
    .eq('id', specId);

  if (error) {
    return { success: false, error: String(error) };
  }

  return { success: true };
}
