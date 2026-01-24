import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateExecutionAccess } from '@/src/lib/automation/auth';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * PUT /api/ai/automations/[id]/executions/[runId]/variables
 * Update variables on a running execution (for wait_for step polling)
 *
 * Auth: Clerk session OR API key (Bearer token or X-API-Key header)
 *
 * Body: { variables: Record<string, unknown> }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id: automationId, runId } = await params;

    // Validate access
    const authResult = await validateExecutionAccess(request, automationId, runId);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode || 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body
    const body = await request.json();
    const { variables } = body as { variables: Record<string, unknown> };

    if (!variables || typeof variables !== 'object') {
      return NextResponse.json({ error: 'Invalid variables object' }, { status: 400 });
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

    // Allow updates for running, paused, or waiting_input executions
    const allowedStatuses = ['running', 'paused', 'waiting_input'];
    if (!allowedStatuses.includes(execution.status)) {
      return NextResponse.json({ 
        error: `Cannot update variables for execution with status: ${execution.status}` 
      }, { status: 400 });
    }

    // Merge variables with existing context
    const existingContext = execution.context || {};
    const existingVariables = existingContext.variables || {};
    const updatedVariables = { ...existingVariables, ...variables };
    const updatedContext = { ...existingContext, variables: updatedVariables };

    // Update execution
    const { error: updateError } = await supabase
      .from('automation_executions')
      .update({
        context: updatedContext,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    if (updateError) {
      console.error('Failed to update execution variables:', updateError);
      return NextResponse.json({ error: 'Failed to update variables' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Variables updated successfully',
      execution: {
        id: runId,
        automation_id: automationId,
        status: execution.status,
        variables: updatedVariables,
      },
    });
  } catch (error) {
    console.error('Update variables error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/automations/[id]/executions/[runId]/variables
 * Get current variables for an execution
 *
 * Auth: Clerk session OR API key (Bearer token or X-API-Key header)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  try {
    const { id: automationId, runId } = await params;

    // Validate access
    const authResult = await validateExecutionAccess(request, automationId, runId);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode || 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch execution
    const { data: execution, error: fetchError } = await supabase
      .from('automation_executions')
      .select('id, automation_id, status, context')
      .eq('id', runId)
      .eq('automation_id', automationId)
      .single();

    if (fetchError || !execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    const variables = execution.context?.variables || {};

    return NextResponse.json({
      execution: {
        id: runId,
        automation_id: automationId,
        status: execution.status,
        variables,
      },
    });
  } catch (error) {
    console.error('Get variables error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

