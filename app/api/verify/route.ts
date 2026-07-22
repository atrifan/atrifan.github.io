import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyByHash, hashApiKey } from '@/src/lib/supabase-services';
import { touchDevicePresence } from '@/src/lib/chat-relay-service';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const apiKey = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!apiKey) {
    return NextResponse.json({ valid: false, error: 'Missing API key' }, { status: 401 });
  }

  try {
    const keyHash = hashApiKey(apiKey);
    const record = await getApiKeyByHash(keyHash);

    if (!record) {
      return NextResponse.json({ valid: false, error: 'API key not found' });
    }

    if (!record.is_active) {
      const reason = record.plan === 'free' ? 'subscription_expired' : 'revoked';
      return NextResponse.json({ valid: false, error: reason });
    }

    if (record.plan === 'free') {
      return NextResponse.json({ valid: false, error: 'free_plan' });
    }

    // Coarse presence: the device verifies hourly, so this keeps the control
    // panel's "reachable" status alive between real relay polls.
    await touchDevicePresence(record.id, record.user_id, record.device_name);

    return NextResponse.json({ valid: true, plan: record.plan });
  } catch {
    return NextResponse.json({ valid: false, error: 'verification_error' }, { status: 500 });
  }
}
