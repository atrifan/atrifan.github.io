import { test, expect } from '@playwright/test';
import { ADMIN_USER, auth } from '../support/gigs-ui';
import { REFERENCE } from '../support/legal';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENV_MISSING,
  emailsAfterQuiet,
  emailsWhere,
  inboxThreads,
  mentions,
  postComplaint,
  replyTo,
  uniqueIp,
  validComplaint,
  type Json,
} from '../support/legal-gigs';

/**
 * POST /api/legal/complaints, from the behaviour contract: validation, the illegal-content rules,
 * the honeypot, the per-IP rate limit, the two emails (fake Resend) and the admin notification.
 * Runs under the gigs runner (throwaway DB, fake Resend at RESEND_FAKE_URL, x-e2e-user identity).
 */
test.skip(LEGAL_ENV_MISSING, 'needs the gigs runner (RESEND_FAKE_URL, JOBS_E2E_AUTH_SECRET)');

async function json(res: { json(): Promise<unknown> }): Promise<Json> {
  return res.json();
}

test.describe('POST /api/legal/complaints: accepted', () => {
  test('signed out → 201 { ok: true, reference } with a TZ-XXXX-XXXX reference', async ({ request }) => {
    const res = await postComplaint(request, validComplaint());
    expect(res.status(), await res.text()).toBe(201);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.reference).toMatch(REFERENCE);
  });

  test('signed in → 201 too, and each complaint gets its own reference', async ({ request }) => {
    const user = `e2e_complainer_${Date.now()}`;
    const refs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await postComplaint(request, validComplaint(), { headers: auth(user) });
      expect(res.status(), await res.text()).toBe(201);
      refs.push((await json(res)).reference);
    }
    expect(refs[0]).toMatch(REFERENCE);
    expect(refs[1]).toMatch(REFERENCE);
    expect(refs[0]).not.toBe(refs[1]);
  });

  for (const category of ['payment_refund', 'gigs_dispute', 'marketplace_content', 'account', 'privacy', 'other']) {
    test(`category ${category} is accepted`, async ({ request }) => {
      const res = await postComplaint(request, validComplaint({ category }));
      expect(res.status(), await res.text()).toBe(201);
    });
  }

  test('"related" is optional for ordinary categories', async ({ request }) => {
    const body = validComplaint();
    delete body.related;
    const res = await postComplaint(request, body);
    expect(res.status(), await res.text()).toBe(201);
  });

  test('illegal_content with related and good_faith: true → 201', async ({ request }) => {
    const res = await postComplaint(
      request,
      validComplaint({ category: 'illegal_content', related: 'https://tulzo.online/marketplace/p/bad-plugin', good_faith: true }),
    );
    expect(res.status(), await res.text()).toBe(201);
  });
});

test.describe('POST /api/legal/complaints: validation (400 invalid_request with fields)', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['missing category', { category: undefined }, 'category'],
    ['unknown category', { category: 'spam' }, 'category'],
    ['empty name', { name: '' }, 'name'],
    ['blank name', { name: '   ' }, 'name'],
    ['name over 200 chars', { name: 'n'.repeat(201) }, 'name'],
    ['invalid email', { email: 'not-an-email' }, 'email'],
    ['missing email', { email: undefined }, 'email'],
    ['message under 10 chars', { message: 'too short' }, 'message'],
    ['message over 5000 chars', { message: 'm'.repeat(5001) }, 'message'],
    ['related over 500 chars', { related: `https://tulzo.online/${'r'.repeat(500)}` }, 'related'],
    ['illegal_content without related', { category: 'illegal_content', related: undefined, good_faith: true }, 'related'],
    ['illegal_content with empty related', { category: 'illegal_content', related: '', good_faith: true }, 'related'],
    ['illegal_content without good_faith', { category: 'illegal_content', related: 'https://tulzo.online/x' }, 'good_faith'],
    ['illegal_content with good_faith: false', { category: 'illegal_content', related: 'https://tulzo.online/x', good_faith: false }, 'good_faith'],
  ];

  for (const [label, overrides, field] of cases) {
    test(`${label} → fields.${field}`, async ({ request }) => {
      const body = validComplaint(overrides);
      for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete body[k];
      const res = await postComplaint(request, body);
      expect(res.status(), await res.text()).toBe(400);
      const out = await json(res);
      expect(out.error).toBe('invalid_request');
      expect(typeof out.fields?.[field], `fields.${field}`).toBe('string');
      expect(out.fields[field].length).toBeGreaterThan(0);
    });
  }

  test('exactly 200 chars of name, 10 chars of message and 500 chars of related are accepted', async ({ request }) => {
    const res = await postComplaint(
      request,
      validComplaint({ name: 'n'.repeat(200), message: 'ten chars!', related: 'r'.repeat(500) }),
    );
    expect(res.status(), await res.text()).toBe(201);
  });

  test('a refused complaint sends no email', async ({ request }) => {
    const tag = `refused-${Date.now()}`;
    const res = await postComplaint(request, validComplaint({ email: 'nope', message: `Refused complaint ${tag} body text` }));
    expect(res.status()).toBe(400);
    expect(await emailsAfterQuiet(request, mentions(tag))).toHaveLength(0);
  });
});

