/**
 * GraphQL Schema Parser
 * 
 * Parses GraphQL introspection results and extracts operations (queries/mutations)
 * to create tool definitions.
 */

import type { GraphQLArgumentDef, GraphQLOperationType } from '@/src/types/supabase';

// GraphQL introspection types
interface IntrospectionType {
  kind: string;
  name: string | null;
  ofType?: IntrospectionType | null;
}

interface IntrospectionInputValue {
  name: string;
  description: string | null;
  type: IntrospectionType;
  defaultValue: string | null;
}

interface IntrospectionField {
  name: string;
  description: string | null;
  args: IntrospectionInputValue[];
  type: IntrospectionType;
  isDeprecated: boolean;
  deprecationReason: string | null;
}

export interface IntrospectionFullType {
  kind: string;
  name: string;
  description: string | null;
  fields: IntrospectionField[] | null;
  inputFields: IntrospectionInputValue[] | null;
  interfaces: IntrospectionType[] | null;
  enumValues: Array<{ name: string; description: string | null }> | null;
  possibleTypes: IntrospectionType[] | null;
}

interface IntrospectionSchema {
  queryType: { name: string } | null;
  mutationType: { name: string } | null;
  subscriptionType: { name: string } | null;
  types: IntrospectionFullType[];
}

interface IntrospectionResult {
  __schema: IntrospectionSchema;
}

export interface ExtractedOperation {
  name: string;
  type: GraphQLOperationType;
  description: string;
  arguments: GraphQLArgumentDef[];
  returnType: string;
  returnTypeKind: string;
  operationString: string;
  /** Fully resolved input schema with all types expanded */
  inputSchema?: Record<string, unknown>;
  /** Fully resolved output schema with all types expanded */
  outputSchema?: Record<string, unknown>;
}

export interface ParsedGraphQLSchema {
  queries: ExtractedOperation[];
  mutations: ExtractedOperation[];
  subscriptions: ExtractedOperation[];
  types: IntrospectionFullType[];
}

/**
 * Get the full type name from an introspection type (handles NON_NULL, LIST wrappers)
 */
function getTypeName(type: IntrospectionType): string {
  if (type.kind === 'NON_NULL') {
    return `${getTypeName(type.ofType!)}!`;
  }
  if (type.kind === 'LIST') {
    return `[${getTypeName(type.ofType!)}]`;
  }
  return type.name || 'Unknown';
}

/**
 * Get the base type kind (unwrap NON_NULL and LIST)
 */
function getBaseTypeKind(type: IntrospectionType): string {
  if (type.kind === 'NON_NULL' || type.kind === 'LIST') {
    return getBaseTypeKind(type.ofType!);
  }
  return type.kind;
}

/**
 * Check if a type is required (NON_NULL at the top level)
 */
function isRequired(type: IntrospectionType): boolean {
  return type.kind === 'NON_NULL';
}

/**
 * Convert introspection input value to our argument definition
 */
function convertArgument(arg: IntrospectionInputValue): GraphQLArgumentDef {
  return {
    name: arg.name,
    type: getTypeName(arg.type),
    required: isRequired(arg.type),
    description: arg.description || undefined,
    defaultValue: arg.defaultValue ? JSON.parse(arg.defaultValue) : undefined,
  };
}

/**
 * Generate a GraphQL operation string for a field
 */
function generateOperationString(
  operationType: GraphQLOperationType,
  field: IntrospectionField
): string {
  const args = field.args.map(arg => `$${arg.name}: ${getTypeName(arg.type)}`).join(', ');
  const fieldArgs = field.args.map(arg => `${arg.name}: $${arg.name}`).join(', ');
  
  const argsStr = args ? `(${args})` : '';
  const fieldArgsStr = fieldArgs ? `(${fieldArgs})` : '';
  
  return `${operationType}${argsStr} {\n  ${field.name}${fieldArgsStr}\n}`;
}

/**
 * Extract operations from a type (Query, Mutation, or Subscription)
 * Note: inputSchema and outputSchema are added later by parseGraphQLSchema
 */
function extractOperations(
  schema: IntrospectionSchema,
  typeName: string | null,
  operationType: GraphQLOperationType
): ExtractedOperation[] {
  if (!typeName) return [];

  const type = schema.types.find(t => t.name === typeName);
  if (!type || !type.fields) return [];

  return type.fields
    .filter(field => !field.name.startsWith('__')) // Skip introspection fields
    .map(field => ({
      name: field.name,
      type: operationType,
      description: field.description || `${operationType} ${field.name}`,
      arguments: field.args.map(convertArgument),
      returnType: getTypeName(field.type),
      returnTypeKind: getBaseTypeKind(field.type),
      operationString: generateOperationString(operationType, field),
    }));
}

