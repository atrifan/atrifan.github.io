/**
 * List REST API Specs API
 *
 * Returns all imported swagger/openapi specs for the current user,
 * including environments and tools for each spec.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateToolName } from '@/src/lib/openapi-parser';

export const dynamic = 'force-dynamic';

interface ToolInfo {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
}

interface RestApiEndpoint {
  id: string;
  tool_id: string;
  operation_id: string;
  http_method: string;
  path: string;
  tool?: ToolInfo;
}

interface RestApiEnvironment {
  id: string;
  name: string;
  host: string;
  tools?: ToolInfo[];
}

interface RestApiSpec {
  id: string;
  server_name: string;
  api_title: string;
  api_description: string;
  api_version: string;
  openapi_version: string;
  created_at: string;
  updated_at: string;
  source_url?: string;
  import_method?: 'paste' | 'url';
  auth_type?: string;
  endpoint_count?: number;
  endpoints?: RestApiEndpoint[];
  environments?: RestApiEnvironment[];
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all specs for this user
    const { data: specs, error } = await supabase
      .from('rest_api_specs')
      .select('id, server_name, api_title, api_description, api_version, openapi_version, created_at, updated_at, source_url, import_method, auth_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching REST API specs:', error);
      return NextResponse.json({ error: 'Failed to fetch specs' }, { status: 500 });
    }

    // Get endpoints, tools, and environments for each spec
    const specsWithDetails: RestApiSpec[] = [];

    for (const spec of (specs || []) as RestApiSpec[]) {
      // Get endpoints with their tools
      const { data: endpoints } = await supabase
        .from('rest_api_endpoints')
        .select(`
          id,
          tool_id,
          operation_id,
          http_method,
          path
        `)
        .eq('spec_id', spec.id);

      // Get tool details for each endpoint
      const endpointsWithTools: RestApiEndpoint[] = [];
      for (const endpoint of (endpoints || []) as RestApiEndpoint[]) {
        const { data: tool } = await supabase
          .from('tools')
          .select('id, name, description, has_widget')
          .eq('id', endpoint.tool_id)
          .single();

        endpointsWithTools.push({
          ...endpoint,
          tool: tool ? (tool as RestApiEndpoint['tool']) : undefined,
        });
      }

      // Get environments linked to this spec via junction table
      const { data: envLinks } = await supabase
        .from('rest_api_environments')
        .select('environment_id')
        .eq('spec_id', spec.id);

      const specEnvironments: RestApiEnvironment[] = [];
      for (const link of (envLinks || []) as Array<{ environment_id: string }>) {
        const { data: env } = await supabase
          .from('environments')
          .select('id, name, host')
          .eq('id', link.environment_id)
          .single();

        if (env) {
          specEnvironments.push(env as RestApiEnvironment);
        }
      }

      // For each environment, find the tools that belong to it
      const environmentsWithTools: RestApiEnvironment[] = [];
      for (const env of specEnvironments as RestApiEnvironment[]) {
        // Find tools for this environment by matching the naming pattern
        const envTools: ToolInfo[] = [];
        for (const endpoint of endpointsWithTools) {
          // Generate the expected tool name for this environment (includes HTTP method)
          const expectedToolName = generateToolName(env.name, spec.server_name, endpoint.operation_id, endpoint.http_method);

          // Fetch the tool with this name
          const { data: envTool } = await supabase
            .from('tools')
            .select('id, name, description, has_widget')
            .eq('name', expectedToolName)
            .single();

          if (envTool) {
            envTools.push(envTool as ToolInfo);
          }
        }

        environmentsWithTools.push({
          ...env,
          tools: envTools,
        });
      }

      specsWithDetails.push({
        ...spec,
        endpoint_count: endpointsWithTools.length,
        endpoints: endpointsWithTools,
        environments: environmentsWithTools,
      });
    }

    return NextResponse.json({
      specs: specsWithDetails,
      total: specsWithDetails.length,
    });

  } catch (error) {
    console.error('Error in swagger list:', error);
    return NextResponse.json(
      { error: `Failed to list specs: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

