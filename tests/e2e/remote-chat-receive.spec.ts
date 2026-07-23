import { test, expect } from '@playwright/test';
import { TEST_RELAY_SESSION_ID, hasSupabaseEnv } from '../fixtures/seed';

// Behavior-only contract for the PAGE receive route — the reliable HTTP path a
// Clerk-authed remote-chat page uses to pull the device's streamed `to_page`
// frames (STREAM_CHUNK / STREAM_DONE / …) by a monotonic seq cursor. It cannot
// use Supabase Realtime because the page holds no Supabase JWT (RLS blocks it).
//
//   GET /api/plugin/chat/receive?session_id=<id>&after=<seq|'latest'>
//   (Clerk session)
//   → { frames: [{ seq, frame }], cursor }
//
// This route is Clerk-gated. Without a Clerk session the harness can only assert
// the unauthenticated contract (401 JSON or an auth redirect) — the authorized
// streaming behavior is covered by the live/manual E2E, gated on
// E2E_CLERK_STORAGE_STATE like the other Clerk specs.
test.describe('GET /api/plugin/chat/receive (Clerk page route)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('unauthenticated → rejected (401 or auth redirect), never streams frames', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/receive?session_id=${TEST_RELAY_SESSION_ID}&after=0`,
      { maxRedirects: 0 }
    );
    // Either the handler returns 401, or Clerk redirects to sign-in — both are
    // "not authorized". What must NEVER happen is a 200 with frames for an
    // unauthenticated caller.
    const status = res.status();
    const rejected = status === 401 || status === 403 || (status >= 300 && status < 400);
    expect(rejected).toBe(true);
    if (status === 401) {
      const body = await res.json();
      expect(typeof body.error).toBe('string');
    }
  });

  test('unauthenticated prime request (after=latest) is also rejected', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/receive?session_id=${TEST_RELAY_SESSION_ID}&after=latest`,
      { maxRedirects: 0 }
    );
    const status = res.status();
    const rejected = status === 401 || status === 403 || (status >= 300 && status < 400);
    expect(rejected).toBe(true);
  });
});
