import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/ai/automations/execute
 * Start an automation execution
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { automationId, inputs, triggerType = 'manual' } = body;

    if (!automationId) {
      return NextResponse.json({ error: 'automationId is required' }, { status: 400 });
    }

    // Fetch the automation
    const { data: automation, error: fetchError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    if (!automation.yaml_definition) {
      return NextResponse.json({ error: 'Automation has no YAML definition' }, { status: 400 });
    }

    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('automation_executions')
      .insert({
        automation_id: automationId,
        user_id: userId,
        status: 'running',
        trigger_type: triggerType,
        collected_inputs: inputs || {},
        pending_inputs: [],
        context: {},
      })
      .select()
      .single();

    if (execError) {
      console.error('Failed to create execution:', execError);
      return NextResponse.json({ error: 'Failed to create execution' }, { status: 500 });
    }

    // Log execution start
    await supabase.from('automation_logs').insert({
      execution_id: execution.id,
      automation_id: automationId,
      level: 'info',
      message: 'Execution started',
      status: 'started',
    });

    // TODO: In production, this would trigger the actual workflow execution
    // For now, we'll simulate a simple execution flow
    // The actual execution would be handled by a background worker or edge function

    // Simulate execution (for demo purposes)
    // In production, this would be replaced with actual workflow execution
    simulateExecution(supabase, execution.id, automationId, automation.yaml_definition);

    return NextResponse.json({
      success: true,
      execution: {
        id: execution.id,
        automation_id: automationId,
        status: 'running',
        trigger_type: triggerType,
        started_at: execution.started_at,
      },
    });
  } catch (error) {
    console.error('Execute automation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Simulate execution for demo purposes
 * In production, this would be replaced with actual workflow execution
 */
async function simulateExecution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  executionId: string,
  automationId: string,
  _yamlDefinition: string
) {
  // This runs in the background (fire and forget)
  // In production, use a proper queue/worker system

  const steps = ['Parsing workflow', 'Validating inputs', 'Executing steps', 'Completing'];

  for (let i = 0; i < steps.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    await supabase.from('automation_logs').insert({
      execution_id: executionId,
      automation_id: automationId,
      level: 'info',
      step_name: `Step ${i + 1}`,
      message: steps[i],
      status: i === steps.length - 1 ? 'completed' : 'started',
      duration_ms: Math.floor(Math.random() * 500) + 100,
    });
  }

  // Mark execution as completed
  await supabase
    .from('automation_executions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  await supabase.from('automation_logs').insert({
    execution_id: executionId,
    automation_id: automationId,
    level: 'info',
    message: 'Execution completed successfully',
    status: 'completed',
  });
}

