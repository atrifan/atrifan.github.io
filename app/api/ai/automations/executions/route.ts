import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/executions
 * Fetch executions for the current user
 * 
 * Query params:
 * - status: comma-separated list of statuses to filter (e.g., "running,waiting_input")
 * - automation_id: filter by specific automation
 * - limit: max number of results (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    
    const statusFilter = searchParams.get('status');
    const automationId = searchParams.get('automation_id');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Build query
    let query = supabase
      .from('automation_executions')
      .select(`
        id,
        automation_id,
        status,
        trigger_type,
        current_step,
        pending_inputs,
        error,
        started_at,
        completed_at,
        created_at,
        automations:automation_id (
          name,
          display_name
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (statusFilter) {
      const statuses = statusFilter.split(',').map(s => s.trim());
      query = query.in('status', statuses);
    }

    if (automationId) {
      query = query.eq('automation_id', automationId);
    }

    const { data: executions, error } = await query;

    if (error) {
      console.error('Failed to fetch executions:', error);
      return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 });
    }

    // Transform to include automation name
    const transformed = (executions || []).map(exec => {
      const automation = exec.automations as { name?: string; display_name?: string } | null;
      return {
        id: exec.id,
        automation_id: exec.automation_id,
        automation_name: automation?.name || 'unknown',  // Normalized name for API calls
        automation_display_name: automation?.display_name || automation?.name || 'Unknown',  // For display
        status: exec.status,
        trigger_type: exec.trigger_type,
        current_step: exec.current_step,
        pending_inputs: exec.pending_inputs,
        error: exec.error,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        created_at: exec.created_at,
      };
    });

    return NextResponse.json({ executions: transformed });
  } catch (error) {
    console.error('Executions GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

