import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { Webhook } from 'svix';
import { formToObject, type RecordedStripeRequest } from './fake-stripe';
import { auth, rand } from './gigs-ui';

/**
 * Helpers for the legal / support specs that run under the gigs runner (`npm run test:e2e:gigs`):
 * the fake Resend (RESEND_FAKE_URL), the fake Stripe (STRIPE_FAKE_URL), Svix-signed Resend
 * webhooks, and a bid acceptance that carries the withdrawal consent. Behaviour only.
 */

export const RESEND_FAKE_URL = process.env.RESEND_FAKE_URL ?? '';
export const STRIPE_FAKE_URL = process.env.STRIPE_FAKE_URL ?? '';
export const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? '';
export const LEGAL_CONTACT_EMAIL = process.env.LEGAL_CONTACT_EMAIL ?? 'support@tulzo.online';
export const SUPPORT_FORWARD_TO = process.env.SUPPORT_FORWARD_TO ?? 'forward@tulzo.test';
/** Always in the admin email list (forward targets). */
export const SEED_ADMIN_EMAIL = 'trifan.alex.criss@gmail.com';
export const LEGAL_ENV_MISSING = !process.env.RESEND_FAKE_URL || !process.env.JOBS_E2E_AUTH_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface SentEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  headers?: Record<string, string>;
}

/** A unique client IP so the per-IP complaint rate limit never leaks between tests. */
export function uniqueIp(): string {
  const b = () => Math.floor(Math.random() * 254) + 1;
  return `10.${b()}.${b()}.${b()}`;
}

export function replyTo(email: SentEmail): string[] {
  const r = email.reply_to;
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

/** Every email the app sent to the fake Resend so far (shared by every spec in the run). */
export async function sentEmails(request: APIRequestContext): Promise<SentEmail[]> {
  expect(RESEND_FAKE_URL, 'RESEND_FAKE_URL not set').not.toBe('');
  const res = await request.get(`${RESEND_FAKE_URL}/__sent`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { emails: SentEmail[] }).emails;
}

/** Sent emails matching `filter` (polls a little, since sending may finish after the response). */
export async function emailsWhere(
  request: APIRequestContext,
  filter: (e: SentEmail) => boolean,
  atLeast = 1,
  timeout = 10_000,
): Promise<SentEmail[]> {
  let found: SentEmail[] = [];
  await expect
    .poll(
      async () => {
        found = (await sentEmails(request)).filter(filter);
        return found.length;
      },
      { timeout },
    )
    .toBeGreaterThanOrEqual(atLeast);
  return found;
}

/** Waits `ms` and returns the matching emails (for "nothing was sent" assertions). */
export async function emailsAfterQuiet(request: APIRequestContext, filter: (e: SentEmail) => boolean, ms = 1500): Promise<SentEmail[]> {
  await new Promise((r) => setTimeout(r, ms));
  return (await sentEmails(request)).filter(filter);
}

export const mentions = (needle: string) => (e: SentEmail) =>
  e.subject.includes(needle) || (e.text ?? '').includes(needle) || (e.html ?? '').includes(needle);

// ---------------------------------------------------------------------------
// fake Stripe

export async function stripeRequests(request: APIRequestContext): Promise<RecordedStripeRequest[]> {
  expect(STRIPE_FAKE_URL, 'STRIPE_FAKE_URL not set').not.toBe('');
  const res = await request.get(`${STRIPE_FAKE_URL}/__requests`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { requests: RecordedStripeRequest[] }).requests;
}

/** Checkout session creations recorded by the fake, as nested objects. */
export async function checkoutSessionBodies(request: APIRequestContext): Promise<Json[]> {
  return (await stripeRequests(request))
    .filter((r) => r.method === 'POST' && r.path === '/v1/checkout/sessions')
    .map((r) => formToObject(r.form));
}

/** The Checkout session id in a fake checkout URL (https://checkout.stripe.com/c/pay/<id>). */
export function sessionIdFromUrl(url: string): string {
  const id = url.split('/').pop() ?? '';
  expect(id).toMatch(/^cs_/);
  return id;
}

export async function stripeSession(request: APIRequestContext, sessionId: string): Promise<Json> {
  const res = await request.get(`${STRIPE_FAKE_URL}/v1/checkout/sessions/${sessionId}`);
  expect(res.status()).toBe(200);
  return res.json();
}

// ---------------------------------------------------------------------------
// gigs: accept a bid with the withdrawal consent

export async function acceptBidWithConsent(
  request: APIRequestContext,
  userId: string,
  bidId: string,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: Json }> {
  const res = await request.post(`/api/bids/${bidId}/accept`, {
    headers: auth(userId),
    data: { withdrawal_consent: true, ...extra },
  });
  const text = await res.text();
  let body: Json = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status(), body };
}

