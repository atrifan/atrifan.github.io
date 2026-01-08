import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateToolName } from '@/src/lib/openapi-parser';
import type { ExtractedTool } from '@/src/lib/openapi-parser';
import type { ToolInsert, RestApiSpecInsert, RestApiEndpointInsert, EnvironmentInsert, ToolCategory } from '@/src/types/supabase';

interface ImportRequest {
  serverName: string;
  specFormat: 'json' | 'yaml';
  spec: Record<string, unknown>;
  rawSpec?: string;
  sourceUrl?: string;
  importMethod?: 'paste' | 'url';
  apiInfo: {
    title: string;
    description: string;
    version: string;
    openapiVersion: string;
  };
  tools: ExtractedTool[];
  environments: Array<{ name: string; host: string }>;
  category?: string;
}

/**
 * POST /api/swagger/import
 * Import OpenAPI/Swagger spec and create REST API tools
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body: ImportRequest = await request.json();
    const { serverName, specFormat, spec, rawSpec, sourceUrl, importMethod, apiInfo, tools, environments, category } = body;

    // Validate category against allowed values
    const validCategories: ToolCategory[] = ['Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'];
    const toolCategory: ToolCategory = category && validCategories.includes(category as ToolCategory)
      ? (category as ToolCategory)
      : 'Utilities';

    // Validate input
    if (!serverName || !spec || !tools || !environments) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (tools.length === 0) {
      return NextResponse.json({ error: 'No tools to import' }, { status: 400 });
    }

    if (environments.length === 0) {
      return NextResponse.json({ error: 'At least one environment is required' }, { status: 400 });
    }

    // 1. Create or update REST API spec
    const specInsert: RestApiSpecInsert = {
      user_id: userId,
      server_name: serverName,
      swagger_spec: spec,
      spec_format: specFormat,
      openapi_version: apiInfo.openapiVersion,
      api_title: apiInfo.title,
      api_description: apiInfo.description,
      api_version: apiInfo.version,
      default_headers: {},
      auth_type: 'none',
      auth_config: {},
      source_url: sourceUrl,
      raw_spec: rawSpec,
      import_method: importMethod || 'paste',
    };
    
    const { data: specData, error: specError } = await supabase
      .from('rest_api_specs')
      .upsert(specInsert as never, { onConflict: 'user_id,server_name' })
      .select()
      .single();

    if (specError) {
      console.error('Error creating spec:', specError);
      return NextResponse.json({ error: 'Failed to save specification' }, { status: 500 });
    }

    const specId = (specData as { id: string }).id;

    // 2. Create or update environments (just store them, don't link to MCP server)
    const environmentIds: Record<string, string> = {};
    
    for (const env of environments) {
      const envInsert: EnvironmentInsert = {
        user_id: userId,
        name: `${serverName}-${env.name}`,
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
        continue;
      }

      environmentIds[env.name] = (envData as { id: string }).id;
    }
    
    // 3. Create tools for each environment
    let toolCount = 0;
    const createdTools: string[] = [];
    
    for (const env of environments) {
      const envId = environmentIds[env.name];
      if (!envId) continue;
      
      for (const tool of tools) {
        const toolName = generateToolName(env.name, serverName, tool.operationId);

        // Determine categories from tags or fallback to selected category
        const toolTags = tool.tags || [];
        // Map tags to valid categories, filter out invalid ones
        const mappedCategories = toolTags.filter(tag =>
          validCategories.includes(tag as ToolCategory)
        );
        // Use mapped categories if any, otherwise use selected category
        const categories = mappedCategories.length > 0
          ? mappedCategories
          : [toolCategory];
        // Primary category is first one
        const primaryCategory = (categories[0] as ToolCategory) || toolCategory;

        // Create tool definition
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
        
        if (toolError) {
          console.error('Error creating tool:', toolError);
          continue;
        }

        const toolId = (toolData as { id: string }).id;

        // Create endpoint record
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
          header_params: tool.headerParams,
        };
        
        const { error: endpointError } = await supabase
          .from('rest_api_endpoints')
          .upsert(endpointInsert as never, { onConflict: 'spec_id,operation_id' })
          .select()
          .single();

        if (endpointError) {
          console.error('Error creating endpoint:', endpointError);
          continue;
        }

        // Tools are created but NOT linked to any MCP server yet
        // They will be composed into MCP servers later via the MCP Composer
        toolCount++;
        createdTools.push(toolName);
      }
    }
    
    return NextResponse.json({
      success: true,
      specId,
      toolCount,
      tools: createdTools,
    });
  } catch (error) {
    console.error('Swagger import error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

