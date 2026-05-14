import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/src/lib/supabase';
import { upsertDeviceHeartbeat, getApiKeyByHash } from '@/src/lib/supabase-services';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const keyRecord = await getApiKeyByHash(apiKeyHash);
  if (!keyRecord) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || undefined;

  await upsertDeviceHeartbeat(
    keyRecord.id,
    keyRecord.user_id,
    keyRecord.device_name,
    {
      hostname: body.hostname || undefined,
      platform: body.platform || undefined,
      arch: body.arch || undefined,
      model: body.model || undefined,
      extension_id: body.extension_id || undefined,
      tokens_today_input: body.tokens_today?.input || 0,
      tokens_today_output: body.tokens_today?.output || 0,
      schedules_count: body.schedules_count || 0,
      active_tasks_count: body.active_tasks || 0,
      skills_loaded: body.skills_loaded || 0,
      mcp_servers_connected: body.mcp_servers || 0,
      ip_address: ip,
    }
  );

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq('id', keyRecord.id);

  return NextResponse.json({ ok: true });
}
