import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiKeyFromRequest } from '@/src/lib/automation/auth';
import * as yaml from 'yaml';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/ai/automations/execute
 * Start an automation execution
 *
 * Auth: Clerk session OR API key (Bearer token or X-API-Key header)
 *
 * Body:
 * - automationId: UUID of the automation (from database)
 * - automationName: OR the YAML id/name (snake_case) to look up
 * - inputs: Optional inputs to pass to the workflow
 * - triggerType: 'manual' | 'api' | 'cron' | 'webhook' (default: 'manual')
 *
 * The automation is looked up by:
 * 1. automationId (UUID) if provided
 * 2. automationName (YAML id) if automationId not provided
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try Clerk session first, then API key
    let userId: string | null = null;

    try {
      const { userId: clerkUserId } = await auth();
      userId = clerkUserId;
    } catch {
      // Clerk auth failed, try API key
    }

    if (!userId) {
      const apiKeyResult = await validateApiKeyFromRequest(request);
      if (apiKeyResult.error) {
        return NextResponse.json({ error: apiKeyResult.error }, { status: apiKeyResult.statusCode || 401 });
      }
      userId = apiKeyResult.userId;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { automationId, automationName, inputs, triggerType = 'manual' } = body;

    if (!automationId && !automationName) {
      return NextResponse.json({ error: 'automationId or automationName is required' }, { status: 400 });
    }

    // Fetch the automation by ID or by name (YAML id)
    let automation;

    if (automationId) {
      // Look up by UUID
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('id', automationId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
      }
      automation = data;
    } else {
      // Look up by name (YAML id) - check both 'name' column and parsed YAML id
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('user_id', userId)
        .eq('name', automationName)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: `Automation '${automationName}' not found` }, { status: 404 });
      }
      automation = data;
    }

    if (!automation.yaml_definition) {
      return NextResponse.json({ error: 'Automation has no YAML definition' }, { status: 400 });
    }

    // Parse YAML to get workflow id for logging
    let workflowId = automation.name;
    try {
      const parsed = yaml.parse(automation.yaml_definition);
      if (parsed.id) {
        workflowId = parsed.id;
      }
    } catch {
      // Use automation.name as fallback
    }

    // Use the database UUID as the automation_id
    const dbAutomationId = automation.id;

    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('automation_executions')
      .insert({
        automation_id: dbAutomationId,
        user_id: userId,
        status: 'running',
        trigger_type: triggerType,
        collected_inputs: inputs || {},
        pending_inputs: [],
        context: { workflowId }, // Store YAML id in context for reference
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
      automation_id: dbAutomationId,
      level: 'info',
      message: `Execution started for workflow: ${workflowId}`,
      status: 'started',
    });

    // TODO: In production, this would trigger the actual workflow execution
    // For now, we'll simulate a simple execution flow
    // The actual execution would be handled by a background worker or edge function

    // Simulate execution (for demo purposes)
    // In production, this would be replaced with actual workflow execution
    simulateExecution(supabase, execution.id, dbAutomationId, automation.yaml_definition);

    return NextResponse.json({
      success: true,
      execution: {
        id: execution.id,
        automation_id: dbAutomationId,
        workflow_id: workflowId,
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

