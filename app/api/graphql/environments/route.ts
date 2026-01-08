/**
 * GraphQL Environment Management API
 * 
 * POST /api/graphql/environments - Create a new environment for a GraphQL spec
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateGraphQLToolName, generateInputSchema } from '@/src/lib/graphql-parser';
import type { EnvironmentInsert, ToolInsert, GraphQLArgumentDef } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { specId, name, host } = body;

    if (!specId || !name || !host) {
      return NextResponse.json({ error: 'Missing required fields: specId, name, host' }, { status: 400 });
    }

    // Get spec and verify ownership
    const { data: spec } = await supabase
      .from('graphql_specs')
      .select('id, user_id, server_name')
      .eq('id', specId)
      .single();

    if (!spec || (spec as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    const serverName = (spec as { server_name: string }).server_name;
    const envName = `${serverName}-${name}`;

    // Check if environment already exists
    const { data: existingEnv } = await supabase
      .from('environments')
      .select('id')
      .eq('user_id', userId)
      .eq('name', envName)
      .single();

    if (existingEnv) {
      return NextResponse.json({ error: 'Environment with this name already exists' }, { status: 409 });
    }

    // Create environment
    const envInsert: EnvironmentInsert = {
      user_id: userId,
      name: envName,
      host,
      custom_config: {},
    };

    const { data: newEnv, error: envError } = await supabase
      .from('environments')
      .insert(envInsert as never)
      .select()
      .single();

    if (envError || !newEnv) {
      console.error('Error creating environment:', envError);
      return NextResponse.json({ error: 'Failed to create environment' }, { status: 500 });
    }

    const envId = (newEnv as { id: string }).id;

    // Link environment to spec
    await supabase
      .from('graphql_environments')
      .insert({ spec_id: specId, environment_id: envId } as never);

    // Get existing operations for this spec
    const { data: operations } = await supabase
      .from('graphql_operations')
      .select('id, tool_id, operation_name, operation_type, description, arguments')
      .eq('spec_id', specId);

    if (!operations || operations.length === 0) {
      return NextResponse.json({
        success: true,
        environmentId: envId,
        toolsCreated: 0,
        message: 'Environment created (no operations to create tools for)'
      });
    }

    // Create tools for this environment
    let toolsCreated = 0;
    for (const op of operations as Array<{
      id: string;
      tool_id: string;
      operation_name: string;
      operation_type: string;
      description: string | null;
      arguments: GraphQLArgumentDef[];
    }>) {
      // Get existing tool for reference
      const { data: existingTool } = await supabase
        .from('tools')
        .select('category, categories, has_widget')
        .eq('id', op.tool_id)
        .single();

      const toolName = generateGraphQLToolName(name, serverName, op.operation_name);
      const inputSchema = generateInputSchema(op.arguments || []);

      const toolInsert: ToolInsert = {
        name: toolName,
        description: op.description || `GraphQL ${op.operation_type}: ${op.operation_name}`,
        category: (existingTool as { category: string } | null)?.category as 'Utilities' || 'Utilities',
        categories: (existingTool as { categories: string[] } | null)?.categories || ['Utilities'],
        tool_type: 'GQL',
        input_schema: inputSchema,
        output_schema: { type: 'object' },
        has_widget: (existingTool as { has_widget: boolean } | null)?.has_widget || false,
        invoking_message: `Executing ${op.operation_type} ${op.operation_name}...`,
        invoked_message: 'GraphQL operation complete',
        user_id: userId,
      };

      const { error: toolError } = await supabase
        .from('tools')
        .upsert(toolInsert as never, { onConflict: 'name' });

      if (toolError) {
        console.error('Error creating tool:', toolError);
        continue;
      }

      toolsCreated++;
    }

    return NextResponse.json({ 
      success: true, 
      environmentId: envId,
      toolsCreated,
    });
  } catch (error) {
    console.error('Error creating GraphQL environment:', error);
    return NextResponse.json({ error: 'Failed to create environment' }, { status: 500 });
  }
}

