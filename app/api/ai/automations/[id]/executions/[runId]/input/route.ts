import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/ai/automations/[id]/executions/[runId]/input
 * Submit required inputs for a waiting execution
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id: automationId, runId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body
    const body = await request.json();
    const { inputs } = body as { inputs: Record<string, unknown> };

    if (!inputs || typeof inputs !== 'object') {
      return NextResponse.json({ error: 'Invalid inputs' }, { status: 400 });
    }

    // Fetch execution
    const { data: execution, error: fetchError } = await supabase
      .from('automation_executions')
      .select('*')
      .eq('id', runId)
      .eq('automation_id', automationId)
      .single();

    if (fetchError || !execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    if (execution.status !== 'waiting_input') {
      return NextResponse.json({ error: 'Execution is not waiting for input' }, { status: 400 });
    }

    // Validate all pending inputs are provided
    const pendingInputs = execution.pending_inputs || [];
    const missingFields: string[] = [];

    for (const field of pendingInputs) {
      if (!(field.name in inputs)) {
        missingFields.push(field.name);
      }
    }

    if (missingFields.length > 0) {
      return NextResponse.json({
        error: `Missing required fields: ${missingFields.join(', ')}`,
      }, { status: 400 });
    }

    // Merge inputs
    const collectedInputs = { ...execution.collected_inputs, ...inputs };

    // Update execution
    const { error: updateError } = await supabase
      .from('automation_executions')
      .update({
        status: 'running',
        collected_inputs: collectedInputs,
        pending_inputs: [],
      })
      .eq('id', runId);

    if (updateError) {
      console.error('Failed to update execution:', updateError);
      return NextResponse.json({ error: 'Failed to update execution' }, { status: 500 });
    }

    // Mark human request as responded
    await supabase
      .from('automation_human_requests')
      .update({
        responded_at: new Date().toISOString(),
        response: JSON.stringify(inputs),
      })
      .eq('execution_id', runId)
      .eq('request_type', 'input')
      .is('responded_at', null);

    // Log input received
    await supabase.from('automation_logs').insert({
      execution_id: runId,
      automation_id: automationId,
      level: 'info',
      message: `Input received for ${Object.keys(inputs).length} field(s) - resuming execution`,
      data: { fields: Object.keys(inputs) },
    });

    // TODO: Trigger workflow continuation here
    // In production, this would resume the workflow execution

    return NextResponse.json({
      success: true,
      message: 'Input received, execution resuming',
      execution: {
        id: runId,
        status: 'running',
        collected_inputs: collectedInputs,
      },
    });
  } catch (error) {
    console.error('Submit input error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

