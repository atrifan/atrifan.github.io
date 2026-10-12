import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_USER, auth, rand } from '../support/gigs-ui';
import { REFERENCE } from '../support/legal';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENV_MISSING,
  RESEND_FAKE_URL,
  emailsAfterQuiet,
  emailsWhere,
  inboxThreads,
  postComplaint,
  replyTo,
  validComplaint,
  type Json,
  type SentEmail,
} from '../support/legal-gigs';

/**
 * Support mail survives a transient Resend outage, from the behaviour contract: 429/503 answers are
 * retried inline (about 0.5s, then 2s, ...; 1 attempt + 3 retries at most), other errors are not retried,
 * and a complaint is accepted (201) whatever happens to its emails. An admin reply that cannot be sent
 * answers 502 { error: 'email_failed' }.
 *
 * Runs under the gigs runner against one shared fake Resend (RESEND_FAKE_URL), fully parallel: each test
 * uses its own complainant and only fails / counts / reads the emails that carry its own address or token.
 */
test.skip(LEGAL_ENV_MISSING, 'needs the gigs runner (RESEND_FAKE_URL, JOBS_E2E_AUTH_SECRET)');

// Retries take a few seconds (0.5s + 2s + ...), so give every test room.
test.describe.configure({ timeout: 60_000 });

/** How long "nothing more happens" waits: longer than any single retry delay we expect. */
const QUIET_MS = 6_000;

/**
 * Substrings of the raw JSON body sent to Resend that pick out one email. Resend accepts `to` and
 * `reply_to` as a string or an array, so both forms are listed; a body only ever contains one of them.
 */
const toMatches = (addr: string) => [`"to":["${addr}"`, `"to":"${addr}"`];
const replyToMatches = (addr: string) => [`"reply_to":["${addr}"`, `"reply_to":"${addr}"`];

async function failNext(request: APIRequestContext, matches: string[], status: number, count: number): Promise<void> {
  for (const match of matches) {
    const res = await request.post(`${RESEND_FAKE_URL}/__fail`, { data: { match, status, count } });
    expect(res.status(), await res.text()).toBe(200);
  }
}

async function attempts(request: APIRequestContext, matches: string[]): Promise<number> {
  let total = 0;
  for (const match of matches) {
    const res = await request.get(`${RESEND_FAKE_URL}/__attempts?match=${encodeURIComponent(match)}`);
    expect(res.status()).toBe(200);
    total += ((await res.json()) as { attempts: number }).attempts;
  }
  return total;
}

/** Waits until the attempt count reaches `n`, then checks it stays there. */
async function expectAttempts(request: APIRequestContext, matches: string[], n: number): Promise<void> {
  await expect.poll(() => attempts(request, matches), { timeout: 20_000 }).toBeGreaterThanOrEqual(n);
  await new Promise((r) => setTimeout(r, QUIET_MS));
  expect(await attempts(request, matches)).toBe(n);
}

/** A complaint whose name and address carry their own token, so its emails are this test's alone. */
function uniqueComplaint(): { body: Record<string, unknown>; name: string; email: string } {
  const tag = `${rand()}${rand()}`;
  const name = `Rita Retry ${tag}`;
  const email = `rita.${tag}@example.test`;
  return { body: validComplaint({ name, email }), name, email };
}

const isForwardOf = (email: string) => (e: SentEmail) => e.to.includes(LEGAL_CONTACT_EMAIL) && replyTo(e).includes(email);
const isAckTo = (email: string) => (e: SentEmail) => e.to.includes(email);
const bodyOf = (e: SentEmail) => `${e.text ?? ''} ${e.html ?? ''}`;

async function complain(request: APIRequestContext, body: Record<string, unknown>): Promise<string> {
  const res = await postComplaint(request, body);
  expect(res.status(), await res.text()).toBe(201);
  const json = (await res.json()) as Json;
  expect(json.ok).toBe(true);
  expect(json.reference).toMatch(REFERENCE);
  return json.reference as string;
}

