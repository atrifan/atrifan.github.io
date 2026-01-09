/**
 * GraphQL Import API
 * 
 * POST /api/graphql/import
 * Import GraphQL schema and create tools from operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { parseGraphQLSchema, generateGraphQLToolName, generateInputSchema } from '@/src/lib/graphql-parser';
import type { ToolInsert, GraphQLSpecInsert, GraphQLOperationInsert, EnvironmentInsert, ToolCategory } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface EnvironmentConfig {
  name: string;
  host: string;
}

interface ImportRequest {
  serverName: string;
  sourceUrl: string;
  schema: Record<string, unknown>;
  apiTitle?: string;
  apiDescription?: string;
  defaultHeaders?: Record<string, string>;
  category?: string;
  environments?: EnvironmentConfig[];
  selectedOperations?: string[]; // Optional: if provided, only import these operations
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body: ImportRequest = await request.json();
    const { serverName, sourceUrl, schema, apiTitle, apiDescription, defaultHeaders, category, environments, selectedOperations } = body;

    // Validate category - first check if it's a custom category in the database
    const validCategories: ToolCategory[] = ['Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'];
    let toolCategory: ToolCategory = 'Utilities';

    if (category) {
      if (validCategories.includes(category as ToolCategory)) {
        toolCategory = category as ToolCategory;
      } else {
        // Check if it's a custom category
        const { data: customCat } = await supabase
          .from('categories')
          .select('name')
          .eq('user_id', userId)
          .eq('name', category)
          .single();

        if (customCat) {
          toolCategory = category as ToolCategory;
        }
      }
    }

    // Validate input
    if (!serverName || !sourceUrl || !schema) {
      return NextResponse.json({ error: 'Missing required fields: serverName, sourceUrl, schema' }, { status: 400 });
    }

    // Parse the schema
    const parsed = parseGraphQLSchema(schema as { __schema: Parameters<typeof parseGraphQLSchema>[0]['__schema'] });
    let allOperations = [...parsed.queries, ...parsed.mutations];
    // Note: subscriptions are not supported as tools (they require websockets)

    if (allOperations.length === 0) {
      return NextResponse.json({ error: 'No queries or mutations found in schema' }, { status: 400 });
    }

    // Filter operations if selectedOperations is provided
    if (selectedOperations && selectedOperations.length > 0) {
      const selectedSet = new Set(selectedOperations);
      allOperations = allOperations.filter(op => selectedSet.has(op.name));

      if (allOperations.length === 0) {
        return NextResponse.json({ error: 'No operations selected for import' }, { status: 400 });
      }
    }

    // Determine auth type based on provided headers
    let authType: 'none' | 'api_key' | 'bearer' | 'basic' = 'none';
    const authConfig: Record<string, unknown> = {};

    if (defaultHeaders) {
      if (defaultHeaders['x-api-key']) {
        authType = 'api_key';
        authConfig.header_name = 'x-api-key'; // snake_case to match graphql-handler.ts
      } else if (defaultHeaders['Authorization']?.startsWith('Bearer ')) {
        authType = 'bearer';
      }
    }

    // 1. Create GraphQL spec
    const specInsert: GraphQLSpecInsert = {
      user_id: userId,
      server_name: serverName,
      schema_json: schema,
      api_title: apiTitle || serverName,
      api_description: apiDescription,
      source_url: sourceUrl,
      default_headers: defaultHeaders || {},
      auth_type: authType,
      auth_config: authConfig,
    };

    const { data: specData, error: specError } = await supabase
      .from('graphql_specs')
      .upsert(specInsert as never, { onConflict: 'user_id,server_name' })
      .select()
      .single();

    if (specError || !specData) {
      console.error('Error creating GraphQL spec:', specError);
      return NextResponse.json({ error: 'Failed to save GraphQL specification' }, { status: 500 });
    }

    const specId = (specData as { id: string }).id;

    // 2. Create environments (use provided environments or default)
    const envsToCreate = environments && environments.length > 0
      ? environments
      : [{ name: 'default', host: sourceUrl }];

    const createdEnvIds: string[] = [];

    for (const env of envsToCreate) {
      const envName = `${serverName}-${env.name}`;
      const envInsert: EnvironmentInsert = {
        user_id: userId,
        name: envName,
        host: env.host,
        custom_config: {},
      };

      const { data: envData, error: envError } = await supabase
        .from('environments')
        .upsert(envInsert as never, { onConflict: 'user_id,name' })
        .select()
        .single();

      if (envError) {
        console.error('Error creating environment:', envError);
      } else if (envData) {
        createdEnvIds.push((envData as { id: string }).id);
      }
    }

    // 3. Create tools and operations for each environment
    let toolCount = 0;
    const createdTools: string[] = [];

    for (const env of envsToCreate) {
      for (const op of allOperations) {
        const toolName = generateGraphQLToolName(env.name, serverName, op.name);
        // Use the fully resolved input schema from the parser, or fallback to simple generation
        const inputSchema = op.inputSchema || generateInputSchema(op.arguments);

        // Create tool definition with fully resolved schemas
        const toolInsert: ToolInsert = {
          name: toolName,
          description: op.description || `GraphQL ${op.type}: ${op.name}`,
          category: toolCategory,
          categories: [toolCategory],
          tool_type: 'GQL',
          input_schema: inputSchema,
          output_schema: op.outputSchema || { type: 'object', description: op.returnType },
          has_widget: false,
          invoking_message: `Executing ${op.type} ${op.name}...`,
          invoked_message: 'GraphQL operation complete',
          user_id: userId,
        };

        const { data: toolData, error: toolError } = await supabase
          .from('tools')
          .upsert(toolInsert as never, { onConflict: 'name' })
          .select()
          .single();

        if (toolError || !toolData) {
          console.error('Error creating tool:', toolError);
          continue;
        }

        const toolId = (toolData as { id: string }).id;

        // Create operation record (only once per operation, not per environment)
        // Check if operation already exists
        const { data: existingOp } = await supabase
          .from('graphql_operations')
          .select('id')
          .eq('spec_id', specId)
          .eq('operation_name', op.name)
          .single();

        if (!existingOp) {
          const opInsert: GraphQLOperationInsert = {
            spec_id: specId,
            tool_id: toolId,
            operation_name: op.name,
            operation_type: op.type,
            operation_string: op.operationString,
            arguments: op.arguments,
            return_type: op.returnType,
            return_type_kind: op.returnTypeKind,
            description: op.description,
          };

          const { error: opError } = await supabase
            .from('graphql_operations')
            .upsert(opInsert as never, { onConflict: 'spec_id,operation_name' });

          if (opError) {
            console.error('Error creating operation:', opError);
          }
        }

        toolCount++;
        createdTools.push(toolName);
      }
    }

    // 4. Link environments to spec
    for (const envId of createdEnvIds) {
      await supabase
        .from('graphql_environments')
        .upsert({ spec_id: specId, environment_id: envId } as never, { onConflict: 'spec_id,environment_id' });
    }

    return NextResponse.json({
      success: true,
      specId,
      toolCount,
      tools: createdTools,
      queryCount: parsed.queries.length,
      mutationCount: parsed.mutations.length,
      environmentCount: envsToCreate.length,
    });
  } catch (error) {
    console.error('GraphQL import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

