/**
 * List GraphQL Specs API
 *
 * GET /api/graphql/list
 * Returns all imported GraphQL specs for the current user
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface ToolInfo {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

interface GraphQLOperation {
  id: string;
  tool_id: string;
  operation_name: string;
  operation_type: string;
  description: string | null;
  tool?: ToolInfo;
}

interface GraphQLEnvironment {
  id: string;
  name: string;
  host: string;
}

interface GraphQLSpec {
  id: string;
  server_name: string;
  host: string | null;
  api_title: string | null;
  api_description: string | null;
  source_url: string;
  auth_type?: string;
  created_at: string;
  updated_at: string;
  operation_count?: number;
  operations?: GraphQLOperation[];
  environments?: GraphQLEnvironment[];
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all GraphQL specs for this user
    const { data: specs, error } = await supabase
      .from('graphql_specs')
      .select('id, server_name, host, api_title, api_description, source_url, auth_type, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching GraphQL specs:', error);
      return NextResponse.json({ error: 'Failed to fetch specs' }, { status: 500 });
    }

    // Get operations and environments for each spec
    const specsWithDetails: GraphQLSpec[] = [];

    for (const spec of (specs || []) as GraphQLSpec[]) {
      // Get operations with tools
      const { data: operations } = await supabase
        .from('graphql_operations')
        .select('id, tool_id, operation_name, operation_type, description')
        .eq('spec_id', spec.id);

      // Get tool details for each operation
      const operationsWithTools: GraphQLOperation[] = [];
      for (const op of (operations || []) as GraphQLOperation[]) {
        const { data: tool } = await supabase
          .from('tools')
          .select('id, name, description, has_widget, input_schema, output_schema')
          .eq('id', op.tool_id)
          .single();

        operationsWithTools.push({
          ...op,
          tool: tool ? (tool as ToolInfo) : undefined,
        });
      }

      // Get environments linked to this spec
      const { data: envLinks } = await supabase
        .from('graphql_environments')
        .select('environment_id')
        .eq('spec_id', spec.id);

      const environments: GraphQLEnvironment[] = [];
      for (const link of (envLinks || []) as Array<{ environment_id: string }>) {
        const { data: env } = await supabase
          .from('environments')
          .select('id, name, host')
          .eq('id', link.environment_id)
          .single();

        if (env) {
          environments.push(env as GraphQLEnvironment);
        }
      }

      specsWithDetails.push({
        ...spec,
        operation_count: operationsWithTools.length,
        operations: operationsWithTools,
        environments,
      });
    }

    return NextResponse.json({ specs: specsWithDetails });
  } catch (error) {
    console.error('Error listing GraphQL specs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