async function complaintThreadId(request: APIRequestContext, reference: string): Promise<string> {
  let id = '';
  await expect
    .poll(
      async () => {
        const thread = (await inboxThreads(request, ADMIN_USER, '?source=complaint')).find((t: Json) => t.reference === reference);
        id = thread?.id ?? '';
        return id;
      },
      { timeout: 10_000 },
    )
    .not.toBe('');
  return id;
}

// ===========================================================================
// complaint emails

test.describe('complaint emails: baseline', () => {
  test('a valid complaint → 201 and two emails: the forward (reply_to the complainant) and the acknowledgement', async ({ request }) => {
    const c = uniqueComplaint();
    const reference = await complain(request, c.body);

    const forward = await emailsWhere(request, isForwardOf(c.email));
    expect(forward).toHaveLength(1);
    expect(forward[0].subject).toContain(reference);
    expect(bodyOf(forward[0])).toContain(c.name);

    const ack = await emailsWhere(request, isAckTo(c.email));
    expect(ack).toHaveLength(1);
    expect(`${ack[0].subject} ${bodyOf(ack[0])}`).toContain(reference);
    expect(bodyOf(ack[0])).toContain(c.name);

    expect(await attempts(request, replyToMatches(c.email))).toBe(1);
    expect(await attempts(request, toMatches(c.email))).toBe(1);
  });
});

test.describe('complaint emails: transient failures are retried', () => {
  for (const status of [503, 429]) {
    test(`${status} on the first 2 attempts of the acknowledgement → still 201, delivered once after 3 attempts`, async ({ request }) => {
      const c = uniqueComplaint();
      await failNext(request, toMatches(c.email), status, 2);
      const reference = await complain(request, c.body);

      const ack = await emailsWhere(request, isAckTo(c.email), 1, 15_000);
      expect(`${ack[0].subject} ${bodyOf(ack[0])}`).toContain(reference);
      await expectAttempts(request, toMatches(c.email), 3);
      expect(await emailsAfterQuiet(request, isAckTo(c.email), 0)).toHaveLength(1);

      // the forward was not affected
      expect(await emailsWhere(request, isForwardOf(c.email))).toHaveLength(1);
      expect(await attempts(request, replyToMatches(c.email))).toBe(1);
    });

    test(`${status} on the first 2 attempts of the forward → still 201, delivered once after 3 attempts`, async ({ request }) => {
      const c = uniqueComplaint();
      await failNext(request, replyToMatches(c.email), status, 2);
      const reference = await complain(request, c.body);

      const forward = await emailsWhere(request, isForwardOf(c.email), 1, 15_000);
      expect(forward[0].subject).toContain(reference);
      expect(bodyOf(forward[0])).toContain(c.name);
      await expectAttempts(request, replyToMatches(c.email), 3);
      expect(await emailsAfterQuiet(request, isForwardOf(c.email), 0)).toHaveLength(1);

      // the acknowledgement was not affected
      expect(await emailsWhere(request, isAckTo(c.email))).toHaveLength(1);
      expect(await attempts(request, toMatches(c.email))).toBe(1);
    });
  }
});

test.describe('complaint emails: non-transient failures are not retried', () => {
  test('422 on the forward → attempted once, not delivered; still 201 and the thread is stored', async ({ request }) => {
    const c = uniqueComplaint();
    await failNext(request, replyToMatches(c.email), 422, 10);
    const reference = await complain(request, c.body);

    await expectAttempts(request, replyToMatches(c.email), 1);
    expect(await emailsAfterQuiet(request, isForwardOf(c.email), 0)).toHaveLength(0);

    const threadId = await complaintThreadId(request, reference);
    expect(threadId).not.toBe('');
  });

  test('422 on the acknowledgement → attempted once, not delivered; still 201 and the thread is stored', async ({ request }) => {
    const c = uniqueComplaint();
    await failNext(request, toMatches(c.email), 422, 10);
    const reference = await complain(request, c.body);

    await expectAttempts(request, toMatches(c.email), 1);
    expect(await emailsAfterQuiet(request, isAckTo(c.email), 0)).toHaveLength(0);
    expect(await complaintThreadId(request, reference)).not.toBe('');
  });
});

