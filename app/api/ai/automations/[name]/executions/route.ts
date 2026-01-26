import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAutomationAccess } from '@/src/lib/automation/auth';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/[name]/executions
 * List all executions for an automation with status, logs count, etc.
 *
 * Auth: Clerk session OR API key (Bearer token or X-API-Key header)
 *
 * Query params:
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 * - status: filter by status (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: automationName } = await params;

    // Validate access and get automation ID
    const authResult = await validateAutomationAccess(request, automationName);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode || 401 });
    }

    const automationId = authResult.automationId!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const statusFilter = searchParams.get('status');

    // Get automation details
    const { data: automation } = await supabase
      .from('automations')
      .select('id, name, display_name')
      .eq('id', automationId)
      .single();

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from('automation_executions')
      .select(`
        id,
        automation_id,
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
    let humanRequests: Record<string, { input_url: string; required_fields: unknown[] }> = {};

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

      // Get pending human requests (for input_url with query params)
      const { data: requests } = await supabase
        .from('automation_human_requests')
        .select('execution_id, input_url, required_fields')
        .in('execution_id', executionIds)
        .is('responded_at', null);

      if (requests) {
        humanRequests = requests.reduce((acc, req) => {
          acc[req.execution_id] = {
            input_url: req.input_url,
            required_fields: req.required_fields || [],
          };
          return acc;
        }, {} as Record<string, { input_url: string; required_fields: unknown[] }>);
      }
    }

    // Format response - include automation_name for frontend API calls
    const formattedExecutions = executions?.map(exec => ({
      id: exec.id,
      automation_id: exec.automation_id,
      automation_name: automation.name,  // Include name for API calls
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
      input_url: humanRequests[exec.id]?.input_url || null,
      required_fields: humanRequests[exec.id]?.required_fields || [],
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

