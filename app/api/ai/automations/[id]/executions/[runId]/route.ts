import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateExecutionAccess } from '@/src/lib/automation/auth';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/[id]/executions/[runId]
 * Fetch a specific execution with its details
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
        context: execution.context,
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

/**
 * DELETE /api/ai/automations/[id]/executions/[runId]
 * Stop/cancel a running execution, optionally delete from DB
 *
 * Query params:
 * - hard=true: Also delete from DB (default: false, just cancels)
 *
 * Auth: Clerk session OR API key (Bearer token or X-API-Key header)
 */
export async function DELETE(
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

    // Check for hard delete
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get('hard') === 'true';

    // Fetch execution to check status
    const { data: execution, error: fetchError } = await supabase
      .from('automation_executions')
      .select('id, status')
      .eq('id', runId)
      .eq('automation_id', automationId)
      .single();

    if (fetchError || !execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    // For hard delete, just delete regardless of status
    if (hardDelete) {
      // Logs and human_requests will cascade delete
      const { error: deleteError } = await supabase
        .from('automation_executions')
        .delete()
        .eq('id', runId);

      if (deleteError) {
        console.error('Failed to delete execution:', deleteError);
        return NextResponse.json({ error: 'Failed to delete execution' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Execution deleted',
        deleted: true,
      });
    }

    // Soft delete (cancel) - only for running executions
    const cancellableStatuses = ['running', 'paused', 'waiting_input', 'pending'];
    if (!cancellableStatuses.includes(execution.status)) {
      return NextResponse.json({
        error: `Cannot cancel execution with status: ${execution.status}. Use ?hard=true to delete.`
      }, { status: 400 });
    }

    // Update execution status to cancelled
    const { error: updateError } = await supabase
      .from('automation_executions')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error: 'Execution cancelled by user',
      })
      .eq('id', runId);

    if (updateError) {
      console.error('Failed to cancel execution:', updateError);
      return NextResponse.json({ error: 'Failed to cancel execution' }, { status: 500 });
    }

    // Log the cancellation
    await supabase.from('automation_logs').insert({
      execution_id: runId,
      automation_id: automationId,
      level: 'info',
      message: 'Execution cancelled by user',
      data: { previous_status: execution.status },
    });

    return NextResponse.json({
      success: true,
      message: 'Execution cancelled',
      execution: {
        id: runId,
        automation_id: automationId,
        status: 'cancelled',
      },
    });
  } catch (error) {
    console.error('Cancel execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

