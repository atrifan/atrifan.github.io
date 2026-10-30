import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'owner' as string | null,
  sessionId: 'session' as string | null,
  plan: 'pro' as 'pro' | 'free',
  active: true,
  revoked: false,
  sessionStatus: 'active',
  fail: false,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: state.userId, sessionId: state.sessionId })),
  clerkClient: vi.fn(async () => ({ sessions: { getSession: async () => ({ id: state.sessionId, userId: state.userId, status: state.sessionStatus }) } })),
}));
vi.mock('@/src/lib/supabase-services', () => ({
  hashApiKey: (key: string) => key,
  getApiKeyByHash: vi.fn(async (key: string) => {
    if (state.fail) throw new Error('synthetic provider failure');
    return key === 'valid' ? { id: 'key', user_id: 'owner', is_active: state.active, revoked_at: state.revoked ? '2026-01-01' : null, plan: state.plan } : null;
  }),
  getApiKeysByUser: vi.fn(async () => {
    if (state.fail) throw new Error('synthetic provider failure');
    return [{ id: 'key', user_id: 'owner', is_active: state.active, revoked_at: state.revoked ? '2026-01-01' : null, plan: state.plan }];
  }),
}));

import { GET as messages } from '@/app/api/plugin/chat/sessions/[id]/messages/route';
import { POST as send } from '@/app/api/plugin/chat/send/route';
import { GET as poll } from '@/app/api/plugin/chat/poll/route';

const req = (authorization?: string) => new Request('https://app.invalid/api/plugin/chat', {
  headers: authorization ? { authorization } : {},
});

beforeEach(() => {
  state.userId = 'owner'; state.sessionId = 'session'; state.plan = 'pro'; state.active = true; state.revoked = false; state.sessionStatus = 'active'; state.fail = false;
});

describe('legacy cutover security', () => {
  it('does not fall back to Clerk for a malformed Authorization header', async () => {
    const response = await messages(req('Basic not-a-device-key') as never, { params: Promise.resolve({ id: 'ignored' }) });
    expect(response.status).toBe(401);
  });

  it('rejects free device keys and revoked keys without consuming a request body', async () => {
    state.plan = 'free';
    expect((await poll(req('Bearer valid') as never)).status).toBe(403);
    state.active = false;
    expect((await poll(req('Bearer valid') as never)).status).toBe(401);
    state.active = true; state.revoked = true;
    expect((await poll(req('Bearer valid') as never)).status).toBe(401);
  });

  it('rejects a free viewer and a no-longer-active Clerk session', async () => {
    state.plan = 'free';
    expect((await send(req() as never)).status).toBe(403);
    state.plan = 'pro'; state.sessionStatus = 'revoked';
    expect((await send(req() as never)).status).toBe(401);
  });

  it('does not invoke durable relay operations or emit payloads on authenticated send', async () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const response = await send(new Request('https://app.invalid/api/plugin/chat/send', {
      method: 'POST', body: 'synthetic-sensitive-sentinel',
    }) as never);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'upgrade_required', protocol: 2 });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });

  it('fails closed without exposing provider failures', async () => {
    state.fail = true;
    const response = await poll(req('Bearer valid') as never);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'broker_unavailable' });
  });
});
