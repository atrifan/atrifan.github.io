import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getApiKeyById, deleteApiKey } from '@/src/lib/supabase-services';

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const keyId = body.keyId;

    if (!keyId) {
      return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    const apiKey = await getApiKeyById(keyId);

    if (!apiKey || apiKey.user_id !== userId) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (apiKey.provider === 'clerk') {
      try {
        const client = await clerkClient();
        const existingKeys = await client.apiKeys.list({ subject: userId });
        for (const key of existingKeys.data) {
          if (key.name === `Device: ${apiKey.device_name}`) {
            try { await client.apiKeys.delete(key.id); } catch {}
            break;
          }
        }
      } catch (e) {
        console.error('Error deleting Clerk API key:', e);
      }
    }

    await deleteApiKey(apiKey.id);

    return NextResponse.json({
      success: true,
      message: 'Device removed successfully',
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}
