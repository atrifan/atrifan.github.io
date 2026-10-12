import { test, expect, type APIRequestContext } from '@playwright/test';
import { Webhook } from 'svix';
import { ADMIN_USER, auth, openGigs, rand, signIn, uid } from '../support/gigs-ui';
import { REFERENCE, REFERENCE_IN_TEXT } from '../support/legal';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENV_MISSING,
  SEED_ADMIN_EMAIL,
  SUPPORT_FORWARD_TO,
  deliverInbound,
  emailsAfterQuiet,
  emailsWhere,
  inboundEmail,
  inboxThread,
  inboxThreads,
  postComplaint,
  postResendWebhook,
  receivedEvent,
  registerReceived,
  replyTo,
  validComplaint,
  type InboundEmail,
  type Json,
  type SentEmail,
} from '../support/legal-gigs';

/**
 * The support inbox, from the behaviour contract: the Resend inbound webhook (Svix-signed),
 * threading, forwarding, HTML sanitisation, the admin inbox API and the hub /admin/inbox page.
 * Runs under the gigs runner (fake Resend at RESEND_FAKE_URL, x-e2e-user identity; the admin is
 * QA_E2E_ADMIN_USER).
 */
test.skip(LEGAL_ENV_MISSING, 'needs the gigs runner (RESEND_FAKE_URL, JOBS_E2E_AUTH_SECRET)');

const NASTY_HTML =
  '<p>Hi</p><script>alert(1)</script><img src="https://evil.test/x.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a>';

/** The bare address in "Name <addr>" or "addr". */
function address(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}

const isForwardOf = (reference: string) => (e: SentEmail) =>
  e.subject.includes(reference) && (e.to.includes(SUPPORT_FORWARD_TO) || e.to.includes(SEED_ADMIN_EMAIL));

async function newThread(request: APIRequestContext, overrides: Partial<InboundEmail> = {}) {
  const email = inboundEmail(overrides);
  const res = await deliverInbound(request, email);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(typeof res.body.thread_id).toBe('string');
  expect(res.body.reference).toMatch(REFERENCE);
  return { email, threadId: res.body.thread_id as string, reference: res.body.reference as string };
}

async function messageCount(request: APIRequestContext, threadId: string): Promise<number> {
  return (await inboxThread(request, ADMIN_USER, threadId)).messages.length;
}

// ===========================================================================
// webhook: signatures

