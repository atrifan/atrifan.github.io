import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePlan, type PlanKey } from '@/src/lib/plans';

export interface PluginKey {
  userId: string;
  plan: Exclude<PlanKey, 'free'>;
}

/**
 * Bearer API-key auth for the native host's routes (/api/plugin/config, /api/models): an active
 * key by SHA-256 hash; 401 when missing, unknown or revoked; 403 plan_required on the free plan.
 */
export async function authenticatePluginKey(req: NextRequest, supabase: SupabaseClient): Promise<PluginKey | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }
  const apiKeyHash = crypto.createHash('sha256').update(authHeader.slice(7)).digest('hex');
  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('user_id, plan, is_active')
    .eq('api_key_hash', apiKeyHash)
    .eq('is_active', true)
    .single();
  if (error || !keyRecord || !keyRecord.is_active) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }
  const plan = normalizePlan(keyRecord.plan);
  if (plan === 'free') {
    return NextResponse.json({ error: 'plan_required' }, { status: 403 });
  }
  return { userId: keyRecord.user_id as string, plan };
}
