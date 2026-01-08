/**
 * OpenAPI/Swagger Parser Utility
 * 
 * Parses and validates OpenAPI specs, extracts tools with schemas.
 * Based on Python reference implementation.
 */

import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { HttpMethod, QueryParamDef } from '@/src/types/supabase';

// ============ Types ============

export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, PathItem>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Parameter[];
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  /** OpenAPI tags for categorization */
  tags?: string[];
  /** Custom extension for widget support */
  'x-has-widget'?: boolean;
}

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
}

interface RequestBody {
  required?: boolean;
  content?: Record<string, MediaType>;
}

interface MediaType {
  schema?: SchemaObject;
}

interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  [key: string]: unknown;
}

/** Extracted tool from OpenAPI spec */
export interface ExtractedTool {
  operationId: string;
  name: string;
  description: string;
  httpMethod: HttpMethod;
  path: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  pathParams: string[];
  queryParams: QueryParamDef[];
  headerParams: string[];
  requestContentType: string;
  responseContentType: string;
  headers: Record<string, string>;
  /** Tags from OpenAPI spec (used as categories) */
  tags: string[];
  /** Widget support from x-has-widget extension */
  hasWidget: boolean;
}

/** Extracted environment from OpenAPI spec */
export interface ExtractedEnvironment {
  name: string;
  host: string;
}

/** Parse result */
export interface ParseResult {
  success: boolean;
  error?: string;
  spec?: OpenAPISpec;
  tools?: ExtractedTool[];
  environments?: ExtractedEnvironment[];
  apiInfo?: {
    title: string;
    description: string;
    version: string;
    openapiVersion: string;
  };
}

// ============ Parser Functions ============

/**
 * Detect if input is JSON or YAML
 */
export function detectFormat(input: string): 'json' | 'yaml' {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  return 'yaml';
}

/**
 * Parse spec string to object
 */
export function parseSpecString(input: string, format?: 'json' | 'yaml'): OpenAPISpec {
  const detectedFormat = format || detectFormat(input);
  
  if (detectedFormat === 'json') {
    return JSON.parse(input);
  }
  return YAML.parse(input);
}

/**
 * Validate OpenAPI spec using swagger-parser
 */
export async function validateSpec(spec: OpenAPISpec): Promise<{ valid: boolean; error?: string }> {
  try {
    await SwaggerParser.validate(spec as never);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Build input schema from OpenAPI operation
 */
function buildInputSchema(operation: Operation, path: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Add parameters
  for (const param of operation.parameters || []) {
    const paramSchema = param.schema || { type: 'string' };

    properties[param.name] = {
      type: paramSchema.type || 'string',
      description: param.description || `${param.in} parameter`,
      ...Object.fromEntries(
        Object.entries(paramSchema).filter(([k]) => k !== 'type')
      ),
    };

    if (param.required) {
      required.push(param.name);
    }
  }

  // Add request body properties for POST/PUT/PATCH
  const requestBody = operation.requestBody;
  if (requestBody) {
    const content = requestBody.content || {};
    const jsonContent = content['application/json'];
    const bodySchema = jsonContent?.schema;

    if (bodySchema?.properties) {
      Object.assign(properties, bodySchema.properties);
      if (bodySchema.required) {
        required.push(...bodySchema.required);
      }
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: true,
  };
}

/**
 * Build output schema from OpenAPI operation responses
 */
function buildOutputSchema(operation: Operation): Record<string, unknown> {
  const responses = operation.responses || {};

  // Look for successful response (2xx)
  let successResponse: Response | undefined;
  for (const [statusCode, response] of Object.entries(responses)) {
    if (statusCode.startsWith('2')) {
      successResponse = response;
      break;
    }
  }

  if (!successResponse) {
    return {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'API response' },
      },
    };
  }

  // Extract schema from response content
  const content = successResponse.content || {};

  // Try JSON content first
  const jsonContent = content['application/json'];
  if (jsonContent?.schema) {
    return jsonContent.schema as Record<string, unknown>;
  }

  // Try other content types
  for (const contentSpec of Object.values(content)) {
    if (contentSpec?.schema) {
      return contentSpec.schema as Record<string, unknown>;
    }
  }

  // Fallback
  return {
    type: 'object',
    properties: {
      result: { type: 'string', description: successResponse.description || 'API response' },
    },
  };
}

/**
 * Build headers from OpenAPI operation
 */
function buildHeaders(operation: Operation, method: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Extract headers from parameters
  for (const param of operation.parameters || []) {
    if (param.in === 'header') {
      if (param.schema?.default !== undefined) {
        headers[param.name] = String(param.schema.default);
      }
    }
  }

  // Extract Content-Type from requestBody
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const requestBody = operation.requestBody;
    if (requestBody?.content) {
      const contentType = Object.keys(requestBody.content)[0];
      if (contentType) {
        headers['Content-Type'] = contentType;
      }
    }
  }

  // Extract Accept from responses
  const responses = operation.responses || {};
  for (const [statusCode, response] of Object.entries(responses)) {
    if (statusCode.startsWith('2') && response.content) {
      const acceptType = Object.keys(response.content)[0];
      if (acceptType) {
        headers['Accept'] = acceptType;
      }
      break;
    }
  }

  return headers;
}

