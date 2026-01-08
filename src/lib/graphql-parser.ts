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

interface IntrospectionFullType {
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
 * Parse GraphQL introspection result and extract all operations
 */
export function parseGraphQLSchema(introspectionResult: IntrospectionResult): ParsedGraphQLSchema {
  const schema = introspectionResult.__schema;

  return {
    queries: extractOperations(schema, schema.queryType?.name || null, 'query'),
    mutations: extractOperations(schema, schema.mutationType?.name || null, 'mutation'),
    subscriptions: extractOperations(schema, schema.subscriptionType?.name || null, 'subscription'),
    types: schema.types.filter(t => !t.name.startsWith('__')), // Exclude introspection types
  };
}

/**
 * Generate a tool name from environment, server, and operation name
 * Format: {env}-{server}-{operation} (max 50 chars)
 */
export function generateGraphQLToolName(
  envName: string,
  serverName: string,
  operationName: string
): string {
  // Sanitize parts: lowercase, replace non-alphanumeric with underscore
  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const env = sanitize(envName);
  const server = sanitize(serverName);
  const op = sanitize(operationName);

  // Build name with max 50 chars
  let name = `${env}_${server}_${op}`;
  if (name.length > 50) {
    // Truncate operation name to fit
    const maxOpLen = 50 - env.length - server.length - 2; // 2 for underscores
    name = `${env}_${server}_${op.slice(0, Math.max(maxOpLen, 10))}`;
  }

  return name.slice(0, 50);
}

/**
 * Convert GraphQL type to JSON Schema type
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

/**
 * Generate JSON Schema input schema from GraphQL arguments
 */
export function generateInputSchema(args: GraphQLArgumentDef[]): Record<string, unknown> {
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
    properties[arg.name] = {
      ...graphqlTypeToJsonSchema(arg.type),
      description: arg.description || `Argument: ${arg.name}`,
    };

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