test.describe('POST /api/legal/complaints: honeypot', () => {
  test('a filled "website" → 201 with a reference, but no email and nothing in the admin inbox', async ({ request }) => {
    const tag = `honeypot${Date.now()}`;
    const complaint = validComplaint({ website: 'https://spam.test', message: `Buy cheap watches ${tag} now please` });
    const res = await postComplaint(request, complaint);
    expect(res.status(), await res.text()).toBe(201);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.reference).toMatch(REFERENCE);
    expect(await emailsAfterQuiet(request, (e) => mentions(tag)(e) || mentions(body.reference)(e) || e.to.includes(String(complaint.email)))).toHaveLength(0);
    const threads = await inboxThreads(request, ADMIN_USER);
    expect(threads.some((t: Json) => t.reference === body.reference || t.contact_email === complaint.email)).toBe(false);
  });
});

test.describe('POST /api/legal/complaints: rate limit', () => {
  test('5 accepted per IP per hour; the 6th → 429 rate_limited with Retry-After; another IP is unaffected', async ({ request }) => {
    const ip = uniqueIp();
    for (let i = 0; i < 5; i++) {
      const res = await postComplaint(request, validComplaint(), { ip });
      expect(res.status(), `complaint ${i + 1}: ${await res.text()}`).toBe(201);
    }
    const sixth = await postComplaint(request, validComplaint(), { ip });
    expect(sixth.status()).toBe(429);
    expect(await json(sixth)).toEqual({ error: 'rate_limited' });
    const retry = sixth.headers()['retry-after'];
    expect(retry, 'Retry-After header').toBeTruthy();
    expect(Number(retry)).toBeGreaterThan(0);

    const other = await postComplaint(request, validComplaint(), { ip: uniqueIp() });
    expect(other.status(), await other.text()).toBe(201);
  });

  test('the first x-forwarded-for value is the client IP', async ({ request }) => {
    const ip = uniqueIp();
    for (let i = 0; i < 5; i++) {
      const res = await postComplaint(request, validComplaint(), { ip: `${ip}, ${uniqueIp()}` });
      expect(res.status(), await res.text()).toBe(201);
    }
    const sixth = await postComplaint(request, validComplaint(), { ip: `${ip}, ${uniqueIp()}` });
    expect(sixth.status()).toBe(429);
  });

  test('refused (400) complaints do not count towards the limit', async ({ request }) => {
    const ip = uniqueIp();
    for (let i = 0; i < 6; i++) {
      const res = await postComplaint(request, validComplaint({ email: 'bad' }), { ip });
      expect(res.status()).toBe(400);
    }
    const ok = await postComplaint(request, validComplaint(), { ip });
    expect(ok.status(), await ok.text()).toBe(201);
  });
});

test.describe('POST /api/legal/complaints: emails and admin notification', () => {
  test('one email to the contact address and one acknowledgement to the complainant', async ({ request }) => {
    const complaint = validComplaint({ category: 'gigs_dispute' });
    const res = await postComplaint(request, complaint);
    expect(res.status(), await res.text()).toBe(201);
    const { reference } = await json(res);

    const toSupport = await emailsWhere(request, (e) => e.subject.includes(reference) && e.to.includes(LEGAL_CONTACT_EMAIL));
    expect(toSupport).toHaveLength(1);
    expect(replyTo(toSupport[0])).toContain(complaint.email);
    expect(toSupport[0].text ?? '').toContain(String(complaint.message));

    const ack = await emailsWhere(request, (e) => e.subject.includes(reference) && e.to.includes(String(complaint.email)));
    expect(ack).toHaveLength(1);
    expect(ack[0].text ?? '').toContain(reference);
    expect(ack[0].text ?? '').toContain('14 days');
  });

  test('admins get an in-app notification mentioning the reference', async ({ request }) => {
    const res = await postComplaint(request, validComplaint({ category: 'privacy' }));
    expect(res.status(), await res.text()).toBe(201);
    const { reference } = await json(res);
    await expect
      .poll(
        async () => {
          const list = await request.get('/api/notifications?limit=50', { headers: auth(ADMIN_USER) });
          if (list.status() !== 200) return false;
          const { items } = (await list.json()) as { items: Array<{ title: string; body: string | null; url: string }> };
          return items.some((i) => `${i.title} ${i.body ?? ''} ${i.url}`.includes(reference));
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('a complaint shows up in the admin inbox as source "complaint"', async ({ request }) => {
    const complaint = validComplaint({ category: 'account' });
    const res = await postComplaint(request, complaint);
    expect(res.status(), await res.text()).toBe(201);
    const { reference } = await json(res);
    const threads = await inboxThreads(request, ADMIN_USER, '?source=complaint');
    const thread = threads.find((t: Json) => t.reference === reference);
    expect(thread, 'thread for the complaint').toBeTruthy();
    expect(thread.source).toBe('complaint');
    expect(thread.category).toBe('account');
    expect(thread.contact_email).toBe(complaint.email);
    expect(thread.contact_name).toBe(complaint.name);
    expect(thread.status).toBe('open');
  });
});
