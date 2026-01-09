/**
 * Reimport API - Refresh a spec from its source URL
 * POST /api/swagger/reimport
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { parseOpenAPISpec, generateToolName } from '@/src/lib/openapi-parser';
import type { ToolInsert, RestApiEndpointInsert, ToolCategory } from '@/src/types/supabase';

interface ReimportRequest {
  specId: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ReimportRequest = await request.json();
    const { specId } = body;

    if (!specId) {
      return NextResponse.json({ error: 'Missing specId' }, { status: 400 });
    }

    // Get the existing spec
    const { data: specData, error: specError } = await supabase
      .from('rest_api_specs')
      .select('*')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (specError || !specData) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    const spec = specData as {
      id: string;
      server_name: string;
      source_url: string | null;
      swagger_spec: Record<string, unknown>;
    };

    if (!spec.source_url) {
      return NextResponse.json({ error: 'No source URL stored for this spec' }, { status: 400 });
    }

    // Fetch the spec from the source URL
    const fetchResponse = await fetch(spec.source_url, {
      headers: { 'Accept': 'application/json, application/yaml, text/yaml, */*' },
    });

    if (!fetchResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch from URL: ${fetchResponse.status}` }, { status: 502 });
    }

    const specText = await fetchResponse.text();

    // Parse the spec
    const parseResult = await parseOpenAPISpec(specText, spec.server_name);
    if (!parseResult.success || !parseResult.tools) {
      return NextResponse.json({ error: parseResult.error || 'Failed to parse spec' }, { status: 400 });
    }

    // Update the spec record
    await supabase
      .from('rest_api_specs')
      .update({
        swagger_spec: parseResult.spec,
        raw_spec: specText,
        openapi_version: parseResult.apiInfo?.openapiVersion,
        api_title: parseResult.apiInfo?.title,
        api_description: parseResult.apiInfo?.description,
        api_version: parseResult.apiInfo?.version,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', specId);

    // Get existing environments
    // Get existing environments for this spec to update tools per environment
    const { data: environmentsData } = await supabase
      .from('environments')
      .select('*')
      .eq('spec_id', specId);

    const environments = (environmentsData || []) as Array<{ id: string; name: string; host: string }>;

    const validCategories: ToolCategory[] = ['Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'];

    // Update/create tools for each environment (matching original import pattern)
    let toolCount = 0;
    for (const env of environments) {
      for (const tool of parseResult.tools) {
        const toolName = generateToolName(env.name, spec.server_name, tool.operationId, tool.httpMethod);

        const toolTags = tool.tags || [];
        const mappedCategories = toolTags.filter(tag => validCategories.includes(tag as ToolCategory));
        const categories = mappedCategories.length > 0 ? mappedCategories : ['Utilities'];
        const primaryCategory = (categories[0] as ToolCategory) || 'Utilities';

        const toolInsert: ToolInsert = {
          name: toolName,
          description: tool.description,
          category: primaryCategory,
          categories: categories,
          tool_type: 'REST',
          has_widget: tool.hasWidget ?? false,
          invoking_message: `Calling ${tool.httpMethod} ${tool.path}...`,
          invoked_message: 'API call complete',
          input_schema: tool.inputSchema,
          output_schema: tool.outputSchema,
          user_id: userId,
        };

        const { data: toolData, error: toolError } = await supabase
          .from('tools')
          .upsert(toolInsert as never, { onConflict: 'name' })
          .select()
          .single();

        if (toolError) continue;

        const toolId = (toolData as { id: string }).id;

        // Update endpoint (no environment_id - endpoints are per spec, not per environment)
        const endpointInsert: RestApiEndpointInsert = {
          spec_id: specId,
          tool_id: toolId,
          operation_id: tool.operationId,
          http_method: tool.httpMethod,
          path: tool.path,
          headers: tool.headers,
          request_content_type: tool.requestContentType,
          response_content_type: tool.responseContentType,
          path_params: tool.pathParams,
          query_params: tool.queryParams,
        };

        await supabase
          .from('rest_api_endpoints')
          .upsert(endpointInsert as never, { onConflict: 'spec_id,operation_id' });

        toolCount++;
      }
    }

    return NextResponse.json({
      success: true,
      toolCount,
      message: `Refreshed ${toolCount} tools from source URL`,
    });
  } catch (error) {
    console.error('Error reimporting spec:', error);
    return NextResponse.json({ error: 'Failed to reimport' }, { status: 500 });
  }
}

