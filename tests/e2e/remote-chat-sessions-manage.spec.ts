import { test, expect } from '@playwright/test';
import { TEST_RELAY_SESSION_ID, hasSupabaseEnv } from '../fixtures/seed';

// Fixtures are seeded once in tests/global-setup.ts — do not seed/clean per file.
// These tests describe relay-chat session-management routes that do not exist
// yet (TDD). They are expected to FAIL until the endpoints are built.
//
// Rename (PATCH), delete (DELETE), and the auto-title-on-first-message behavior
// are all Clerk-gated (owner-only). Clerk sessions are NOT wired into the test
// harness, so — exactly like remote-chat-relay.spec.ts's "Clerk-gated relay
// session routes" block — we can only assert UNAUTHENTICATED behavior (401 or a
// 3xx redirect) here. Authenticated coverage (200/400/404) needs Clerk test
// tokens — a followup (see testing rule).

const NONEXISTENT_SESSION_ID = '00000000-0000-4000-8000-0000deadbeef';

// ---------------------------------------------------------------------------
// PATCH /api/plugin/chat/sessions/[id] — rename a session (Clerk owner).
// Contract: { title } → 200 { session }; empty title → 400; not found/owned →
// 404; unauthenticated → 401 or redirect. Only the unauth contract is reachable.
// ---------------------------------------------------------------------------
test.describe('PATCH /api/plugin/chat/sessions/[id] (Clerk owner, unauthenticated only)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('rename with valid title without auth → 401 or redirect', async ({ request }) => {
    const res = await request.patch(
      `/api/plugin/chat/sessions/${TEST_RELAY_SESSION_ID}`,
      { data: { title: 'Renamed session' }, maxRedirects: 0 }
    );
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });

  test('rename with empty title without auth → 401 or redirect', async ({ request }) => {
    const res = await request.patch(
      `/api/plugin/chat/sessions/${TEST_RELAY_SESSION_ID}`,
      { data: { title: '' }, maxRedirects: 0 }
    );
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });

  test('rename a nonexistent session without auth → 401 or redirect', async ({ request }) => {
    const res = await request.patch(
      `/api/plugin/chat/sessions/${NONEXISTENT_SESSION_ID}`,
      { data: { title: 'Renamed session' }, maxRedirects: 0 }
    );
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/plugin/chat/sessions/[id] — delete a session + its messages/frames
// (Clerk owner). Contract: → 200 { ok: true }; not found/owned → 404;
// unauthenticated → 401 or redirect. Only the unauth contract is reachable.
// ---------------------------------------------------------------------------
test.describe('DELETE /api/plugin/chat/sessions/[id] (Clerk owner, unauthenticated only)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('delete an owned session without auth → 401 or redirect', async ({ request }) => {
    const res = await request.delete(
      `/api/plugin/chat/sessions/${TEST_RELAY_SESSION_ID}`,
      { maxRedirects: 0 }
    );
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });

  test('delete a nonexistent session without auth → 401 or redirect', async ({ request }) => {
    const res = await request.delete(
      `/api/plugin/chat/sessions/${NONEXISTENT_SESSION_ID}`,
      { maxRedirects: 0 }
    );
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/plugin/chat/send — the first SEND_MESSAGE frame on an untitled
// session auto-titles it from the message text (truncated to ~60 chars with an
// ellipsis). Clerk-gated, so only the unauthenticated contract is reachable.
// ---------------------------------------------------------------------------
test.describe('POST /api/plugin/chat/send auto-title (Clerk owner, unauthenticated only)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('first SEND_MESSAGE without auth → 401 or redirect', async ({ request }) => {
    const res = await request.post('/api/plugin/chat/send', {
      data: {
        session_id: TEST_RELAY_SESSION_ID,
        frame: { type: 'SEND_MESSAGE', text: 'What is the weather in Paris today?' },
      },
      maxRedirects: 0,
    });
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });

  test('first SEND_MESSAGE with a long text without auth → 401 or redirect', async ({ request }) => {
    const longText = 'A'.repeat(200);
    const res = await request.post('/api/plugin/chat/send', {
      data: {
        session_id: TEST_RELAY_SESSION_ID,
        frame: { type: 'SEND_MESSAGE', text: longText },
      },
      maxRedirects: 0,
    });
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });
});
