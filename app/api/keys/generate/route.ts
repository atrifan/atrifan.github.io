import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import {
  createApiKey,
  linkAllNativeToolsToServer,
  hashApiKey,
  getApiKeySuffix,
  getActiveDeviceCount,
  getApiKeyByUserServerDevice,
  DEVICE_LIMITS,
} from '@/src/lib/supabase-services';

function getUserPlanFromClaims(sessionClaims: Record<string, unknown> | null): 'free' | 'pro' | 'plus' {
  if (!sessionClaims) return 'free';
  const plaClaim = sessionClaims.pla as string | undefined;
  if (plaClaim) {
    if (plaClaim.includes(':')) {
      const plan = plaClaim.split(':')[1];
      if (plan === 'pro' || plan === 'plus' || plan === 'free') return plan;
    }
    if (plaClaim === 'pro' || plaClaim === 'plus' || plaClaim === 'free') return plaClaim;
  }
  return 'free';
}

export async function POST(request: NextRequest) {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plan = getUserPlanFromClaims(sessionClaims as Record<string, unknown> | null);

    const body = await request.json().catch(() => ({}));
    const deviceName: string = body.device_name || 'default';

    if (deviceName.length > 32) {
      return NextResponse.json({ error: 'Device name must be 32 characters or less' }, { status: 400 });
    }

    // Enforce plan device limit
    const currentCount = await getActiveDeviceCount(userId, 'default');
    const limit = DEVICE_LIMITS[plan] || 1;
    if (currentCount >= limit) {
      return NextResponse.json(
        { error: 'device_limit_reached', limit, current: currentCount },
        { status: 403 }
      );
    }

    // Check for duplicate device name
    const existing = await getApiKeyByUserServerDevice(userId, 'default', deviceName);
    if (existing) {
      return NextResponse.json(
        { error: 'device_name_exists', device_name: deviceName },
        { status: 409 }
      );
    }

    // Generate new API key
    let apiKeySecret: string;
    let provider: 'clerk' | 'custom' = 'clerk';

    if (useClerkApiKeys()) {
      const client = await clerkClient();
      // Clean up any existing revoked keys for this user to prevent conflicts
      try {
        const existingClerkKeys = await client.apiKeys.list({
          subject: userId,
          includeInvalid: true,
        });
        for (const key of existingClerkKeys.data) {
          if (key.revoked) {
            try { await client.apiKeys.delete(key.id); } catch {}
          }
        }
      } catch {}

      const apiKey = await client.apiKeys.create({
        name: `Device: ${deviceName}`,
        subject: userId,
        description: `API key for device ${deviceName}`,
        scopes: ['mcp:access'],
      });

      if (!apiKey.secret) {
        return NextResponse.json({ error: 'Failed to generate API key secret' }, { status: 500 });
      }
      apiKeySecret = apiKey.secret;
      provider = 'clerk';
    } else {
      const randomBytes = require('crypto').randomBytes(24);
      apiKeySecret = `ak_${randomBytes.toString('base64url').toUpperCase().slice(0, 32)}`;
      provider = 'custom';
    }

    const newApiKey = await createApiKey({
      user_id: userId,
      api_key_hash: hashApiKey(apiKeySecret),
      api_key_suffix: getApiKeySuffix(apiKeySecret),
      api_key: apiKeySecret,
      name: deviceName,
      device_name: deviceName,
      server_name: 'default',
      provider,
      plan,
    });

    await linkAllNativeToolsToServer(userId, 'default');

    return NextResponse.json({
      success: true,
      apiKey: apiKeySecret,
      apiKeyId: newApiKey.id,
      provider,
      plan,
      deviceName,
      createdAt: newApiKey.created_at,
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    return NextResponse.json({ error: 'Failed to generate API key' }, { status: 500 });
  }
}