/**
 * Add resolved schemas to operations
 */
function addResolvedSchemas(
  operations: ExtractedOperation[],
  types: IntrospectionFullType[]
): ExtractedOperation[] {
  return operations.map(op => ({
    ...op,
    inputSchema: generateInputSchemaWithTypes(op.arguments, types),
    outputSchema: generateOutputSchemaFromType(op.returnType, types),
  }));
}

/**
 * Generate fully resolved input schema (internal helper)
 * Uses higher depth limit to ensure full type resolution
 */
function generateInputSchemaWithTypes(args: GraphQLArgumentDef[], types: IntrospectionFullType[]): Record<string, unknown> {
  if (args.length === 0) {
    return { type: 'object', properties: {}, required: [] };
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const arg of args) {
    properties[arg.name] = {
      ...resolveTypeToSchemaInternal(arg.type, types, new Set(), 10),
      description: arg.description || `Argument: ${arg.name}`,
    };
    if (arg.required) {
      required.push(arg.name);
    }
  }

  return { type: 'object', properties, required };
}

/**
 * Generate fully resolved output schema (internal helper)
 * Uses higher depth limit to ensure full type resolution
 */
function generateOutputSchemaFromType(returnType: string, types: IntrospectionFullType[]): Record<string, unknown> {
  return resolveTypeToSchemaInternal(returnType, types, new Set(), 10);
}

/**
 * Internal type resolution (defined here to be available for extractOperations)
 */
function resolveTypeToSchemaInternal(
  typeName: string,
  types: IntrospectionFullType[],
  visited: Set<string>,
  maxDepth: number
): Record<string, unknown> {
  const cleanType = typeName.replace(/!/g, '');
  const baseTypeName = cleanType.replace(/[!\[\]]/g, '');
  const isList = cleanType.includes('[');

  // Scalar types
  const scalarMap: Record<string, string> = {
    'String': 'string', 'Int': 'integer', 'Float': 'number', 'Boolean': 'boolean',
    'ID': 'string', 'DateTime': 'string', 'Date': 'string', 'Time': 'string',
    'JSON': 'object', 'JSONObject': 'object',
  };

  if (scalarMap[baseTypeName]) {
    const scalarSchema: Record<string, unknown> = { type: scalarMap[baseTypeName] };
    if (baseTypeName === 'DateTime' || baseTypeName === 'Date') {
      scalarSchema.format = 'date-time';
    }
    return isList ? { type: 'array', items: scalarSchema } : scalarSchema;
  }

  // Prevent infinite recursion
  if (visited.has(baseTypeName) || maxDepth <= 0) {
    const refSchema: Record<string, unknown> = { type: 'object', description: `Reference to ${baseTypeName}` };
    return isList ? { type: 'array', items: refSchema } : refSchema;
  }

  const typeDef = types.find(t => t.name === baseTypeName);
  if (!typeDef) {
    const unknownSchema: Record<string, unknown> = { type: 'object', description: `Unknown type: ${baseTypeName}` };
    return isList ? { type: 'array', items: unknownSchema } : unknownSchema;
  }

  const newVisited = new Set(visited);
  newVisited.add(baseTypeName);

  let resolvedSchema: Record<string, unknown>;

  switch (typeDef.kind) {
    case 'ENUM': {
      const enumValues = typeDef.enumValues?.map(e => e.name) || [];
      resolvedSchema = { type: 'string', enum: enumValues, description: typeDef.description || `Enum: ${baseTypeName}` };
      break;
    }
    case 'INPUT_OBJECT': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const field of typeDef.inputFields || []) {
        const fieldTypeName = getTypeName(field.type);
        properties[field.name] = {
          ...resolveTypeToSchemaInternal(fieldTypeName, types, newVisited, maxDepth - 1),
          description: field.description || undefined,
        };
        if (field.type.kind === 'NON_NULL') required.push(field.name);
      }
      resolvedSchema = { type: 'object', description: typeDef.description || `Input: ${baseTypeName}`, properties, required: required.length > 0 ? required : undefined };
      break;
    }
    case 'OBJECT':
    case 'INTERFACE': {
      const properties: Record<string, unknown> = {};
      for (const field of typeDef.fields || []) {
        properties[field.name] = {
          ...resolveTypeToSchemaInternal(getTypeName(field.type), types, newVisited, maxDepth - 1),
          description: field.description || undefined,
        };
      }
      resolvedSchema = { type: 'object', description: typeDef.description || `Type: ${baseTypeName}`, properties };
      break;
    }
    case 'UNION': {
      const possibleTypes = typeDef.possibleTypes?.map(t => t.name || 'Unknown') || [];
      resolvedSchema = {
        type: 'object',
        description: `Union of: ${possibleTypes.join(' | ')}`,
        oneOf: possibleTypes.map(t => resolveTypeToSchemaInternal(t, types, newVisited, maxDepth - 1)),
      };
      break;
    }
    default:
      resolvedSchema = { type: 'object', description: `${typeDef.kind}: ${baseTypeName}` };
  }

  return isList ? { type: 'array', items: resolvedSchema } : resolvedSchema;
}