test.describe('POST /api/webhooks/resend: signatures', () => {
  test('unsigned → 400 invalid_signature and nothing stored', async ({ request }) => {
    const email = inboundEmail();
    await registerReceived(request, email);
    const res = await postResendWebhook(request, receivedEvent(email), {});
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    const threads = await inboxThreads(request, ADMIN_USER);
    expect(threads.some((t: Json) => t.subject === email.subject)).toBe(false);
  });

  test('signed with another secret → 400 invalid_signature and nothing stored', async ({ request }) => {
    const email = inboundEmail();
    await registerReceived(request, email);
    const payload = JSON.stringify(receivedEvent(email));
    const now = new Date();
    const other = `whsec_${Buffer.from(`not-the-secret-${rand()}`).toString('base64')}`;
    const res = await postResendWebhook(request, receivedEvent(email), {
      'svix-id': 'msg_bad',
      'svix-timestamp': Math.floor(now.getTime() / 1000).toString(),
      'svix-signature': new Webhook(other).sign('msg_bad', now, payload),
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    expect((await inboxThreads(request, ADMIN_USER)).some((t: Json) => t.subject === email.subject)).toBe(false);
  });

  test('a garbage signature → 400 invalid_signature', async ({ request }) => {
    const email = inboundEmail();
    await registerReceived(request, email);
    const res = await postResendWebhook(request, receivedEvent(email), {
      'svix-id': 'msg_x',
      'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
      'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });

  test('a validly signed payload that was then altered → 400 invalid_signature', async ({ request }) => {
    const email = inboundEmail();
    await registerReceived(request, email);
    const signedPayload = JSON.stringify(receivedEvent(email));
    const now = new Date();
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? '';
    const headers = {
      'svix-id': 'msg_tamper',
      'svix-timestamp': Math.floor(now.getTime() / 1000).toString(),
      'svix-signature': new Webhook(secret).sign('msg_tamper', now, signedPayload),
    };
    const altered = { ...receivedEvent(email), data: { ...receivedEvent(email).data, subject: `${email.subject} (altered)` } };
    const res = await postResendWebhook(request, altered, headers);
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });
});

// ===========================================================================
// webhook: storing, threading, forwarding

test.describe('POST /api/webhooks/resend: inbound email', () => {
  test('a new email → 200 { ok, thread_id, reference }; a thread with source "email"', async ({ request }) => {
    const { email, threadId, reference } = await newThread(request);
    const threads = await inboxThreads(request, ADMIN_USER, '?source=email');
    const thread = threads.find((t: Json) => t.id === threadId);
    expect(thread, 'thread listed').toBeTruthy();
    expect(thread.reference).toBe(reference);
    expect(thread.source).toBe('email');
    expect(thread.subject).toBe(email.subject);
    expect(String(thread.contact_email).toLowerCase()).toBe(address(email.from));
    expect(thread.status).toBe('open');
    expect(thread.message_count).toBe(1);
    const { messages } = await inboxThread(request, ADMIN_USER, threadId);
    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBe('inbound');
    expect(messages[0].text).toContain('question about my invoice');
    expect(messages[0].message_id).toBe(email.message_id);
  });

  test('the same email_id again → 200 { ok, duplicate: true }; no second message or forward', async ({ request }) => {
    const { email, threadId, reference } = await newThread(request);
    const forwards = await emailsWhere(request, isForwardOf(reference));
    const again = await postResendWebhook(request, receivedEvent(email));
    expect(again.status()).toBe(200);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(await messageCount(request, threadId)).toBe(1);
    expect(await emailsAfterQuiet(request, isForwardOf(reference))).toHaveLength(forwards.length);
  });

  test('an email whose subject contains a thread reference joins that thread', async ({ request }) => {
    const first = await newThread(request);
    const follow = inboundEmail({ from: first.email.from, subject: `Re: [${first.reference}] still waiting` });
    const res = await deliverInbound(request, follow);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, thread_id: first.threadId, reference: first.reference });
    expect(await messageCount(request, first.threadId)).toBe(2);
  });

  test('an email whose text contains a thread reference joins that thread', async ({ request }) => {
    const first = await newThread(request);
    const follow = inboundEmail({ subject: `Another question ${rand()}`, text: `About my case ${first.reference}, any news?` });
    const res = await deliverInbound(request, follow);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, thread_id: first.threadId, reference: first.reference });
  });

  test('a complaint reference in the subject joins the complaint thread', async ({ request }) => {
    const complaint = validComplaint();
    const posted = await postComplaint(request, complaint);
    expect(posted.status(), await posted.text()).toBe(201);
    const { reference } = (await posted.json()) as { reference: string };
    const reply = inboundEmail({ from: String(complaint.email), subject: `Re: Your report ${reference}` });
    const res = await deliverInbound(request, reply);
    expect(res.status).toBe(200);
    expect(res.body.reference).toBe(reference);
    const thread = (await inboxThreads(request, ADMIN_USER, '?source=complaint')).find((t: Json) => t.reference === reference);
    expect(thread?.id).toBe(res.body.thread_id);
  });

  test('In-Reply-To matching a stored message id joins that thread', async ({ request }) => {
    const first = await newThread(request);
    const follow = inboundEmail({ subject: `Re: something ${rand()}`, text: 'Following up.', headers: { 'In-Reply-To': first.email.message_id } });
    const res = await deliverInbound(request, follow);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, thread_id: first.threadId, reference: first.reference });
  });

  test('an unrelated email starts a new thread with a new reference', async ({ request }) => {
    const a = await newThread(request);
    const b = await newThread(request, { headers: { 'In-Reply-To': '<unknown-id@nowhere.test>' } });
    expect(b.threadId).not.toBe(a.threadId);
    expect(b.reference).not.toBe(a.reference);
  });

  test('other event types → 200 { ok, ignored: true } and nothing stored', async ({ request }) => {
    const email = inboundEmail();
    await registerReceived(request, email);
    const res = await postResendWebhook(request, receivedEvent(email, 'email.delivered'));
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect((await inboxThreads(request, ADMIN_USER)).some((t: Json) => t.subject === email.subject)).toBe(false);
  });

  test('a new email is forwarded to the admins and SUPPORT_FORWARD_TO, reply_to the sender', async ({ request }) => {
    const { email, reference } = await newThread(request);
    const forwards = await emailsWhere(request, (e) => e.subject.includes(reference) && (e.to.includes(SUPPORT_FORWARD_TO) || e.to.includes(SEED_ADMIN_EMAIL)));
    const recipients = new Set(forwards.flatMap((e) => e.to));
    expect([...recipients]).toContain(SUPPORT_FORWARD_TO);
    expect([...recipients]).toContain(SEED_ADMIN_EMAIL);
    for (const f of forwards) {
      expect(replyTo(f).map(address), `reply_to of ${f.to.join(',')}`).toContain(address(email.from));
    }
  });

  test('a follow-up in a thread is forwarded too', async ({ request }) => {
    const first = await newThread(request);
    const before = (await emailsWhere(request, isForwardOf(first.reference))).length;
    const tag = rand();
    await deliverInbound(request, inboundEmail({ subject: `Re: ${first.reference}`, text: `Second message ${tag}` }));
    await emailsWhere(request, (e) => isForwardOf(first.reference)(e) && ((e.text ?? '') + (e.html ?? '')).includes(tag));
    expect((await emailsWhere(request, isForwardOf(first.reference))).length).toBeGreaterThan(before);
  });

  test('admins get an in-app notification for a new email', async ({ request }) => {
    const { reference } = await newThread(request);
    await expect
      .poll(
        async () => {
          const res = await request.get('/api/notifications?limit=50', { headers: auth(ADMIN_USER) });
          if (res.status() !== 200) return false;
          const { items } = (await res.json()) as { items: Array<{ title: string; body: string | null; url: string }> };
          return items.some((i) => `${i.title} ${i.body ?? ''} ${i.url}`.includes(reference));
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('stored HTML is sanitised: no script, no on* handlers, no javascript: URLs, no remote images', async ({ request }) => {
    const { threadId } = await newThread(request, { html: NASTY_HTML, text: 'Hi' });
    const { messages } = await inboxThread(request, ADMIN_USER, threadId);
    const html = String(messages[0].html ?? '');
    expect(html).toContain('Hi');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html).not.toMatch(/src\s*=\s*["']?https?:/i);
    expect(html).not.toContain('evil.test/x.png');
  });
});

// ===========================================================================
// admin API

test.describe('admin inbox API', () => {
  test('signed out → 401 on every route', async ({ request }) => {
    const { threadId } = await newThread(request);
    for (const res of [
      await request.get('/api/admin/inbox'),
      await request.get(`/api/admin/inbox/${threadId}`),
      await request.patch(`/api/admin/inbox/${threadId}`, { data: { status: 'closed' } }),
      await request.post(`/api/admin/inbox/${threadId}/reply`, { data: { text: 'Hello' } }),
    ]) {
      expect(res.status(), res.url()).toBe(401);
    }
  });

  test('a non-admin → 403 on every route, and nothing changes', async ({ request }) => {
    const { threadId, email } = await newThread(request);
    const user = auth(uid('notadmin'));
    for (const res of [
      await request.get('/api/admin/inbox', { headers: user }),
      await request.get(`/api/admin/inbox/${threadId}`, { headers: user }),
      await request.patch(`/api/admin/inbox/${threadId}`, { headers: user, data: { status: 'closed' } }),
      await request.post(`/api/admin/inbox/${threadId}/reply`, { headers: user, data: { text: 'Hello' } }),
    ]) {
      expect(res.status(), res.url()).toBe(403);
    }
    const { thread } = await inboxThread(request, ADMIN_USER, threadId);
    expect(thread.status).toBe('open');
    expect(await emailsAfterQuiet(request, (e) => e.to.map(address).includes(address(email.from)))).toHaveLength(0);
  });

  test('list: thread shape, newest first, source and status filters', async ({ request }) => {
    const mail = await newThread(request);
    const posted = await postComplaint(request, validComplaint());
    const complaintRef = ((await posted.json()) as { reference: string }).reference;

    const all = await inboxThreads(request, ADMIN_USER);
    for (const t of all) {
      for (const key of ['id', 'reference', 'source', 'subject', 'contact_email', 'status', 'created_at', 'last_message_at', 'message_count']) {
        expect(t, `thread.${key}`).toHaveProperty(key);
      }
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('contact_name');
      expect(t).toHaveProperty('notes');
      expect(['complaint', 'email']).toContain(t.source);
      expect(['open', 'answered', 'closed']).toContain(t.status);
      expect(t.reference).toMatch(REFERENCE);
    }
    const times = all.map((t: Json) => Date.parse(t.last_message_at ?? t.created_at));
    expect(times, 'newest first').toEqual([...times].sort((a, b) => b - a));
    expect(all.some((t: Json) => t.id === mail.threadId)).toBe(true);
    expect(all.some((t: Json) => t.reference === complaintRef)).toBe(true);

    const emails = await inboxThreads(request, ADMIN_USER, '?source=email');
    expect(emails.every((t: Json) => t.source === 'email')).toBe(true);
    expect(emails.some((t: Json) => t.id === mail.threadId)).toBe(true);
    expect(emails.some((t: Json) => t.reference === complaintRef)).toBe(false);

    const complaints = await inboxThreads(request, ADMIN_USER, '?source=complaint');
    expect(complaints.every((t: Json) => t.source === 'complaint')).toBe(true);
    expect(complaints.some((t: Json) => t.reference === complaintRef)).toBe(true);
    expect(complaints.some((t: Json) => t.id === mail.threadId)).toBe(false);

    const patched = await request.patch(`/api/admin/inbox/${mail.threadId}`, { headers: auth(ADMIN_USER), data: { status: 'closed' } });
    expect(patched.status()).toBe(200);
    const closed = await inboxThreads(request, ADMIN_USER, '?status=closed');
    expect(closed.every((t: Json) => t.status === 'closed')).toBe(true);
    expect(closed.some((t: Json) => t.id === mail.threadId)).toBe(true);
    const open = await inboxThreads(request, ADMIN_USER, '?source=email&status=open');
    expect(open.every((t: Json) => t.status === 'open' && t.source === 'email')).toBe(true);
    expect(open.some((t: Json) => t.id === mail.threadId)).toBe(false);
  });

  test('get: thread and messages with their fields', async ({ request }) => {
    const { threadId, reference, email } = await newThread(request);
    const { thread, messages } = await inboxThread(request, ADMIN_USER, threadId);
    expect(thread.id).toBe(threadId);
    expect(thread.reference).toBe(reference);
    expect(messages).toHaveLength(1);
    const m = messages[0];
    for (const key of ['id', 'direction', 'from', 'to', 'subject', 'text', 'html', 'message_id', 'created_at']) {
      expect(m, `message.${key}`).toHaveProperty(key);
    }
    expect(m.direction).toBe('inbound');
    expect(String(m.from).toLowerCase()).toContain(address(email.from));
    expect(m.subject).toBe(email.subject);
  });

  test('patch: status and notes; an invalid status → 400', async ({ request }) => {
    const { threadId } = await newThread(request);
    const notes = `Called the customer ${rand()}`;
    const res = await request.patch(`/api/admin/inbox/${threadId}`, { headers: auth(ADMIN_USER), data: { status: 'answered', notes } });
    expect(res.status(), await res.text()).toBe(200);
    const { thread } = (await res.json()) as { thread: Json };
    expect(thread.status).toBe('answered');
    expect(thread.notes).toBe(notes);
    const again = await inboxThread(request, ADMIN_USER, threadId);
    expect(again.thread.status).toBe('answered');
    expect(again.thread.notes).toBe(notes);

    const notesOnly = await request.patch(`/api/admin/inbox/${threadId}`, { headers: auth(ADMIN_USER), data: { notes: 'Second note' } });
    expect(notesOnly.status()).toBe(200);
    expect(((await notesOnly.json()) as { thread: Json }).thread).toMatchObject({ status: 'answered', notes: 'Second note' });

    const bad = await request.patch(`/api/admin/inbox/${threadId}`, { headers: auth(ADMIN_USER), data: { status: 'archived' } });
    expect(bad.status()).toBe(400);
    expect((await inboxThread(request, ADMIN_USER, threadId)).thread.status).toBe('answered');
  });

  test('reply: 201 { message }; one email from support to the contact with threading headers; thread answered', async ({ request }) => {
    const first = await newThread(request);
    const second = inboundEmail({ from: first.email.from, subject: `Re: ${first.reference}`, text: 'Any update?' });
    expect((await deliverInbound(request, second)).body.thread_id).toBe(first.threadId);

    const text = `Thanks for writing, we refunded the duplicate. ${rand()}`;
    const res = await request.post(`/api/admin/inbox/${first.threadId}/reply`, { headers: auth(ADMIN_USER), data: { text } });
    expect(res.status(), await res.text()).toBe(201);
    const { message } = (await res.json()) as { message: Json };
    expect(message.direction).toBe('outbound');

    const sent = await emailsWhere(request, (e) => (e.text ?? '').includes(text));
    expect(sent).toHaveLength(1);
    const reply = sent[0];
    expect(reply.from).toContain(LEGAL_CONTACT_EMAIL);
    expect(reply.to.map(address)).toEqual([address(first.email.from)]);
    expect(reply.subject).toContain(first.reference);
    expect(reply.headers?.['In-Reply-To']).toBe(second.message_id);
    expect(reply.headers?.['References'] ?? '').toContain(second.message_id);

    const after = await inboxThread(request, ADMIN_USER, first.threadId);
    expect(after.thread.status).toBe('answered');
    expect(after.messages.filter((m: Json) => m.direction === 'outbound')).toHaveLength(1);
    expect(after.messages.find((m: Json) => m.direction === 'outbound').text).toContain(text);
  });

  test('reply: empty text → 400 and no email', async ({ request }) => {
    const { threadId, email } = await newThread(request);
    for (const data of [{ text: '' }, { text: '   ' }, {}]) {
      const res = await request.post(`/api/admin/inbox/${threadId}/reply`, { headers: auth(ADMIN_USER), data });
      expect(res.status()).toBe(400);
    }
    expect(await emailsAfterQuiet(request, (e) => e.to.map(address).includes(address(email.from)))).toHaveLength(0);
    expect((await inboxThread(request, ADMIN_USER, threadId)).thread.status).toBe('open');
  });
});

// ===========================================================================
// admin UI /admin/inbox

test.describe('hub /admin/inbox', () => {
  test('a non-admin gets a 404 page', async ({ page, context }) => {
    await signIn(context, uid('notadminui'));
    const res = await page.goto('/admin/inbox');
    expect(res?.status()).toBe(404);
  });

  test('signed out does not show the inbox', async ({ page }) => {
    await page.goto('/admin/inbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toHaveCount(0);
  });

  test('/admin/complaints redirects to /admin/inbox?source=complaint', async ({ page, context, request }) => {
    await signIn(context, ADMIN_USER);
    const res = await request.get('/admin/complaints', { headers: auth(ADMIN_USER), maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(res.status());
    const location = new URL(res.headers()['location'] ?? '', 'http://localhost');
    expect(location.pathname).toBe('/admin/inbox');
    expect(location.searchParams.get('source')).toBe('complaint');
    await page.goto('/admin/complaints');
    await expect(page).toHaveURL(/\/admin\/inbox\?source=complaint$/);
  });

  test('heading, filter, table and an open thread with sanitised HTML; notes, status and reply', async ({ page, context, request }) => {
    const alerts: string[] = [];
    page.on('dialog', async (d) => {
      alerts.push(d.message());
      await d.dismiss();
    });
    const { reference, threadId, email } = await newThread(request, { html: NASTY_HTML, text: 'Hi' });

    await signIn(context, ADMIN_USER);
    await openGigs(page, '/admin/inbox', { signedIn: true });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
    const show = page.getByRole('combobox', { name: 'Show', exact: true });
    for (const label of ['All', 'Complaints', 'Emails']) await expect(show.locator('option', { hasText: label })).toHaveCount(1);
    const table = page.getByRole('table');
    for (const col of ['Reference', 'From', 'Subject', 'Status', 'Received']) {
      await expect(table.getByRole('columnheader', { name: col, exact: true }), col).toBeVisible();
    }
    const row = table.getByRole('row').filter({ hasText: reference });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(email.subject);

    await row.getByRole('button', { name: `Open ${reference}`, exact: true }).click();
    await expect(page.getByText('Hi', { exact: true }).first()).toBeVisible();
    await expect(page.locator('#main script')).toHaveCount(0);
    await expect(page.locator('#main img[src*="evil.test"]')).toHaveCount(0);
    await expect(page.locator('#main a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('#main [onerror]')).toHaveCount(0);

    const status = page.getByRole('combobox', { name: 'Status', exact: true });
    await expect(status).toBeVisible();
    const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
    const note = `Checked the ledger ${rand()}`;
    await notes.fill(note);
    await status.selectOption('closed');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await inboxThread(request, ADMIN_USER, threadId)).thread).toMatchObject({ notes: note, status: 'closed' });

    const replyText = `We are on it ${rand()}`;
    await page.getByRole('textbox', { name: 'Reply', exact: true }).fill(replyText);
    await page.getByRole('button', { name: 'Send reply', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Reply sent.' })).toBeVisible();
    const sent = await emailsWhere(request, (e) => (e.text ?? '').includes(replyText));
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain(reference);
    expect(alerts, 'no script ran').toEqual([]);
  });

  test('"Show" filters complaints and emails', async ({ page, context, request }) => {
    const mail = await newThread(request);
    const posted = await postComplaint(request, validComplaint());
    const complaintRef = ((await posted.json()) as { reference: string }).reference;
    expect(complaintRef).toMatch(REFERENCE_IN_TEXT);

    await signIn(context, ADMIN_USER);
    await openGigs(page, '/admin/inbox', { signedIn: true });
    const table = page.getByRole('table');
    const open = (ref: string) => table.getByRole('button', { name: `Open ${ref}`, exact: true });
    await expect(open(mail.reference)).toBeVisible();
    await expect(open(complaintRef)).toBeVisible();

    const show = page.getByRole('combobox', { name: 'Show', exact: true });
    await show.selectOption({ label: 'Complaints' });
    await expect(open(complaintRef)).toBeVisible();
    await expect(open(mail.reference)).toHaveCount(0);

    await show.selectOption({ label: 'Emails' });
    await expect(open(mail.reference)).toBeVisible();
    await expect(open(complaintRef)).toHaveCount(0);

    await show.selectOption({ label: 'All' });
    await expect(open(mail.reference)).toBeVisible();
    await expect(open(complaintRef)).toBeVisible();
  });

  test('/admin/inbox?source=complaint shows only complaints', async ({ page, context, request }) => {
    const mail = await newThread(request);
    await signIn(context, ADMIN_USER);
    await openGigs(page, '/admin/inbox?source=complaint', { signedIn: true });
    await expect(page.getByRole('combobox', { name: 'Show', exact: true })).toHaveValue(/complaint/i);
    await expect(page.getByRole('button', { name: `Open ${mail.reference}`, exact: true })).toHaveCount(0);
  });
});
