import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/automations/cron
 *
 * Vercel Cron endpoint to trigger pending cron automations.
 *
 * Implementation notes:
 * - Runs every 10 minutes (configured in vercel.json, currently set to once a day for testing)
 * - Uses a 10-minute rolling window for cron matching
 * - Authenticates via CRON_SECRET header
 * - Calls the webhook endpoint for each pending automation (runs in user space via API key)
 * - If automation requires inputs, notification/email flow will handle unblocking
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate with CRON_SECRET
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('Cron: Unauthorized - invalid CRON_SECRET');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const results: { automationId: string; name: string; status: string; error?: string }[] = [];

    console.log(`[Cron] Starting automation cron check at ${now.toISOString()}`);

    // Query all active automations with cron trigger type
    // We check: trigger_config->>'type' = 'cron' AND status = 'active'
    const { data: cronAutomations, error: queryError } = await supabase
      .from('automations')
      .select('id, user_id, name, cron_expression, last_run_at, next_run_at, trigger_config, notification_config')
      .eq('status', 'active')
      .not('cron_expression', 'is', null);

    if (queryError) {
      console.error('[Cron] Error querying automations:', queryError);
      return NextResponse.json({ error: 'Database error', details: queryError.message }, { status: 500 });
    }

    if (!cronAutomations || cronAutomations.length === 0) {
      console.log('[Cron] No cron automations found');
      return NextResponse.json({ message: 'No cron automations to process', processed: 0 });
    }

    console.log(`[Cron] Found ${cronAutomations.length} cron automations to check`);

    // Process each automation
    for (const automation of cronAutomations) {
      try {
        // Check if automation should run based on cron expression and last_run_at
        const shouldRun = shouldAutomationRun(
          automation.cron_expression,
          automation.last_run_at,
          now
        );

        if (!shouldRun) {
          console.log(`[Cron] Skipping ${automation.name} - not due yet`);
          continue;
        }

        console.log(`[Cron] Triggering automation: ${automation.name} (${automation.id})`);

        // Get user's API key for webhook call
        const { data: apiKeyRecord } = await supabase
          .from('api_keys')
          .select('api_key')
          .eq('user_id', automation.user_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!apiKeyRecord?.api_key) {
          console.error(`[Cron] No API key found for user ${automation.user_id}`);
          results.push({
            automationId: automation.id,
            name: automation.name,
            status: 'error',
            error: 'No API key found for user',
          });
          continue;
        }

        // Call the webhook endpoint to trigger the automation
        const webhookUrl = `${getBaseUrl(request)}/api/ai/automations/${automation.name}/hook/${apiKeyRecord.api_key}`;

        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': process.env.CRON_SECRET || '',
          },
          body: JSON.stringify({ inputs: {} }),
        });

        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error(`[Cron] Webhook failed for ${automation.name}:`, errorText);
          results.push({
            automationId: automation.id,
            name: automation.name,
            status: 'error',
            error: `Webhook failed: ${webhookResponse.status}`,
          });
          continue;
        }

        // Update last_run_at and calculate next_run_at
        const nextRun = calculateNextRun(automation.cron_expression, now);
        await supabase
          .from('automations')
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRun?.toISOString() || null,
          })
          .eq('id', automation.id);

        results.push({
          automationId: automation.id,
          name: automation.name,
          status: 'triggered',
        });

        console.log(`[Cron] Successfully triggered ${automation.name}`);
      } catch (automationError) {
        console.error(`[Cron] Error processing automation ${automation.name}:`, automationError);
        results.push({
          automationId: automation.id,
          name: automation.name,
          status: 'error',
          error: automationError instanceof Error ? automationError.message : 'Unknown error',
        });
      }
    }

    console.log(`[Cron] Completed. Processed ${results.length} automations`);
    return NextResponse.json({
      message: 'Cron job completed',
      timestamp: now.toISOString(),
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Get the base URL for internal API calls
 */
function getBaseUrl(request: NextRequest): string {
  // In production, use the host header
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';

  if (host) {
    return `${protocol}://${host}`;
  }

  // Fallback to environment variable
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Check if an automation should run based on cron expression and last run time.
 * Uses a 10-minute rolling window to account for cron job execution frequency.
 *
 * @param cronExpression - 5-field cron expression (minute hour day month weekday)
 * @param lastRunAt - ISO timestamp of last run (null if never run)
 * @param now - Current time
 * @returns true if automation should run
 */
function shouldAutomationRun(
  cronExpression: string | null,
  lastRunAt: string | null,
  now: Date
): boolean {
  if (!cronExpression) return false;

  // Parse cron expression (5 fields: minute hour day month weekday)
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.error(`[Cron] Invalid cron expression: ${cronExpression}`);
    return false;
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = parts;

  // Check if current time matches the cron expression
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentWeekday = now.getDay(); // 0-6 (Sunday = 0)

  const matchesMinute = matchesCronField(minuteField, currentMinute, 0, 59);
  const matchesHour = matchesCronField(hourField, currentHour, 0, 23);
  const matchesDay = matchesCronField(dayField, currentDay, 1, 31);
  const matchesMonth = matchesCronField(monthField, currentMonth, 1, 12);
  const matchesWeekday = matchesCronField(weekdayField, currentWeekday, 0, 6);

  // For cron, day and weekday are OR'd (either can match)
  const matchesTime = matchesMinute && matchesHour && matchesMonth && (matchesDay || matchesWeekday);

  if (!matchesTime) {
    return false;
  }

  // Check if we already ran within the rolling window (10 minutes)
  if (lastRunAt) {
    const lastRun = new Date(lastRunAt);
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const timeSinceLastRun = now.getTime() - lastRun.getTime();

    if (timeSinceLastRun < windowMs) {
      // Already ran within the window
      return false;
    }
  }

  return true;
}

/**
 * Check if a value matches a cron field
 * Supports: *, specific values, ranges (1-5), lists (1,3,5), and steps (star/5)
 */
function matchesCronField(field: string, value: number, min: number, max: number): boolean {
  // Wildcard matches everything
  if (field === '*') return true;

  // Step values (*/5 means every 5)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // List of values (1,3,5)
  if (field.includes(',')) {
    const values = field.split(',').map(v => parseInt(v.trim(), 10));
    return values.includes(value);
  }

  // Range (1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(v => parseInt(v.trim(), 10));
    return value >= start && value <= end;
  }

  // Single value
  const singleValue = parseInt(field, 10);
  return !isNaN(singleValue) && singleValue === value;
}

/**
 * Calculate the next run time based on cron expression
 * This is a simplified implementation - for production, consider using a library like cron-parser
 */
function calculateNextRun(cronExpression: string | null, from: Date): Date | null {
  if (!cronExpression) return null;

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteField, hourField] = parts;

  // Simple implementation: find next occurrence
  // For complex cron expressions, this would need a proper cron parser
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);

  // If specific minute and hour, calculate next occurrence
  if (minuteField !== '*' && !minuteField.includes('/') && !minuteField.includes(',') && !minuteField.includes('-')) {
    const targetMinute = parseInt(minuteField, 10);

    if (hourField !== '*' && !hourField.includes('/') && !hourField.includes(',') && !hourField.includes('-')) {
      const targetHour = parseInt(hourField, 10);

      next.setHours(targetHour);
      next.setMinutes(targetMinute);

      // If this time has passed today, move to tomorrow
      if (next <= from) {
        next.setDate(next.getDate() + 1);
      }

      return next;
    }
  }

  // For complex expressions, just add 24 hours as a fallback
  next.setTime(from.getTime() + 24 * 60 * 60 * 1000);
  return next;
}
