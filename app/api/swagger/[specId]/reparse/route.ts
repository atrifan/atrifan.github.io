/**
 * Re-parse OpenAPI Spec and Update Endpoints
 * 
 * POST /api/swagger/[specId]/reparse
 * When user edits raw spec, re-parse and update endpoints/tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { parseOpenAPISpec, generateToolName } from '@/src/lib/openapi-parser';
import type { RestApiSpecRow, ToolInsert, RestApiEndpointInsert, ToolCategory } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ specId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { specId } = await params;
    const body = await request.json();
    const { rawSpec, format } = body as { rawSpec: string; format?: 'json' | 'yaml' };

    if (!rawSpec) {
      return NextResponse.json({ error: 'rawSpec is required' }, { status: 400 });
    }

    // Get existing spec
    const { data: existingSpec, error: specError } = await supabase
      .from('rest_api_specs')
      .select('*')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (specError || !existingSpec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    const spec = existingSpec as RestApiSpecRow;

    // Parse the new spec
    const parseResult = await parseOpenAPISpec(rawSpec, spec.server_name, format);
    
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error || 'Failed to parse spec' }, { status: 400 });
    }

    const { apiInfo, tools, environments } = parseResult;

    // Get existing endpoints to preserve custom edits where possible
    const { data: existingEndpoints } = await supabase
      .from('rest_api_endpoints')
      .select('*, tools(*)')
      .eq('spec_id', specId);

    const existingByOpId = new Map(
      (existingEndpoints || []).map(e => [(e as { operation_id: string }).operation_id, e])
    );

    // Update spec metadata
    await supabase
      .from('rest_api_specs')
      .update({
        swagger_spec: parseResult.spec,
        raw_spec: rawSpec,
        spec_format: format || spec.spec_format,
        openapi_version: apiInfo?.openapiVersion,
        api_title: apiInfo?.title,
        api_description: apiInfo?.description,
        api_version: apiInfo?.version,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', specId);

    // Track stats
    let created = 0;
    let updated = 0;
    let deleted = 0;

    // Process tools from new spec
    const newOpIds = new Set<string>();
    
    for (const tool of tools || []) {
      newOpIds.add(tool.operationId);
      const existing = existingByOpId.get(tool.operationId) as { tool_id: string; tools?: { id: string; name: string; description: string; category: string; has_widget: boolean } } | undefined;
      
      if (existing) {
        // Update existing - preserve custom name/description if user edited them
        const existingTool = existing.tools;
        const toolUpdates: Record<string, unknown> = {
          input_schema: tool.inputSchema,
          output_schema: tool.outputSchema,
          updated_at: new Date().toISOString(),
        };
        
        // Only update name/description if they match the auto-generated ones
        const autoName = generateToolName('', spec.server_name, tool.operationId, tool.httpMethod);
        if (existingTool?.name === autoName || !existingTool?.name) {
          toolUpdates.name = tool.name;
        }
        if (!existingTool?.description || existingTool.description === '') {
          toolUpdates.description = tool.description;
        }
        
        await supabase.from('tools').update(toolUpdates as never).eq('id', existing.tool_id);
        
        // Update endpoint
        await supabase.from('rest_api_endpoints').update({
          http_method: tool.httpMethod,
          path: tool.path,
          headers: tool.headers,
          request_content_type: tool.requestContentType,
          response_content_type: tool.responseContentType,
          path_params: tool.pathParams,
          query_params: tool.queryParams,
          header_params: tool.headerParams,
          updated_at: new Date().toISOString(),
        } as never).eq('spec_id', specId).eq('operation_id', tool.operationId);
        
        updated++;
      } else {
        // Create new tool and endpoint
        const toolInsert: ToolInsert = {
          name: tool.name,
          description: tool.description,
          category: (tool.tags[0] as ToolCategory) || 'Utilities',
          tool_type: 'REST',
          input_schema: tool.inputSchema,
          output_schema: tool.outputSchema,
          has_widget: tool.hasWidget,
        };
        
        const { data: newTool, error: toolError } = await supabase
          .from('tools')
          .insert(toolInsert as never)
          .select()
          .single();
        
        if (toolError || !newTool) continue;
        
        const endpointInsert: RestApiEndpointInsert = {
          spec_id: specId,
          tool_id: (newTool as { id: string }).id,
          operation_id: tool.operationId,
          http_method: tool.httpMethod,
          path: tool.path,
          headers: tool.headers,
          request_content_type: tool.requestContentType,
          response_content_type: tool.responseContentType,
          path_params: tool.pathParams,
          query_params: tool.queryParams,
          header_params: tool.headerParams,
        };
        
        await supabase.from('rest_api_endpoints').insert(endpointInsert as never);
        created++;
      }
    }

    // Delete endpoints that no longer exist in spec
    for (const [opId, endpoint] of existingByOpId) {
      if (!newOpIds.has(opId)) {
        const ep = endpoint as { id: string; tool_id: string };
        await supabase.from('rest_api_endpoints').delete().eq('id', ep.id);
        await supabase.from('tools').delete().eq('id', ep.tool_id);
        deleted++;
      }
    }

    return NextResponse.json({
      success: true,
      stats: { created, updated, deleted },
      apiInfo,
    });
  } catch (error) {
    console.error('Error reparsing spec:', error);
    return NextResponse.json({ error: 'Failed to reparse spec' }, { status: 500 });
  }
}

