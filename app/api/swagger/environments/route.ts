/**
 * REST API Environment Management API
 * 
 * POST /api/swagger/environments - Create a new environment for a spec
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateToolName } from '@/src/lib/openapi-parser';
import type { EnvironmentInsert, ToolInsert, ServerToolInsert } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

// POST - Create new environment and duplicate tools for it
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
      .from('rest_api_specs')
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

    // Get existing endpoints for this spec
    const { data: endpoints } = await supabase
      .from('rest_api_endpoints')
      .select('id, tool_id, operation_id, http_method, path')
      .eq('spec_id', specId);

    if (!endpoints || endpoints.length === 0) {
      return NextResponse.json({
        success: true,
        environmentId: envId,
        toolsCreated: 0,
        message: 'Environment created (no endpoints to create tools for)'
      });
    }

    // Fetch tool details for each endpoint
    const endpointsWithTools: Array<{
      id: string;
      tool_id: string;
      operation_id: string;
      http_method: string;
      path: string;
      tool?: {
        id: string;
        description: string;
        category: string;
        categories: string[];
        input_schema: Record<string, unknown>;
        output_schema: Record<string, unknown>;
        has_widget: boolean;
      };
    }> = [];

    for (const endpoint of endpoints as Array<{ id: string; tool_id: string; operation_id: string; http_method: string; path: string }>) {
      const { data: tool } = await supabase
        .from('tools')
        .select('id, description, category, categories, input_schema, output_schema, has_widget')
        .eq('id', endpoint.tool_id)
        .single();

      endpointsWithTools.push({
        ...endpoint,
        tool: tool ? (tool as typeof endpointsWithTools[0]['tool']) : undefined,
      });
    }

    // Get existing API key for this server (or user's default)
    let apiKeyId: string | null = null;

    // First try to find API key for this specific server
    const { data: serverApiKey } = await supabase
      .from('api_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('server_name', serverName)
      .eq('is_active', true)
      .single();

    if (serverApiKey) {
      apiKeyId = (serverApiKey as { id: string }).id;
    } else {
      // Fall back to user's default API key
      const { data: defaultApiKey } = await supabase
        .from('api_keys')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (defaultApiKey) {
        apiKeyId = (defaultApiKey as { id: string }).id;
      }
    }

    if (!apiKeyId) {
      return NextResponse.json({
        success: true,
        environmentId: envId,
        toolsCreated: 0,
        message: 'Environment created (no API key found to link tools)'
      });
    }

    // Create tools for this environment - one tool per endpoint
    let toolsCreated = 0;
    for (const endpoint of endpointsWithTools) {
      const existingTool = endpoint.tool;
      const operationId = endpoint.operation_id;
      const httpMethod = endpoint.http_method;
      const path = endpoint.path;

      // Generate tool name for this environment
      const toolName = generateToolName(name, serverName, operationId);

      // Get tool properties from existing tool or use defaults
      const description = existingTool?.description || `${httpMethod} ${path}`;
      const category = existingTool?.category || 'Utilities';
      const categories = existingTool?.categories || ['Utilities'];
      const inputSchema = existingTool?.input_schema || {};
      const outputSchema = existingTool?.output_schema || {};
      const hasWidget = existingTool?.has_widget || false;

      const toolInsert: ToolInsert = {
        name: toolName,
        description: description || '',
        category: category as 'Utilities',
        categories: categories,
        tool_type: 'REST',
        input_schema: inputSchema || {},
        output_schema: outputSchema || {},
        has_widget: hasWidget || false,
        invoking_message: `Calling ${httpMethod} ${path}...`,
        invoked_message: 'API call complete',
        user_id: userId,
      };

      const { data: newTool, error: toolError } = await supabase
        .from('tools')
        .upsert(toolInsert as never, { onConflict: 'name' })
        .select()
        .single();

      if (toolError || !newTool) {
        console.error('Error creating tool:', toolError);
        continue;
      }

      const toolId = (newTool as { id: string }).id;

      // Link to server with environment
      const serverToolInsert: ServerToolInsert = {
        api_key_id: apiKeyId,
        tool_id: toolId,
        environment_id: envId,
        is_enabled: true,
      };

      const { error: serverToolError } = await supabase
        .from('server_tools')
        .upsert(serverToolInsert as never, { onConflict: 'api_key_id,tool_id' });

      if (serverToolError) {
        console.error('Error linking tool to server:', serverToolError);
      }

      toolsCreated++;
    }

    return NextResponse.json({ 
      success: true, 
      environmentId: envId,
      toolsCreated,
    });
  } catch (error) {
    console.error('Error creating environment:', error);
    return NextResponse.json({ error: 'Failed to create environment' }, { status: 500 });
  }
}

