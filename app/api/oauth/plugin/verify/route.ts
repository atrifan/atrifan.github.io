import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Verify an API key is valid and return the user's plan + quotas.
 * Called by native-host on startup and periodically.
 *
 * Headers:
 * - Authorization: Bearer <api_key>
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const supabase = getSupabase();

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('user_id, plan, is_active, provider')
    .eq('api_key_hash', apiKeyHash)
    .eq('is_active', true)
    .single();

  if (error || !keyRecord) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }

  if (keyRecord.plan === 'free') {
    return NextResponse.json({
      valid: false,
      error: 'plan_required',
      message: 'Upgrade to Pro or Plus to use the plugin',
      plan: 'free',
    }, { status: 403 });
  }

  await supabase.from('api_usage_log').insert({
    user_id: keyRecord.user_id,
    event_type: 'verify',
    created_at: new Date().toISOString(),
  }).then(() => {});

  return NextResponse.json({
    valid: true,
    plan: keyRecord.plan,
    user_id: keyRecord.user_id,
    limits: {
      requests_per_hour: keyRecord.plan === 'plus' ? 500 : 100,
      concurrent_sessions: keyRecord.plan === 'plus' ? -1 : 5,
      scheduled_tasks: keyRecord.plan === 'plus' ? -1 : 10,
    },
  });
}
