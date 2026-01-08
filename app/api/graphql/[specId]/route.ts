/**
 * GraphQL Spec Management API
 * 
 * GET /api/graphql/[specId] - Get spec details
 * PATCH /api/graphql/[specId] - Update spec (server name, title, etc.)
 * DELETE /api/graphql/[specId] - Delete spec and all associated tools
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
      .from('graphql_specs')
      .select('*')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (error || !spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Get operations with tools
    const { data: operations } = await supabase
      .from('graphql_operations')
      .select('*, tools(*)')
      .eq('spec_id', specId);

    // Get environments
    const { data: envLinks } = await supabase
      .from('graphql_environments')
      .select('environment_id')
      .eq('spec_id', specId);

    const environments: Array<{ id: string; name: string; host: string }> = [];
    for (const link of (envLinks || []) as Array<{ environment_id: string }>) {
      const { data: env } = await supabase
        .from('environments')
        .select('id, name, host')
        .eq('id', link.environment_id)
        .single();
      if (env) environments.push(env as { id: string; name: string; host: string });
    }

    return NextResponse.json({ spec, operations: operations || [], environments });
  } catch (error) {
    console.error('Error fetching GraphQL spec:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const { serverName, apiTitle, apiDescription, defaultHeaders, authType, authConfig } = body;

    // Verify ownership
    const { data: existing } = await supabase
      .from('graphql_specs')
      .select('id')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (serverName !== undefined) updates.server_name = serverName;
    if (apiTitle !== undefined) updates.api_title = apiTitle;
    if (apiDescription !== undefined) updates.api_description = apiDescription;
    if (defaultHeaders !== undefined) updates.default_headers = defaultHeaders;
    if (authType !== undefined) updates.auth_type = authType;
    if (authConfig !== undefined) updates.auth_config = authConfig;

    const { error } = await supabase
      .from('graphql_specs')
      .update(updates as never)
      .eq('id', specId);

    if (error) {
      console.error('Error updating spec:', error);
      return NextResponse.json({ error: 'Failed to update spec' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating GraphQL spec:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    // Verify ownership
    const { data: existing } = await supabase
      .from('graphql_specs')
      .select('id')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Get all tool IDs from operations
    const { data: operations } = await supabase
      .from('graphql_operations')
      .select('tool_id')
      .eq('spec_id', specId);

    const toolIds = (operations || []).map((op: { tool_id: string }) => op.tool_id);

    // Delete server_tools entries for these tools
    if (toolIds.length > 0) {
      await supabase.from('server_tools').delete().in('tool_id', toolIds);
    }

    // Delete graphql_environments links
    await supabase.from('graphql_environments').delete().eq('spec_id', specId);

    // Delete operations (will cascade delete due to FK)
    await supabase.from('graphql_operations').delete().eq('spec_id', specId);

    // Delete the spec
    const { error } = await supabase.from('graphql_specs').delete().eq('id', specId);

    if (error) {
      console.error('Error deleting spec:', error);
      return NextResponse.json({ error: 'Failed to delete spec' }, { status: 500 });
    }

    // Delete the tools
    if (toolIds.length > 0) {
      await supabase.from('tools').delete().in('id', toolIds);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting GraphQL spec:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

