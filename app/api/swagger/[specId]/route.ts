/**
 * REST API Spec Management API
 * 
 * GET /api/swagger/[specId] - Get spec details
 * PATCH /api/swagger/[specId] - Update spec (server name, etc.)
 * DELETE /api/swagger/[specId] - Delete spec and all associated tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ specId: string }>;
}

// GET - Get spec details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { specId } = await params;

    const { data: spec, error } = await supabase
      .from('rest_api_specs')
      .select('*')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (error || !spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Get endpoints with tools
    const { data: endpoints } = await supabase
      .from('rest_api_endpoints')
      .select('*, tools(*)')
      .eq('spec_id', specId);

    // Get environments that belong to this spec (by server_name prefix)
    const serverName = (spec as { server_name: string }).server_name;
    const { data: environments } = await supabase
      .from('environments')
      .select('*')
      .eq('user_id', userId)
      .like('name', `${serverName}-%`);

    return NextResponse.json({
      spec,
      endpoints: endpoints || [],
      environments: environments || [],
    });
  } catch (error) {
    console.error('Error fetching spec:', error);
    return NextResponse.json({ error: 'Failed to fetch spec' }, { status: 500 });
  }
}

// PATCH - Update spec
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { specId } = await params;
    const body = await request.json();
    const { serverName, host, apiTitle, apiDescription, defaultHeaders, authType, authConfig } = body;

    // Verify ownership
    const { data: existingSpec } = await supabase
      .from('rest_api_specs')
      .select('id')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (!existingSpec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Update spec
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (serverName !== undefined) updates.server_name = serverName;
    if (host !== undefined) updates.host = host;
    if (apiTitle !== undefined) updates.api_title = apiTitle;
    if (apiDescription !== undefined) updates.api_description = apiDescription;
    if (defaultHeaders !== undefined) updates.default_headers = defaultHeaders;
    if (authType !== undefined) updates.auth_type = authType;
    if (authConfig !== undefined) updates.auth_config = authConfig;

    const { error } = await supabase
      .from('rest_api_specs')
      .update(updates as never)
      .eq('id', specId);

    if (error) {
      console.error('Error updating spec:', error);
      return NextResponse.json({ error: 'Failed to update spec' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating spec:', error);
    return NextResponse.json({ error: 'Failed to update spec' }, { status: 500 });
  }
}

// DELETE - Delete spec and all associated data
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { specId } = await params;

    // Verify ownership and get server_name
    const { data: existingSpec } = await supabase
      .from('rest_api_specs')
      .select('id, server_name')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (!existingSpec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    const serverName = (existingSpec as { server_name: string }).server_name;

    // Get all tool IDs associated with this spec (base tools from endpoints)
    const { data: endpoints } = await supabase
      .from('rest_api_endpoints')
      .select('tool_id')
      .eq('spec_id', specId);

    const baseToolIds = (endpoints || []).map(e => (e as { tool_id: string }).tool_id);

    // Get environments associated with this spec (by server_name prefix)
    const { data: environments } = await supabase
      .from('environments')
      .select('id')
      .eq('user_id', userId)
      .like('name', `${serverName}-%`);

    const envIds = (environments || []).map(e => (e as { id: string }).id);

    // Get all environment-specific tools
    let envToolIds: string[] = [];
    if (envIds.length > 0) {
      const { data: serverTools } = await supabase
        .from('server_tools')
        .select('tool_id')
        .in('environment_id', envIds);

      envToolIds = (serverTools || []).map(st => (st as { tool_id: string }).tool_id);

      // Delete server_tools entries for environments
      await supabase.from('server_tools').delete().in('environment_id', envIds);

      // Delete environments
      await supabase.from('environments').delete().in('id', envIds);
    }

    // Delete endpoints (cascade will handle this, but be explicit)
    await supabase.from('rest_api_endpoints').delete().eq('spec_id', specId);

    // Combine all tool IDs and delete them
    const allToolIds = [...new Set([...baseToolIds, ...envToolIds])];
    if (allToolIds.length > 0) {
      await supabase.from('tools').delete().in('id', allToolIds);
    }

    // Delete the spec
    const { error } = await supabase.from('rest_api_specs').delete().eq('id', specId);

    if (error) {
      console.error('Error deleting spec:', error);
      return NextResponse.json({ error: 'Failed to delete spec' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedTools: allToolIds.length,
      deletedEnvironments: envIds.length,
    });
  } catch (error) {
    console.error('Error deleting spec:', error);
    return NextResponse.json({ error: 'Failed to delete spec' }, { status: 500 });
  }
}

