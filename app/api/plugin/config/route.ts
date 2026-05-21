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
 * Returns the user's full config: plan, quotas, guardrails, and any
 * RAG-stored rules/knowledge that the native-host needs to operate.
 *
 * Called by native-host after initial auth verify, and periodically to refresh.
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

  // Validate key and get user
  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('user_id, plan, is_active')
    .eq('api_key_hash', apiKeyHash)
    .eq('is_active', true)
    .single();

  if (error || !keyRecord) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }

  if (keyRecord.plan === 'free') {
    return NextResponse.json({ error: 'plan_required' }, { status: 403 });
  }

  const plan = keyRecord.plan as 'pro' | 'plus';

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

  // Fetch user's installed MCP servers from marketplace
  let mcpServers: any[] = [];
  const { data: mcpInstalls } = await supabase
    .from('user_mcp_installs')
    .select('package_id, packages(id, name, config_json)')
    .eq('user_id', keyRecord.user_id);

  if (mcpInstalls) {
    mcpServers = mcpInstalls
      .filter((row: any) => row.packages?.config_json)
      .map((row: any) => ({
        id: `marketplace__${row.packages.id}`,
        name: row.packages.name,
        ...row.packages.config_json,
      }));
  }

  // Log this config fetch
  await supabase.from('api_usage_log').insert({
    user_id: keyRecord.user_id,
    event_type: 'config_fetch',
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    plan,
    quotas: quotas[plan],
    guardrails,
    custom_rules: customRules,
    user_id: keyRecord.user_id,
    mcp_servers: mcpServers,
  });
}
