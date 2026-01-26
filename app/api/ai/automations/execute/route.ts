import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiKeyFromRequest } from '@/src/lib/automation/auth';
import { runRealExecution } from '@/src/lib/automation/runtime-executor';
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

    // Get user email for workflow context
    let userEmail: string | undefined;
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      userEmail = user.emailAddresses?.[0]?.emailAddress;
    } catch (e) {
      console.warn('Could not fetch user email:', e);
    }

    // Execute workflow with real MCP tool calls
    // NOTE: We await this to ensure it completes before Vercel terminates the function
    const result = await runRealExecution({
      userId,
      userEmail,
      automationId: dbAutomationId,
      automationName: automation.display_name || automation.name,
      executionId: execution.id,
      yamlDefinition: automation.yaml_definition,
      inputs: inputs || {},
      triggerType: triggerType as 'manual' | 'webhook' | 'cron' | 'cli' | 'automation',
      notificationChannels: automation.notification_config?.channels || ['email'],
    });

    return NextResponse.json({
      success: result.success,
      execution: {
        id: execution.id,
        automation_id: dbAutomationId,
        workflow_id: workflowId,
        status: result.status,
        trigger_type: triggerType,
        started_at: execution.started_at,
        output: result.output,
        error: result.error,
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

