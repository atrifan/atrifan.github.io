import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateToolName } from '@/src/lib/openapi-parser';
import type { ExtractedTool } from '@/src/lib/openapi-parser';
import type { ToolInsert, RestApiSpecInsert, RestApiEndpointInsert, EnvironmentInsert, ToolCategory } from '@/src/types/supabase';

interface OAuth2ConfigInput {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string;
  useDcr: boolean;
  clientId: string;
  clientSecret: string;
  registrationEndpoint: string;
}

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
  defaultHeaders?: Record<string, string>;
  authType?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  oauth2Config?: OAuth2ConfigInput;
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
    const { serverName, specFormat, spec, rawSpec, sourceUrl, importMethod, apiInfo, tools, environments, category, defaultHeaders, authType, oauth2Config } = body;

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

    // Build auth config based on auth type
    const authConfig: Record<string, unknown> = {};
    if (authType === 'api_key' && defaultHeaders?.['x-api-key']) {
      authConfig.header_name = 'x-api-key';
    } else if (authType === 'oauth2' && oauth2Config) {
      // Store OAuth2 configuration with snake_case keys for database consistency
      authConfig.authorization_endpoint = oauth2Config.authorizationEndpoint;
      authConfig.token_endpoint = oauth2Config.tokenEndpoint;
      authConfig.scopes = oauth2Config.scopes;
      authConfig.use_dcr = oauth2Config.useDcr;
      authConfig.client_id = oauth2Config.clientId;
      authConfig.client_secret = oauth2Config.clientSecret;
      authConfig.registration_endpoint = oauth2Config.registrationEndpoint;
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
      default_headers: defaultHeaders || {},
      auth_type: authType || 'none',
      auth_config: authConfig,
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

    // 2. Create or update environments for THIS spec only
    // Check via junction table if env already exists for this spec, don't share across specs
    const environmentIds: Record<string, string> = {};

    for (const env of environments) {
      // Check if this spec already has an environment with this name
      const { data: existingLink } = await supabase
        .from('rest_api_environments')
        .select('environment_id, environments!inner(id, name)')
        .eq('spec_id', specId)
        .eq('environments.name', env.name)
        .single();

      let envId: string;

      if (existingLink) {
        // Update existing environment for this spec
        envId = (existingLink as { environment_id: string }).environment_id;
        await supabase
          .from('environments')
          .update({ host: env.host } as never)
          .eq('id', envId);
      } else {
        // Create new environment (use unique name to avoid collision)
        const uniqueEnvName = `${serverName}-${env.name}-${Date.now()}`;
        const envInsert: EnvironmentInsert = {
          user_id: userId,
          name: uniqueEnvName,
          host: env.host,
          custom_config: {},
        };

        const { data: envData, error: envError } = await supabase
          .from('environments')
          .insert(envInsert as never)
          .select()
          .single();

        if (envError || !envData) {
          console.error('Error creating environment:', envError);
          continue;
        }

        envId = (envData as { id: string }).id;
      }

      environmentIds[env.name] = envId;
    }

    // 3. Link environments to spec via junction table
    for (const envId of Object.values(environmentIds)) {
      await supabase
        .from('rest_api_environments')
        .upsert({ spec_id: specId, environment_id: envId } as never, { onConflict: 'spec_id,environment_id' });
    }

    // 4. Create tools for each environment
    let toolCount = 0;
    const createdTools: string[] = [];
    
    for (const env of environments) {
      const envId = environmentIds[env.name];
      if (!envId) continue;
      
      for (const tool of tools) {
        const toolName = generateToolName(env.name, serverName, tool.operationId, tool.httpMethod);

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

        // Determine annotations based on HTTP method
        const method = tool.httpMethod.toUpperCase();
        const isReadOnly = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        const isDestructive = method === 'DELETE' || method === 'PUT' || method === 'PATCH';

        // Create tool definition (with annotations)
        const toolInsertWithAnnotations: ToolInsert = {
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
          annotations: {
            readOnlyHint: isReadOnly,
            destructiveHint: isDestructive,
          },
          user_id: userId,
        };

        // Try with annotations first, fallback without if column doesn't exist
        let toolData;
        let toolError;

        ({ data: toolData, error: toolError } = await supabase
          .from('tools')
          .upsert(toolInsertWithAnnotations as never, { onConflict: 'name' })
          .select()
          .single());

        // If annotations column doesn't exist, retry without it
        if (toolError?.code === 'PGRST204' && toolError?.message?.includes('annotations')) {
          const { annotations: _annotations, ...toolInsertWithoutAnnotations } = toolInsertWithAnnotations;
          ({ data: toolData, error: toolError } = await supabase
            .from('tools')
            .upsert(toolInsertWithoutAnnotations as never, { onConflict: 'name' })
            .select()
            .single());
        }

        if (toolError || !toolData) {
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
        // They will be added to MCP servers later via the MCP Creator
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

