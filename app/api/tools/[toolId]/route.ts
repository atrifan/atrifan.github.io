/**
 * Single Tool API
 * 
 * GET /api/tools/[toolId] - Fetch a single tool by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ toolId: string }>;
}

// GET - Fetch single tool
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { toolId } = await params;

    // Get tool
    const { data: tool, error } = await supabase
      .from('tools')
      .select('*')
      .eq('id', toolId)
      .single();

    if (error || !tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    // Verify ownership (user_id can be null for system tools)
    const toolUserId = (tool as { user_id: string | null }).user_id;
    if (toolUserId && toolUserId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ tool });
  } catch (error) {
    console.error('Error fetching tool:', error);
    return NextResponse.json({ error: 'Failed to fetch tool' }, { status: 500 });
  }
}

