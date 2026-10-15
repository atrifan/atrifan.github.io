import { NextRequest, NextResponse } from 'next/server';
import { serviceSupabase } from '@/src/lib/service-supabase';
import { authenticatePluginKey } from '@/src/lib/plugin-auth';
import { MODELS_URL } from '@/src/lib/models/catalog';

/**
 * Returns the user's full config: plan, quotas, guardrails, and any
 * RAG-stored rules/knowledge that the native-host needs to operate.
 *
 * Called by native-host after initial auth verify, and periodically to refresh.
 *
 * Headers:
 * - Authorization: Bearer <api_key>
 */
export async function GET(req: NextRequest) {
  const supabase = serviceSupabase();
  const auth = await authenticatePluginKey(req, supabase);
  if (auth instanceof NextResponse) return auth;
  const keyRecord = { user_id: auth.userId };
  // Super has the Plus quotas (it had none before: quotas['super'] was undefined).
  const plan: 'pro' | 'plus' = auth.plan === 'pro' ? 'pro' : 'plus';

  // Plan-based quotas
  const quotas = {
    pro: {
      requests_per_hour: 100,
      concurrent_sessions: 5,
      scheduled_tasks: 10,
      skill_storage_mb: 50,
      max_page_actions_per_task: 200,
    },
    plus: {
      requests_per_hour: 500,
      concurrent_sessions: -1,
      scheduled_tasks: -1,
      skill_storage_mb: 500,
      max_page_actions_per_task: -1,
    },
  };

  // Guardrails — stored rules the native-host must enforce
  // These could come from a guardrails table or RAG in the future
  const guardrails = {
    blocked_domains: [
      '*.gov',
      '*.mil',
      'bank*',
    ],
    require_confirmation_for: [
      'payment',
      'delete',
      'transfer',
      'send_money',
    ],
    max_retries_per_step: 3,
    timeout_per_action_ms: 30000,
    allow_file_download: plan === 'plus',
    allow_screenshot_capture: true,
    allow_form_submission: true,
    allow_login_automation: true,
  };

  // Fetch user-specific guardrails from RAG if they exist
  const { data: ragRules } = await supabase
    .from('user_rags')
    .select('id, name, description')
    .eq('user_id', keyRecord.user_id)
    .eq('name', 'guardrails')
    .single();

  let customRules: string[] = [];
  if (ragRules) {
    // Fetch the actual guardrail documents
    const { data: docs } = await supabase
      .from('rag_documents')
      .select('content')
      .eq('rag_id', ragRules.id)
      .order('created_at', { ascending: true })
      .limit(20);

    if (docs) {
      customRules = docs.map(d => d.content);
    }
  }

  // Log this config fetch
  await supabase.from('api_usage_log').insert({
    user_id: keyRecord.user_id,
    event_type: 'config_fetch',
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    plan: auth.plan,
    quotas: quotas[plan],
    models_url: MODELS_URL,
    guardrails,
    custom_rules: customRules,
    user_id: keyRecord.user_id,
  });
}