// ---------------------------------------------------------------------------
// Resend inbound webhook

export interface InboundEmail {
  email_id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  message_id: string;
  headers: Record<string, string>;
  created_at: string;
}

export function inboundEmail(overrides: Partial<InboundEmail> = {}): InboundEmail {
  const id = overrides.email_id ?? `em_${randomUUID()}`;
  return {
    email_id: id,
    from: `Sam Sender <sam.${rand()}@example.test>`,
    to: [LEGAL_CONTACT_EMAIL],
    subject: `Question about my account ${rand()}`,
    text: 'Hello, I have a question about my invoice.',
    html: '<p>Hello, I have a question about my invoice.</p>',
    message_id: `<${randomUUID()}@mail.example.test>`,
    headers: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Register the full email on the fake (GET /emails/receiving/{id}). */
export async function registerReceived(request: APIRequestContext, email: InboundEmail): Promise<void> {
  const res = await request.post(`${RESEND_FAKE_URL}/__received`, {
    data: {
      id: email.email_id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      message_id: email.message_id,
      created_at: email.created_at,
    },
  });
  expect(res.status()).toBe(200);
}

export function receivedEvent(email: InboundEmail, type = 'email.received'): Json {
  return {
    type,
    created_at: email.created_at,
    data: {
      email_id: email.email_id,
      created_at: email.created_at,
      from: email.from,
      to: email.to,
      cc: [],
      bcc: [],
      message_id: email.message_id,
      subject: email.subject,
      attachments: [],
    },
  };
}

export function svixHeaders(payload: string, secret = RESEND_WEBHOOK_SECRET): Record<string, string> {
  const msgId = `msg_${randomUUID()}`;
  const now = new Date();
  return {
    'svix-id': msgId,
    'svix-timestamp': Math.floor(now.getTime() / 1000).toString(),
    'svix-signature': new Webhook(secret).sign(msgId, now, payload),
  };
}

export async function postResendWebhook(
  request: APIRequestContext,
  event: unknown,
  headers: Record<string, string> | 'signed' = 'signed',
): Promise<APIResponse> {
  const payload = JSON.stringify(event);
  const sig = headers === 'signed' ? svixHeaders(payload) : headers;
  return request.post('/api/webhooks/resend', {
    data: payload,
    headers: { 'content-type': 'application/json', ...sig },
  });
}

/** Register the email on the fake, then deliver a signed email.received event for it. */
export async function deliverInbound(request: APIRequestContext, email: InboundEmail): Promise<{ status: number; body: Json }> {
  await registerReceived(request, email);
  const res = await postResendWebhook(request, receivedEvent(email));
  return { status: res.status(), body: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// admin inbox API

export async function inboxThreads(request: APIRequestContext, userId: string, query = ''): Promise<Json[]> {
  const res = await request.get(`/api/admin/inbox${query}`, { headers: auth(userId) });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { threads: Json[] }).threads;
}

export async function inboxThread(request: APIRequestContext, userId: string, id: string): Promise<{ thread: Json; messages: Json[] }> {
  const res = await request.get(`/api/admin/inbox/${id}`, { headers: auth(userId) });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

export async function postComplaint(
  request: APIRequestContext,
  body: Record<string, unknown>,
  opts: { ip?: string; headers?: Record<string, string> } = {},
): Promise<APIResponse> {
  return request.post('/api/legal/complaints', {
    headers: { 'x-forwarded-for': opts.ip ?? uniqueIp(), ...(opts.headers ?? {}) },
    data: body,
  });
}

export function validComplaint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tag = rand();
  return {
    category: 'payment_refund',
    name: `Cara Complainant ${tag}`,
    email: `cara.${tag}@example.test`,
    related: 'https://tulzo.online/credits',
    message: `My top-up was charged twice (${tag}). Please refund the duplicate.`,
    ...overrides,
  };
}
