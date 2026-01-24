import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/[id]/executions
 * List all executions for an automation with status, logs count, etc.
 * 
 * Query params:
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 * - status: filter by status (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: automationId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const statusFilter = searchParams.get('status');

    // Verify automation ownership
    const { data: automation, error: authError } = await supabase
      .from('automations')
      .select('id, name, display_name')
      .eq('id', automationId)
      .eq('user_id', userId)
      .single();

    if (authError || !automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from('automation_executions')
      .select(`
        id,
        status,
        trigger_type,
        current_step,
        error,
        started_at,
        completed_at,
        created_at,
        pending_inputs
      `, { count: 'exact' })
      .eq('automation_id', automationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: executions, error, count } = await query;

    if (error) {
      console.error('Failed to fetch executions:', error);
      return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 });
    }

    // Get log counts for each execution
    const executionIds = executions?.map(e => e.id) || [];
    let logCounts: Record<string, number> = {};

    if (executionIds.length > 0) {
      const { data: logs } = await supabase
        .from('automation_logs')
        .select('execution_id')
        .in('execution_id', executionIds);

      if (logs) {
        logCounts = logs.reduce((acc, log) => {
          acc[log.execution_id] = (acc[log.execution_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }
    }

    // Format response
    const formattedExecutions = executions?.map(exec => ({
      id: exec.id,
      status: exec.status,
      trigger_type: exec.trigger_type,
      current_step: exec.current_step,
      error: exec.error,
      started_at: exec.started_at,
      completed_at: exec.completed_at,
      created_at: exec.created_at,
      has_pending_inputs: Array.isArray(exec.pending_inputs) && exec.pending_inputs.length > 0,
      pending_inputs_count: Array.isArray(exec.pending_inputs) ? exec.pending_inputs.length : 0,
      log_count: logCounts[exec.id] || 0,
    })) || [];

    return NextResponse.json({
      automation: {
        id: automation.id,
        name: automation.display_name || automation.name,
      },
      executions: formattedExecutions,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('List executions error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

