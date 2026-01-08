/**
 * REST API Endpoint Management API
 * 
 * PATCH /api/swagger/endpoints/[endpointId] - Update endpoint (headers, content types)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ endpointId: string }>;
}

// GET - Fetch endpoint details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpointId } = await params;

    // Get endpoint with spec for ownership check
    const { data: endpoint } = await supabase
      .from('rest_api_endpoints')
      .select('*, rest_api_specs!inner(user_id)')
      .eq('id', endpointId)
      .single();

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    // Verify ownership
    const specData = (endpoint as { rest_api_specs: { user_id: string } }).rest_api_specs;
    if (specData.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Return endpoint data (excluding the joined spec data)
    const { rest_api_specs: _, ...endpointData } = endpoint as { rest_api_specs: unknown } & Record<string, unknown>;

    return NextResponse.json({ endpoint: endpointData });
  } catch (error) {
    console.error('Error fetching endpoint:', error);
    return NextResponse.json({ error: 'Failed to fetch endpoint' }, { status: 500 });
  }
}

// PATCH - Update endpoint
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpointId } = await params;
    const body = await request.json();
    const { headers, requestContentType, responseContentType } = body;

    // Get endpoint and verify ownership through spec
    const { data: endpoint } = await supabase
      .from('rest_api_endpoints')
      .select('id, spec_id')
      .eq('id', endpointId)
      .single();

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    // Verify spec ownership
    const { data: spec } = await supabase
      .from('rest_api_specs')
      .select('id, user_id')
      .eq('id', (endpoint as { spec_id: string }).spec_id)
      .single();

    if (!spec || (spec as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (headers !== undefined) updates.headers = headers;
    if (requestContentType !== undefined) updates.request_content_type = requestContentType;
    if (responseContentType !== undefined) updates.response_content_type = responseContentType;

    const { error } = await supabase
      .from('rest_api_endpoints')
      .update(updates as never)
      .eq('id', endpointId);

    if (error) {
      console.error('Error updating endpoint:', error);
      return NextResponse.json({ error: 'Failed to update endpoint' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating endpoint:', error);
    return NextResponse.json({ error: 'Failed to update endpoint' }, { status: 500 });
  }
}

