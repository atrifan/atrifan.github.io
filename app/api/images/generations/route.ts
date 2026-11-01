import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  chatBillingMarkup,
  generateImage,
  imageCostForModel,
  resolveGenerationCost,
} from '@/src/lib/ai-gateway';
import { imageGenerationModelPrice, modelNotAllowedBody } from '@/src/lib/models/catalog';
import { MISCONFIGURED } from '@/src/lib/misconfigured';

export const runtime = 'edge';

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getSupabase() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

async function validateClerkToken(apiKey: string): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const res = await fetch('https://api.clerk.com/v1/debug', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { userId: data.user_id, sessionId: data.session_id };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.AI_GATEWAY_API_KEY || !process.env.STORAGE_SUPABASE_URL || !process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, MISCONFIGURED);
  }

  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return json(401, { error: 'Missing x-api-key header' });
  }

  const supabase = getSupabase();
  let userId: string;
  let sessionId: string;
  let apiKeyId: string | null = null;

  if (apiKey.startsWith('ak_')) {
    const hash = await sha256Hex(apiKey);
    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key_hash', hash)
      .single();

    if (!keyRecord) {
      return json(401, { error: 'Invalid API key' });
    }

    if (keyRecord.purpose === 'qa_review') {
      return json(403, { error: 'QA review keys only work on /api/chat.', code: 'review_key_chat_only' });
    }

    if (!keyRecord.is_active) {
      const msg = keyRecord.plan === 'free'
        ? 'Your subscription has expired. Re-subscribe at tulzo.online/pricing to reactivate your API key.'
        : 'API key has been revoked. Please generate a new one from your dashboard.';
      return json(403, { error: msg });
    }

    userId = keyRecord.user_id;
    sessionId = keyRecord.id;
    apiKeyId = keyRecord.id;
  } else {
    const authResult = await validateClerkToken(apiKey);
    if (!authResult) {
      return json(401, { error: 'Unauthorized' });
    }

    userId = authResult.userId;
    sessionId = authResult.sessionId;

    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('id')
      .eq('api_key', apiKey)
      .eq('user_id', userId)
      .maybeSingle();
    apiKeyId = keyRecord?.id || null;
  }

  const { data: budget } = await supabase
    .from('user_budgets')
    .select('remaining_balance, status')
    .eq('user_id', userId)
    .single();

  if (!budget || budget.remaining_balance <= 0 || budget.status !== 'active') {
    return json(402, { error: 'Insufficient balance' });
  }

  const body = await request.json() as Record<string, unknown>;
  const {
    model,
    prompt,
    stream,
    n,
    size,
    response_format,
    quality,
    background,
    moderation,
    output_format,
    output_compression,
    providerOptions,
  } = body;

  if (stream === true) {
    return json(400, { error: 'Image generations are non-streaming JSON only.' });
  }

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return json(400, { error: 'Invalid request body: prompt required' });
  }

  if (typeof model !== 'string') {
    return json(400, modelNotAllowedBody(String(model)));
  }

  const price = await imageGenerationModelPrice(model);
  if (!price) {
    return json(400, modelNotAllowedBody(model));
  }

  const result = await generateImage({
    model,
    prompt,
    ...(typeof n === 'number' ? { n } : {}),
    ...(typeof size === 'string' ? { size } : {}),
    ...(response_format === 'b64_json' || response_format === 'url' ? { response_format } : {}),
    ...(typeof quality === 'string' ? { quality } : {}),
    ...(typeof background === 'string' ? { background } : {}),
    ...(typeof moderation === 'string' ? { moderation } : {}),
    ...(typeof output_format === 'string' ? { output_format } : {}),
    ...(typeof output_compression === 'number' ? { output_compression } : {}),
    ...(providerOptions && typeof providerOptions === 'object' ? { providerOptions: providerOptions as Record<string, unknown> } : {}),
  }, userId, sessionId);

  const markup = chatBillingMarkup();
  const estimated = await imageCostForModel(model, typeof n === 'number' ? n : 1).catch(() => 0);
  const finalCost = round6((await resolveGenerationCost(result.generationId, estimated)) * markup);

  await supabase.rpc('deduct_user_balance', {
    target_user_id: userId,
    amount: finalCost,
  });

  await supabase.from('paid_usage_analytics').insert({
    user_id: userId,
    device_session_id: sessionId,
    api_key_id: apiKeyId,
    provider: model.split('/')[0] || 'unknown',
    model_name: model,
    tokens_used: 0,
    cost_deducted: finalCost,
  });

  return new Response(JSON.stringify({ created: result.created, data: result.data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
