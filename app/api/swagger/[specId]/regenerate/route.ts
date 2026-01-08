/**
 * Regenerate OpenAPI Spec from Database State
 * 
 * POST /api/swagger/[specId]/regenerate
 * Rebuilds the swagger_spec and raw_spec from current endpoints/tools/environments
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { regenerateOpenAPISpec, type EndpointWithTool } from '@/src/lib/openapi-regenerator';
import type { RestApiSpecRow, EnvironmentRow } from '@/src/types/supabase';

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

    // Get spec
    const { data: spec, error: specError } = await supabase
      .from('rest_api_specs')
      .select('*')
      .eq('id', specId)
      .eq('user_id', userId)
      .single();

    if (specError || !spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Get endpoints with tools
    const { data: endpoints, error: endpointsError } = await supabase
      .from('rest_api_endpoints')
      .select('*, tools(*)')
      .eq('spec_id', specId);

    if (endpointsError) {
      console.error('Error fetching endpoints:', endpointsError);
      return NextResponse.json({ error: 'Failed to fetch endpoints' }, { status: 500 });
    }

    // Get environments for this spec's server
    const { data: environments } = await supabase
      .from('environments')
      .select('*')
      .eq('user_id', userId)
      .eq('server_name', (spec as RestApiSpecRow).server_name);

    // Regenerate spec
    const regenerated = regenerateOpenAPISpec({
      spec: spec as RestApiSpecRow,
      endpoints: (endpoints || []) as EndpointWithTool[],
      environments: (environments || []) as EnvironmentRow[],
    });

    // Update spec in database
    const { error: updateError } = await supabase
      .from('rest_api_specs')
      .update({
        swagger_spec: regenerated.json,
        raw_spec: regenerated.raw,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', specId);

    if (updateError) {
      console.error('Error updating spec:', updateError);
      return NextResponse.json({ error: 'Failed to update spec' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      spec: regenerated.json,
      raw: regenerated.raw,
      format: (spec as RestApiSpecRow).spec_format,
    });
  } catch (error) {
    console.error('Error regenerating spec:', error);
    return NextResponse.json({ error: 'Failed to regenerate spec' }, { status: 500 });
  }
}

