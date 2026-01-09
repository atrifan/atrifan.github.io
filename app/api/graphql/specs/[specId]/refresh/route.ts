import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { parseGraphQLSchema } from '@/src/lib/graphql-parser';

export const dynamic = 'force-dynamic';

/**
 * POST /api/graphql/specs/[specId]/refresh
 * Re-parses the stored schema and updates tool schemas with resolved types
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ specId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { specId } = await params;

    // Get the spec with its stored schema
    const { data: spec, error: specError } = await supabase
      .from('graphql_specs')
      .select('*')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (specError || !spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Re-parse the schema to get resolved schemas
    const specData = spec as { schema_json: Record<string, unknown> };
    const schemaJson = specData.schema_json as { __schema: Parameters<typeof parseGraphQLSchema>[0]['__schema'] };
    const parsed = parseGraphQLSchema(schemaJson);
    const allOperations = [...parsed.queries, ...parsed.mutations];

    // Get all operations for this spec
    const { data: operationsData, error: opsError } = await supabase
      .from('graphql_operations')
      .select('id, operation_name, tool_id')
      .eq('spec_id', specId);

    if (opsError) {
      return NextResponse.json({ error: 'Failed to fetch operations' }, { status: 500 });
    }

    const operations = operationsData as Array<{ id: string; operation_name: string; tool_id: string }> | null;
    let updatedCount = 0;

    // Update each tool with the resolved schemas
    for (const op of operations || []) {
      const parsedOp = allOperations.find(p => p.name === op.operation_name);
      if (!parsedOp) continue;

      // Generate input schema from arguments
      const inputSchema: Record<string, unknown> = {
        type: 'object',
        properties: {} as Record<string, unknown>,
        required: [] as string[],
      };

      for (const arg of parsedOp.arguments) {
        (inputSchema.properties as Record<string, unknown>)[arg.name] = {
          type: mapGraphQLTypeToJsonSchema(arg.type),
          description: arg.description || undefined,
        };
        if (arg.required) {
          (inputSchema.required as string[]).push(arg.name);
        }
      }

      // Use the fully resolved output schema from the parser
      const outputSchema = parsedOp.outputSchema || { type: 'object', description: parsedOp.returnType };

      // Update the tool
      const { error: updateError } = await supabase
        .from('tools')
        .update({
          input_schema: parsedOp.inputSchema || inputSchema,
          output_schema: outputSchema,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', op.tool_id);

      if (!updateError) {
        updatedCount++;
      }
    }

    // Update spec's updated_at
    await supabase
      .from('graphql_specs')
      .update({ updated_at: new Date().toISOString() } as never)
      .eq('id', specId);

    return NextResponse.json({
      success: true,
      updatedCount,
      totalOperations: operations?.length || 0,
    });
  } catch (error) {
    console.error('GraphQL refresh error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Map GraphQL type string to JSON Schema type
 */
function mapGraphQLTypeToJsonSchema(graphqlType: string): string {
  const cleanType = graphqlType.replace(/!/g, '').replace(/\[|\]/g, '');
  
  switch (cleanType.toLowerCase()) {
    case 'int':
    case 'float':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'id':
    case 'string':
      return 'string';
    default:
      return 'object';
  }
}