/**
 * Parse GraphQL introspection result and extract all operations
 */
export function parseGraphQLSchema(introspectionResult: IntrospectionResult): ParsedGraphQLSchema {
  const schema = introspectionResult.__schema;
  const allTypes = schema.types.filter(t => !t.name.startsWith('__'));

  // Extract operations and add resolved schemas
  const queries = addResolvedSchemas(
    extractOperations(schema, schema.queryType?.name || null, 'query'),
    allTypes
  );
  const mutations = addResolvedSchemas(
    extractOperations(schema, schema.mutationType?.name || null, 'mutation'),
    allTypes
  );
  const subscriptions = addResolvedSchemas(
    extractOperations(schema, schema.subscriptionType?.name || null, 'subscription'),
    allTypes
  );

  return { queries, mutations, subscriptions, types: allTypes };
}

/**
 * Generate a tool name from environment, server, operation type, and operation name
 * Format: {env}-{server}-{type}-{operation} (max 50 chars)
 * Uses dashes for consistency with REST and MCP naming
 */
export function generateGraphQLToolName(
  envName: string,
  serverName: string,
  operationName: string,
  operationType?: 'query' | 'mutation' | 'subscription'
): string {
  // Sanitize parts: lowercase, replace non-alphanumeric with dash
  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const env = sanitize(envName);
  const server = sanitize(serverName);
  const type = operationType ? sanitize(operationType) : '';
  const op = sanitize(operationName);

  // Build parts array, filtering out empty parts
  const parts = [env, server, type, op].filter(Boolean);
  let name = parts.join('-');

  // Truncate if needed (max 50 chars)
  if (name.length > 50) {
    name = name.slice(0, 50).replace(/-$/, '');
  }

  return name;
}

/**
 * Convert GraphQL type to JSON Schema type (simple version for basic types)
 */
function graphqlTypeToJsonSchema(typeName: string): { type: string; items?: { type: string } } {
  // Remove NON_NULL marker
  const cleanType = typeName.replace(/!/g, '');

  // Check for list
  const listMatch = cleanType.match(/^\[(.+)\]$/);
  if (listMatch) {
    const innerType = graphqlTypeToJsonSchema(listMatch[1]);
    return { type: 'array', items: innerType };
  }

  // Map GraphQL scalars to JSON Schema types
  const scalarMap: Record<string, string> = {
    'String': 'string',
    'Int': 'integer',
    'Float': 'number',
    'Boolean': 'boolean',
    'ID': 'string',
  };

  return { type: scalarMap[cleanType] || 'object' };
}

/** Map of GraphQL scalar types to JSON Schema types */
const SCALAR_MAP: Record<string, string> = {
  'String': 'string',
  'Int': 'integer',
  'Float': 'number',
  'Boolean': 'boolean',
  'ID': 'string',
  'DateTime': 'string',
  'Date': 'string',
  'Time': 'string',
  'JSON': 'object',
  'JSONObject': 'object',
};

/**
 * Get the base type name from a GraphQL type string (removes !, [])
 */
function getBaseTypeName(typeName: string): string {
  return typeName.replace(/[!\[\]]/g, '');
}

/**
 * Check if a type is a list type
 */
function isListType(typeName: string): boolean {
  return typeName.includes('[');
}

/**
 * Resolve a GraphQL type to a full JSON Schema, expanding object types
 * @param typeName - The GraphQL type name (e.g., "User!", "[Post!]!")
 * @param types - All types from the introspection schema
 * @param visited - Set of already visited types to prevent infinite recursion
 * @param maxDepth - Maximum depth for nested type resolution (default 10 for full resolution)
 */
