/**
 * Check if a server name already exists for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const serverName = request.nextUrl.searchParams.get('serverName');
    
    if (!serverName) {
      return NextResponse.json({ error: 'serverName is required' }, { status: 400 });
    }
    
    // Check if this server name already exists for the user
    const { data: existingSpec, error } = await supabase
      .from('rest_api_specs')
      .select('id, api_title, created_at')
      .eq('user_id', userId)
      .eq('server_name', serverName)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking server name:', error);
      return NextResponse.json({ error: 'Failed to check server name' }, { status: 500 });
    }
    
    if (existingSpec) {
      const spec = existingSpec as { id: string; api_title: string; created_at: string };

      // Get endpoint count for this spec
      const { count } = await supabase
        .from('rest_api_endpoints')
        .select('*', { count: 'exact', head: true })
        .eq('spec_id', spec.id);

      return NextResponse.json({
        exists: true,
        spec: {
          id: spec.id,
          apiTitle: spec.api_title,
          createdAt: spec.created_at,
          endpointCount: count || 0,
        },
      });
    }
    
    return NextResponse.json({ exists: false });
    
  } catch (error) {
    console.error('Error in check-name:', error);
    return NextResponse.json(
      { error: `Failed to check: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

