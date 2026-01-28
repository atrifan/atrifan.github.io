import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateExecutionAccess } from '@/src/lib/automation/auth';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/[name]/executions/[runId]/logs
 * Fetch logs for a specific execution
 *
 * Auth: Clerk session OR API key (Bearer token or X-API-Key header)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; runId: string }> }
) {
  console.log('[logs/route] GET request received');
  try {
    const { name: automationName, runId } = await params;
    console.log('[logs/route] Params:', { automationName, runId });

    // Validate access and get automation ID
    const authResult = await validateExecutionAccess(request, automationName, runId);
    console.log('[logs/route] Auth result:', { error: authResult.error, statusCode: authResult.statusCode, hasAutomationId: !!authResult.automationId });
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode || 401 });
    }

    const automationId = authResult.automationId!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch execution
    const { data: execution, error: execError } = await supabase
      .from('automation_executions')
      .select('id, status, current_step, error, started_at, completed_at')
      .eq('id', runId)
      .eq('automation_id', automationId)
      .single();

    if (execError || !execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    // Fetch logs
    const { data: logs, error: logsError } = await supabase
      .from('automation_logs')
      .select('id, timestamp, level, step_id, step_name, message, status, duration_ms, data')
      .eq('execution_id', runId)
      .order('timestamp', { ascending: true });

    if (logsError) {
      console.error('Failed to fetch logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    console.log('[logs/route] Returning success with', logs?.length || 0, 'logs');
    return NextResponse.json({
      execution: {
        id: execution.id,
        status: execution.status,
        current_step: execution.current_step,
        error: execution.error,
        started_at: execution.started_at,
        completed_at: execution.completed_at,
      },
      logs: logs || [],
    });
  } catch (error) {
    console.error('[logs/route] Catch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