/**
 * Normalize name for tool naming (lowercase, replace spaces with underscores)
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Generate tool name from environment, server name, and operation ID
 * Format: <env>-<server>-<operation> or <server>-<operation> if no environment
 */
export function generateToolName(
  environment: string,
  serverName: string,
  operationId: string
): string {
  const envPart = normalizeName(environment);
  const serverPart = normalizeName(serverName);
  const opPart = normalizeName(operationId);

  // If no environment, just use server-operation
  if (!envPart) {
    return `${serverPart}-${opPart}`;
  }

  return `${envPart}-${serverPart}-${opPart}`;
}

/**
 * Extract tools from OpenAPI spec
 */
export function extractTools(spec: OpenAPISpec, serverName: string): ExtractedTool[] {
  const tools: ExtractedTool[] = [];
  const paths = spec.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const methods: Array<[string, Operation | undefined]> = [
      ['GET', pathItem.get],
      ['POST', pathItem.post],
      ['PUT', pathItem.put],
      ['PATCH', pathItem.patch],
      ['DELETE', pathItem.delete],
    ];

    for (const [method, operation] of methods) {
      if (!operation) continue;

      const operationId = operation.operationId;
      if (!operationId) continue;

      // Extract description
      const description = operation.description || operation.summary || `${method} ${path}`;

      // Extract parameters by location
      const pathParams: string[] = [];
      const queryParams: QueryParamDef[] = [];
      const headerParams: string[] = [];

      for (const param of operation.parameters || []) {
        if (param.in === 'path') {
          pathParams.push(param.name);
        } else if (param.in === 'query') {
          queryParams.push({
            name: param.name,
            required: param.required || false,
            type: param.schema?.type || 'string',
            description: param.description,
          });
        } else if (param.in === 'header') {
          headerParams.push(param.name);
        }
      }

      // Determine content types
      let requestContentType = 'application/json';
      let responseContentType = 'application/json';

      if (operation.requestBody?.content) {
        requestContentType = Object.keys(operation.requestBody.content)[0] || 'application/json';
      }

      const responses = operation.responses || {};
      for (const [statusCode, response] of Object.entries(responses)) {
        if (statusCode.startsWith('2') && response.content) {
          responseContentType = Object.keys(response.content)[0] || 'application/json';
          break;
        }
      }

      // Extract tags (used as categories)
      const tags = operation.tags || [];

      // Extract x-has-widget extension
      const hasWidget = operation['x-has-widget'] === true;

      tools.push({
        operationId,
        name: generateToolName('', serverName, operationId),
        description,
        httpMethod: method as HttpMethod,
        path,
        inputSchema: buildInputSchema(operation, path),
        outputSchema: buildOutputSchema(operation),
        pathParams,
        queryParams,
        headerParams,
        requestContentType,
        responseContentType,
        headers: buildHeaders(operation, method),
        tags,
        hasWidget,
      });
    }
  }

  return tools;
}

/**
 * Extract environments (servers) from OpenAPI spec
 */
export function extractEnvironments(spec: OpenAPISpec): ExtractedEnvironment[] {
  const servers = spec.servers || [];

  if (servers.length === 0) {
    return [{ name: 'default', host: '' }];
  }

  return servers.map((server, index) => ({
    name: server.description || `env${index + 1}`,
    host: server.url,
  }));
}

/**
 * Parse and extract everything from OpenAPI spec
 */
export async function parseOpenAPISpec(
  input: string,
  serverName: string,
  format?: 'json' | 'yaml'
): Promise<ParseResult> {
  try {
    // Parse string to object
    const spec = parseSpecString(input, format);

    // Validate
    const validation = await validateSpec(spec);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Extract API info
    const apiInfo = {
      title: spec.info?.title || 'Untitled API',
      description: spec.info?.description || '',
      version: spec.info?.version || '1.0.0',
      openapiVersion: spec.openapi || spec.swagger || 'unknown',
    };

    // Extract tools
    const tools = extractTools(spec, serverName);

    // Extract environments
    const environments = extractEnvironments(spec);

    return {
      success: true,
      spec,
      tools,
      environments,
      apiInfo,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse spec: ${(err as Error).message}`,
    };
  }
}

