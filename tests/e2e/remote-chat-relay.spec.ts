import { test, expect } from '@playwright/test';
import {
  TEST_PRO_KEY,
  TEST_RELAY_SESSION_ID,
  hasSupabaseEnv,
} from '../fixtures/seed';

// Fixtures are seeded once in tests/global-setup.ts — do not seed/clean per file.
// These tests describe the behavior of a remote chat relay whose routes do not
// exist yet (TDD). They are expected to FAIL until the endpoints are built.

const authHeader = { Authorization: `Bearer ${TEST_PRO_KEY}` };
const NONEXISTENT_SESSION_ID = '00000000-0000-4000-8000-0000deadbeef';

// ---------------------------------------------------------------------------
// Device-side routes — authenticate with the fixture Bearer API key (no Clerk).
// ---------------------------------------------------------------------------
test.describe('POST /api/plugin/chat/emit (device Bearer)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('no Authorization header → 401 with error string', async ({ request }) => {
    const res = await request.post('/api/plugin/chat/emit', {
      data: { session_id: TEST_RELAY_SESSION_ID, frame: { type: 'STREAM_CHUNK', text: 'hi' } },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  test('clearly-invalid Bearer key → 401', async ({ request }) => {
    const res = await request.post('/api/plugin/chat/emit', {
      headers: { Authorization: 'Bearer tlz_bogus' },
      data: { session_id: TEST_RELAY_SESSION_ID, frame: { type: 'STREAM_CHUNK', text: 'hi' } },
    });
    expect(res.status()).toBe(401);
  });

  test('valid key + session not owned → 403 or 404', async ({ request }) => {
    const res = await request.post('/api/plugin/chat/emit', {
      headers: authHeader,
      data: { session_id: NONEXISTENT_SESSION_ID, frame: { type: 'STREAM_CHUNK', text: 'hi' } },
    });
    expect([403, 404].includes(res.status())).toBe(true);
  });

  test('valid key + owned session + valid frame → 200 { ok: true }', async ({ request }) => {
    const res = await request.post('/api/plugin/chat/emit', {
      headers: authHeader,
      data: {
        session_id: TEST_RELAY_SESSION_ID,
        frame: { type: 'STREAM_CHUNK', text: 'hello' },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect.soft(body.ok).toBe(true);
  });

  test('terminal STREAM_DONE frame persists an assistant message', async ({ request }) => {
    const emit = await request.post('/api/plugin/chat/emit', {
      headers: authHeader,
      data: {
        session_id: TEST_RELAY_SESSION_ID,
        frame: {
          type: 'STREAM_DONE',
          message: { role: 'assistant', content: { text: 'final answer' } },
        },
      },
    });
    expect(emit.status()).toBe(200);
    const emitBody = await emit.json();
    expect.soft(emitBody.ok).toBe(true);

    const msgs = await request.get(
      `/api/plugin/chat/sessions/${TEST_RELAY_SESSION_ID}/messages`,
      { headers: authHeader }
    );
    expect(msgs.status()).toBe(200);
    const msgBody = await msgs.json();
    expect.soft(Array.isArray(msgBody.messages)).toBe(true);
    expect.soft(
      msgBody.messages.some((m: { role: string }) => m.role === 'assistant')
    ).toBe(true);
  });
});

test.describe('GET /api/plugin/chat/poll (device Bearer)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('no Authorization header → 401', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/poll?session_id=${TEST_RELAY_SESSION_ID}`
    );
    expect(res.status()).toBe(401);
  });

  test('clearly-invalid Bearer key → 401', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/poll?session_id=${TEST_RELAY_SESSION_ID}`,
      { headers: { Authorization: 'Bearer tlz_bogus' } }
    );
    expect(res.status()).toBe(401);
  });

  test('valid key + session not owned → 403 or 404', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/poll?session_id=${NONEXISTENT_SESSION_ID}`,
      { headers: authHeader }
    );
    expect([403, 404].includes(res.status())).toBe(true);
  });

  test('valid key + owned session → 200 { frames: Array }', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/poll?session_id=${TEST_RELAY_SESSION_ID}`,
      { headers: authHeader }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect.soft(Array.isArray(body.frames)).toBe(true);
    for (const frame of body.frames) {
      expect.soft(typeof frame).toBe('object');
      expect.soft(frame).not.toBeNull();
    }
  });

  test('frames are consumed once delivered: a second immediate poll is empty', async ({
    request,
  }) => {
    const first = await request.get(
      `/api/plugin/chat/poll?session_id=${TEST_RELAY_SESSION_ID}`,
      { headers: authHeader }
    );
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect.soft(Array.isArray(firstBody.frames)).toBe(true);

    const second = await request.get(
      `/api/plugin/chat/poll?session_id=${TEST_RELAY_SESSION_ID}`,
      { headers: authHeader }
    );
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect.soft(Array.isArray(secondBody.frames)).toBe(true);
    expect.soft(secondBody.frames.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Messages route — reachable by the device Bearer key for an owned session.
// ---------------------------------------------------------------------------
test.describe('GET /api/plugin/chat/sessions/[id]/messages', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('no auth → 401 or redirect (3xx)', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/sessions/${TEST_RELAY_SESSION_ID}/messages`,
      { maxRedirects: 0 }
    );
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });

  test('valid device key + owned session → 200 with ordered messages', async ({ request }) => {
    const res = await request.get(
      `/api/plugin/chat/sessions/${TEST_RELAY_SESSION_ID}/messages`,
      { headers: authHeader }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect.soft(Array.isArray(body.messages)).toBe(true);

    let prevSeq = -Infinity;
    for (const m of body.messages) {
      expect.soft(typeof m.id === 'string' || typeof m.id === 'number').toBe(true);
      expect.soft(['user', 'assistant']).toContain(m.role);
      expect.soft(m.content !== undefined).toBe(true);
      expect.soft(typeof m.seq).toBe('number');
      expect.soft(m.seq).toBeGreaterThanOrEqual(prevSeq);
      prevSeq = m.seq;
    }
  });
});

// ---------------------------------------------------------------------------
// Clerk-gated page-side routes. Clerk sessions are NOT wired in tests, so we
// only assert UNAUTHENTICATED behavior (401 or a redirect). Authenticated
// coverage needs Clerk test tokens — a followup (see testing rule).
// ---------------------------------------------------------------------------
test.describe('Clerk-gated relay session routes (unauthenticated only)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('POST /api/plugin/chat/sessions without auth → 401 or redirect', async ({ request }) => {
    const res = await request.post('/api/plugin/chat/sessions', {
      data: { device_name: 'e2e' },
      maxRedirects: 0,
    });
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });

  test('GET /api/plugin/chat/sessions without auth → 401 or redirect', async ({ request }) => {
    const res = await request.get('/api/plugin/chat/sessions', { maxRedirects: 0 });
    const status = res.status();
    expect(status === 401 || (status >= 300 && status < 400)).toBe(true);
  });
});