test.describe('complaint emails: retries give up', () => {
  test('503 on every attempt of the acknowledgement → 4 attempts (1 + 3 retries), not delivered; still 201', async ({ request }) => {
    const c = uniqueComplaint();
    await failNext(request, toMatches(c.email), 503, 10);
    const reference = await complain(request, c.body);

    await expectAttempts(request, toMatches(c.email), 4);
    expect(await emailsAfterQuiet(request, isAckTo(c.email), 0)).toHaveLength(0);
    expect(await complaintThreadId(request, reference)).not.toBe('');
  });

  test('503 on every attempt of the forward → 4 attempts (1 + 3 retries), not delivered; still 201', async ({ request }) => {
    const c = uniqueComplaint();
    await failNext(request, replyToMatches(c.email), 503, 10);
    const reference = await complain(request, c.body);

    await expectAttempts(request, replyToMatches(c.email), 4);
    expect(await emailsAfterQuiet(request, isForwardOf(c.email), 0)).toHaveLength(0);
    expect(await complaintThreadId(request, reference)).not.toBe('');
  });
});

// ===========================================================================
// admin reply

test.describe('admin reply: retries', () => {
  async function replyThread(request: APIRequestContext): Promise<{ threadId: string; email: string }> {
    const c = uniqueComplaint();
    const reference = await complain(request, c.body);
    return { threadId: await complaintThreadId(request, reference), email: c.email };
  }

  const isReply = (token: string) => (e: SentEmail) => bodyOf(e).includes(token);

  function post(request: APIRequestContext, threadId: string, text: string) {
    return request.post(`/api/admin/inbox/${threadId}/reply`, { headers: auth(ADMIN_USER), data: { text } });
  }

  test('no failures → 201 { message } and one email to the contact', async ({ request }) => {
    const { threadId, email } = await replyThread(request);
    const token = `reply-ok-${rand()}${rand()}`;
    const res = await post(request, threadId, `We refunded the duplicate. ${token}`);
    expect(res.status(), await res.text()).toBe(201);
    expect((await res.json()) as Json).toHaveProperty('message');

    const sent = await emailsWhere(request, isReply(token));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toContain(email);
    expect(await attempts(request, [token])).toBe(1);
  });

  test('503 on the first 2 attempts → still 201 { message }, delivered once after 3 attempts', async ({ request }) => {
    const { threadId, email } = await replyThread(request);
    const token = `reply-flaky-${rand()}${rand()}`;
    await failNext(request, [token], 503, 2);

    const res = await post(request, threadId, `We refunded the duplicate. ${token}`);
    expect(res.status(), await res.text()).toBe(201);
    expect((await res.json()) as Json).toHaveProperty('message');

    const sent = await emailsWhere(request, isReply(token), 1, 15_000);
    expect(sent[0].to).toContain(email);
    await expectAttempts(request, [token], 3);
    expect(await emailsAfterQuiet(request, isReply(token), 0)).toHaveLength(1);
  });

  test('503 on every attempt → 502 { error: "email_failed" } after 4 attempts, nothing delivered', async ({ request }) => {
    const { threadId } = await replyThread(request);
    const token = `reply-down-${rand()}${rand()}`;
    await failNext(request, [token], 503, 10);

    const res = await post(request, threadId, `We refunded the duplicate. ${token}`);
    expect(res.status(), await res.text()).toBe(502);
    expect(((await res.json()) as Json).error).toBe('email_failed');

    await expectAttempts(request, [token], 4);
    expect(await emailsAfterQuiet(request, isReply(token), 0)).toHaveLength(0);
  });

  test('422 → not retried: attempted once, nothing delivered', async ({ request }) => {
    const { threadId } = await replyThread(request);
    const token = `reply-422-${rand()}${rand()}`;
    await failNext(request, [token], 422, 10);

    const res = await post(request, threadId, `We refunded the duplicate. ${token}`);
    expect(res.status()).not.toBe(201);

    await expectAttempts(request, [token], 1);
    expect(await emailsAfterQuiet(request, isReply(token), 0)).toHaveLength(0);
  });
});
