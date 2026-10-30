import { auth, clerkClient } from '@clerk/nextjs/server';
import { RelayError, unauthorized } from './http';

export type Principal = { userId: string; deviceId: string };
export type Viewer = { userId: string; sessionId: string };

export async function currentSession(userId: string, sessionId: string): Promise<void> {
  try {
    const session = await (await clerkClient()).sessions.getSession(sessionId);
    if (session.id !== sessionId || session.userId !== userId || session.status !== 'active') unauthorized();
  } catch (error) {
    if (error instanceof RelayError) throw error;
    unauthorized();
  }
}

export async function viewerAuth(): Promise<Viewer> {
  const { userId, sessionId } = await auth();
  if (!userId || !sessionId) return unauthorized();
  await currentSession(userId, sessionId);
  return { userId, sessionId };
}

export async function ownedDevice(userId: string, deviceId: string): Promise<Principal> {
  const { getApiKeyById } = await import('../supabase-services');
  const key = await getApiKeyById(deviceId);
  if (!key || key.user_id !== userId || !key.is_active || key.revoked_at) throw new RelayError(404, 'device_not_found');
  if (key.plan !== 'pro' && key.plan !== 'plus') throw new RelayError(403, 'plan_required');
  return { userId, deviceId: key.id };
}

export async function deviceAuth(request: Request): Promise<Principal> {
  const match = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i);
  if (!match) return unauthorized();
  const { getApiKeyByHash, hashApiKey } = await import('../supabase-services');
  const key = await getApiKeyByHash(hashApiKey(match[1]));
  if (!key || !key.is_active || key.revoked_at) return unauthorized();
  if (key.plan !== 'pro' && key.plan !== 'plus') throw new RelayError(403, 'plan_required');
  return { userId: key.user_id, deviceId: key.id };
}