export function resolveTypeToSchema(
  typeName: string,
  types: IntrospectionFullType[],
  visited: Set<string> = new Set(),
  maxDepth: number = 10
): Record<string, unknown> {
  const cleanType = typeName.replace(/!/g, '');
  const baseTypeName = getBaseTypeName(cleanType);
  const isList = isListType(cleanType);

  // Check for scalar types
  if (SCALAR_MAP[baseTypeName]) {
    const scalarSchema: Record<string, unknown> = { type: SCALAR_MAP[baseTypeName] };
    if (baseTypeName === 'DateTime' || baseTypeName === 'Date') {
      scalarSchema.format = 'date-time';
    }
    if (isList) {
      return { type: 'array', items: scalarSchema };
    }
    return scalarSchema;
  }

  // Prevent infinite recursion
  if (visited.has(baseTypeName) || maxDepth <= 0) {
    const refSchema: Record<string, unknown> = { type: 'object', description: `Reference to ${baseTypeName}` };
    if (isList) {
      return { type: 'array', items: refSchema };
    }
    return refSchema;
  }

  // Find the type definition
  const typeDef = types.find(t => t.name === baseTypeName);
  if (!typeDef) {
    const unknownSchema: Record<string, unknown> = { type: 'object', description: `Unknown type: ${baseTypeName}` };
    if (isList) {
      return { type: 'array', items: unknownSchema };
    }
    return unknownSchema;
  }

  const newVisited = new Set(visited);
  newVisited.add(baseTypeName);

  let resolvedSchema: Record<string, unknown>;

  switch (typeDef.kind) {
    case 'ENUM': {
      const enumValues = typeDef.enumValues?.map(e => e.name) || [];
      resolvedSchema = {
        type: 'string',
        enum: enumValues,
        description: typeDef.description || `Enum: ${baseTypeName}`,
      };
      break;
    }

    case 'INPUT_OBJECT': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const field of typeDef.inputFields || []) {
        const fieldTypeName = getTypeName(field.type);
        const fieldRequired = field.type.kind === 'NON_NULL';

        properties[field.name] = {
          ...resolveTypeToSchema(fieldTypeName, types, newVisited, maxDepth - 1),
          description: field.description || undefined,
        };

        if (fieldRequired) {
          required.push(field.name);
        }
      }

      resolvedSchema = {
        type: 'object',
        description: typeDef.description || `Input type: ${baseTypeName}`,
        properties,
        required: required.length > 0 ? required : undefined,
      };
      break;
    }

    case 'OBJECT':
    case 'INTERFACE': {
      const properties: Record<string, unknown> = {};

      for (const field of typeDef.fields || []) {
        const fieldTypeName = getTypeName(field.type);

        properties[field.name] = {
          ...resolveTypeToSchema(fieldTypeName, types, newVisited, maxDepth - 1),
          description: field.description || undefined,
        };
      }

      resolvedSchema = {
        type: 'object',
        description: typeDef.description || `Type: ${baseTypeName}`,
        properties,
      };
      break;
    }

    case 'UNION': {
      const possibleTypes = typeDef.possibleTypes?.map(t => t.name || 'Unknown') || [];
      resolvedSchema = {
        type: 'object',
        description: `Union of: ${possibleTypes.join(' | ')}`,
        oneOf: possibleTypes.map(t => resolveTypeToSchema(t, types, newVisited, maxDepth - 1)),
      };
      break;
    }

    default:
      resolvedSchema = { type: 'object', description: `${typeDef.kind}: ${baseTypeName}` };
  }

  if (isList) {
    return { type: 'array', items: resolvedSchema };
  }

  return resolvedSchema;
}

/**
 * Generate fully resolved JSON Schema input schema from GraphQL arguments
 */
export function generateInputSchema(args: GraphQLArgumentDef[], types?: IntrospectionFullType[]): Record<string, unknown> {
  if (args.length === 0) {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const arg of args) {
    if (types) {
      // Use full type resolution
      properties[arg.name] = {
        ...resolveTypeToSchema(arg.type, types),
        description: arg.description || `Argument: ${arg.name}`,
      };
    } else {
      // Fallback to simple resolution
      properties[arg.name] = {
        ...graphqlTypeToJsonSchema(arg.type),
        description: arg.description || `Argument: ${arg.name}`,
      };
    }

    if (arg.required) {
      required.push(arg.name);
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

/**
 * Generate fully resolved JSON Schema output schema from GraphQL return type
 */
export function generateOutputSchema(returnType: string, types: IntrospectionFullType[]): Record<string, unknown> {
  return resolveTypeToSchema(returnType, types);
}

/**
 * Introspection query to fetch GraphQL schema
 */
export const INTROSPECTION_QUERY = `
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
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
            defaultValue
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
          defaultValue
        }
        interfaces {
          kind
          name
        }
        enumValues(includeDeprecated: true) {
          name
          description
        }
        possibleTypes {
          kind
          name
        }
      }
    }
  }
`;

