import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApiKeyByHash, hashApiKey } from '@/src/lib/supabase-services';
import { clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/ai/automations/[id]/hook/[apiKey]
 * Webhook endpoint to trigger an automation run
 * 
 * Path params:
 * - id: Automation ID
 * - apiKey: User's API key for authentication
 * 
 * Body: { inputs?: Record<string, unknown> }
 * 
 * Used for:
 * - External webhook triggers
 * - Manual runs (from UI with internal call)
 * - Cron triggers (Vercel Cron with CRON_SECRET)
 * - Internal automation-to-automation triggers
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; apiKey: string }> }
) {
  try {
    const { id: automationId, apiKey } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for internal call (bypasses API key validation)
    const isInternalCall = request.headers.get('x-internal-call') === 'true';
    const cronSecret = request.headers.get('x-cron-secret');
    const isCronCall = cronSecret === process.env.CRON_SECRET && process.env.CRON_SECRET;

    let userId: string | null = null;

    if (isInternalCall || isCronCall) {
      // Internal/cron calls - get user from automation directly
      const { data: automation } = await supabase
        .from('automations')
        .select('user_id')
        .eq('id', automationId)
        .single();
      
      if (!automation) {
        return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
      }
      userId = automation.user_id;
    } else {
      // External call - validate API key
      const keyHash = hashApiKey(apiKey);
      const apiKeyRecord = await getApiKeyByHash(keyHash);

      if (!apiKeyRecord) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }

      if (!apiKeyRecord.is_active) {
        return NextResponse.json({ error: 'API key has been revoked' }, { status: 401 });
      }

      // If Clerk provider, also verify with Clerk
      if (apiKeyRecord.provider === 'clerk' && useClerkApiKeys()) {
        try {
          const client = await clerkClient();
          const clerkKey = await client.apiKeys.verify(apiKey);
          if (!clerkKey || clerkKey.revoked || clerkKey.expired) {
            return NextResponse.json({ error: 'API key has been revoked or expired' }, { status: 401 });
          }
        } catch {
          return NextResponse.json({ error: 'API key verification failed' }, { status: 401 });
        }
      }

      userId = apiKeyRecord.user_id;
    }

    // Fetch the automation and verify ownership
    const { data: automation, error: fetchError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !automation) {
      return NextResponse.json({ error: 'Automation not found or access denied' }, { status: 404 });
    }

    // Parse body
    let body: { inputs?: Record<string, unknown> } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK for automations without required inputs
    }

    const inputs = body.inputs || {};
    const triggerType = isCronCall ? 'cron' : isInternalCall ? 'automation' : 'webhook';

    // Check for missing required inputs
    const requiredInputs = automation.required_inputs || {};
    const missingInputs: Array<{ name: string; type: string; description: string }> = [];

    for (const [fieldName, config] of Object.entries(requiredInputs)) {
      const inputConfig = config as { value?: unknown; human_input?: boolean; type?: string; description?: string };
      if (inputConfig.human_input && !(fieldName in inputs)) {
        missingInputs.push({
          name: fieldName,
          type: inputConfig.type || 'string',
          description: inputConfig.description || '',
        });
      }
    }

    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('automation_executions')
      .insert({
        automation_id: automationId,
        user_id: userId,
        status: missingInputs.length > 0 ? 'waiting_input' : 'running',
        trigger_type: triggerType,
        collected_inputs: inputs,
        pending_inputs: missingInputs,
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
      message: missingInputs.length > 0 
        ? `Execution started - waiting for ${missingInputs.length} input(s)`
        : `Execution started via ${triggerType}`,
      status: 'started',
    });

    // If missing inputs, create human request
    if (missingInputs.length > 0) {
      const inputUrl = `/automation/${automationId}/running/${execution.id}/input`;

      await supabase.from('automation_human_requests').insert({
        execution_id: execution.id,
        automation_id: automationId,
        user_id: userId,
        request_type: 'input',
        message: `Automation "${automation.display_name || automation.name}" requires your input`,
        required_fields: missingInputs,
        input_url: inputUrl,
        notification_channels: automation.notification_config?.channels || ['email'],
      });

      // Send notification via configured channels
      const channels = automation.notification_config?.channels || ['email'];
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const notificationMessage = `Automation "${automation.display_name || automation.name}" requires your input`;

      // Build full URL with query params
      const fullInputUrl = new URL(inputUrl, baseUrl);
      fullInputUrl.searchParams.set('message', notificationMessage);

      // Get user email for email notifications
      let userEmail: string | null = null;
      if (channels.includes('email')) {
        try {
          const clerk = await clerkClient();
          const user = await clerk.users.getUser(userId);
          userEmail = user.emailAddresses?.[0]?.emailAddress || null;
        } catch (e) {
          console.error('Failed to get user email:', e);
        }
      }

      // Send push notification
      if (channels.includes('push')) {
        try {
          await fetch(`${baseUrl}/api/push/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({
              userId,
              title: '🤖 Input Required',
              body: notificationMessage,
              data: {
                url: fullInputUrl.toString(),
                type: 'automation',
                automationId,
                executionId: execution.id,
              },
              requireInteraction: true,
            }),
          });
        } catch (e) {
          console.error('Failed to send push notification:', e);
        }
      }

      // Send email notification
      if (channels.includes('email') && userEmail) {
        try {
          const fieldList = missingInputs.map((f: string) => `• ${f}`).join('\n');
          const emailBody = `
Hello,

${notificationMessage}

Required inputs:
${fieldList}

Click here to provide input:
${fullInputUrl.toString()}

- Tulzo Automation
          `.trim();

          await fetch(`${baseUrl}/api/email/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
              'X-User-Id': userId,
            },
            body: JSON.stringify({
              to: userEmail,
              subject: `🤖 Input Required: ${automation.display_name || automation.name}`,
              body: emailBody,
            }),
          });
        } catch (e) {
          console.error('Failed to send email notification:', e);
        }
      }

      return NextResponse.json({
        execution_id: execution.id,
        status: 'waiting_input',
        message: 'Automation requires input before proceeding',
        input_url: inputUrl,
        missing_inputs: missingInputs,
      });
    }

    // TODO: Actually execute the automation steps
    // For now, mark as completed immediately
    await supabase
      .from('automation_executions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', execution.id);

    return NextResponse.json({
      execution_id: execution.id,
      status: 'running',
      message: 'Automation triggered successfully',
    });
  } catch (error) {
    console.error('Webhook hook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

