import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAutomationAccess } from '@/src/lib/automation/auth';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/[name]/logs
 * Fetch logs for an automation (most recent execution)
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

    // Get the most recent execution
    const { data: execution, error: execError } = await supabase
      .from('automation_executions')
      .select('*')
      .eq('automation_id', automationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (execError && execError.code !== 'PGRST116') {
      console.error('Failed to fetch execution:', execError);
      return NextResponse.json({ error: 'Failed to fetch execution' }, { status: 500 });
    }

    if (!execution) {
      return NextResponse.json({
        execution: null,
        logs: [],
      });
    }

    // Fetch logs for this execution
    const { data: logs, error: logsError } = await supabase
      .from('automation_logs')
      .select('*')
      .eq('execution_id', execution.id)
      .order('timestamp', { ascending: true });

    if (logsError) {
      console.error('Failed to fetch logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    return NextResponse.json({
      execution,
      logs: logs || [],
    });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

