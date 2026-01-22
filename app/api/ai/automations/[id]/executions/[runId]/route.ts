import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/[id]/executions/[runId]
 * Fetch a specific execution with its details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id: automationId, runId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch execution with automation details
    const { data: execution, error } = await supabase
      .from('automation_executions')
      .select(`
        *,
        automations:automation_id (
          name,
          display_name,
          description
        )
      `)
      .eq('id', runId)
      .eq('automation_id', automationId)
      .single();

    if (error || !execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    return NextResponse.json({
      execution: {
        id: execution.id,
        automation_id: execution.automation_id,
        automation_name: execution.automations?.display_name || execution.automations?.name || 'Unknown',
        status: execution.status,
        trigger_type: execution.trigger_type,
        collected_inputs: execution.collected_inputs,
        pending_inputs: execution.pending_inputs,
        current_step: execution.current_step,
        error: execution.error,
        started_at: execution.started_at,
        completed_at: execution.completed_at,
      },
    });
  } catch (error) {
    console.error('Fetch execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

