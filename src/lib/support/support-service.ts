/**
 * The support inbox: complaint-form submissions and email to the support address, one thread per
 * conversation (`support_threads` / `support_messages`, supabase/migrations/20261225_legal_complaints.sql).
 * Server-only (service role). Admins work it at hub /admin/inbox.
 *
 *  - submitComplaint: the hub /legal/complaints form. Stores a `complaint` thread, emails it to
 *    LEGAL_CONTACT_EMAIL (reply-to the complainant), confirms to the complainant with the
 *    reference, and notifies admins in-app.
 *  - receiveInboundEmail: Resend's `email.received` webhook. The webhook carries metadata only,
 *    so the full message comes from GET /emails/receiving/{id}. It joins the thread whose
 *    reference is in the subject/body, or whose message it replies to (In-Reply-To/References),
 *    else opens an `email` thread. HTML is sanitised before storage. A copy goes to every admin
 *    email (src/lib/admin.ts) and SUPPORT_FORWARD_TO, reply-to the sender.
 *  - replyToThread: an admin's answer, sent from LEGAL_CONTACT_EMAIL with In-Reply-To/References
 *    so mail clients keep the thread together, and the reference in the subject.
 *
 * Email goes straight through Resend (src/lib/notify/transport.ts), not the notify outbox: the
 * recipients are addresses, not users. A failed confirmation or forward is logged, never lost
 * data: the thread is stored first.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { jobsDb } from '@/src/lib/jobs/db';
import { JobsError, dbError, isUniqueViolation } from '@/src/lib/jobs/errors';
import { getAdminEmails } from '@/src/lib/admin';
import { adminUserIdsForNotify, notifySafe } from '@/src/lib/qa/qa-data';
import { createResendTransport, resendApiBase, type EmailMessage } from '@/src/lib/notify/transport';
import { contactEmailFrom, COMPLAINT_RESPONSE_DAYS } from '@/src/lib/legal/facts';
import { CATEGORY_LABELS, rateLimitDecision, type ComplaintInput } from './complaint';
import { findReference, referenceFromBytes, replySubject, subjectWithReference } from './reference';
import { htmlToText, sanitizeHtml } from './sanitize-html';
import { headerValue, messageIdsIn, parseAddress, replyHeaders } from './mail-headers';

export type ThreadStatus = 'open' | 'answered' | 'closed';
export type ThreadSource = 'complaint' | 'email';

export interface ThreadRow {
  id: string;
  reference: string;
  source: ThreadSource;
  category: string | null;
  subject: string;
  contact_name: string | null;
  contact_email: string;
  user_id: string | null;
  related: string | null;
  good_faith: boolean | null;
  status: ThreadStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  from_address: string;
  to_addresses: string[];
  subject: string;
  text_body: string;
  html_body: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  resend_email_id: string | null;
  attachments: unknown;
  sent_by: string | null;
  created_at: string;
}

const THREAD_COLUMNS =
  'id, reference, source, category, subject, contact_name, contact_email, user_id, related, good_faith, status, notes, created_at, updated_at, last_message_at';

export class SupportMisconfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured`);
    this.name = 'SupportMisconfiguredError';
  }
}

export class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate limited');
    this.name = 'RateLimitedError';
  }
}

// ── config and mail ─────────────────────────────────────────────────────────

/** LEGAL_CONTACT_EMAIL, or throws (routes answer 500 server_misconfigured). */
export function supportAddress(env: Record<string, string | undefined> = process.env): string {
  const address = contactEmailFrom(env);
  if (!address) throw new SupportMisconfiguredError('LEGAL_CONTACT_EMAIL');
  return address;
}

const fromHeader = (address: string) => `Tulzo Support <${address}>`;

/** Forward targets: every admin email plus SUPPORT_FORWARD_TO (comma-separated), never the support address itself. */
export function forwardTargets(env: Record<string, string | undefined> = process.env): string[] {
  const support = contactEmailFrom(env)?.toLowerCase();
  const extra = (env.SUPPORT_FORWARD_TO ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...getAdminEmails(), ...extra])).filter((e) => e !== support);
}

async function sendMail(message: Omit<EmailMessage, 'from' | 'headers'> & { from?: string; headers?: Record<string, string> }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[support] RESEND_API_KEY is not configured; email not sent:', message.subject);
    return false;
  }
  try {
    await createResendTransport(apiKey).send({
      ...message,
      from: message.from ?? fromHeader(supportAddress()),
      headers: message.headers ?? {},
    });
    return true;
  } catch (err) {
    console.error('[support] email failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textToHtml = (s: string) => `<div style="white-space:pre-wrap;font-family:sans-serif">${escape(s)}</div>`;

async function notifyAdmins(type: 'support_complaint_received' | 'support_email_received', payload: Record<string, string>, key: string) {
  let admins: string[] = [];
  try {
    admins = await adminUserIdsForNotify();
  } catch (err) {
    console.error('[support] admin lookup failed:', err instanceof Error ? err.message : String(err));
  }
  for (const admin of admins) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await notifySafe(admin, type, payload as any, `${key}:admin:${admin}`);
  }
}

// ── threads ─────────────────────────────────────────────────────────────────

async function insertThread(row: Omit<Partial<ThreadRow>, 'id' | 'reference'> & { ip_hash?: string | null }): Promise<ThreadRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = referenceFromBytes(randomBytes(8));
    const { data, error } = await jobsDb().from('support_threads').insert({ ...row, reference }).select(THREAD_COLUMNS).single();
    if (!error && data) return data as ThreadRow;
    if (!isUniqueViolation(error)) throw dbError(error ?? {}, 'create support thread');
  }
  throw new JobsError('db_error', 500, 'Could not allocate a reference');
}

async function insertMessage(row: Partial<MessageRow>): Promise<MessageRow | null> {
  const { data, error } = await jobsDb().from('support_messages').insert(row).select('*').single();
  if (error) {
    if (isUniqueViolation(error)) return null;
    throw dbError(error, 'store support message');
  }
  return data as MessageRow;
}

async function touchThread(id: string, patch: Partial<ThreadRow>): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await jobsDb().from('support_threads').update({ ...patch, updated_at: now }).eq('id', id);
  if (error) throw dbError(error, 'update support thread');
}

export const ipHash = (ip: string) => createHash('sha256').update(`tulzo-complaint:${ip}`).digest('hex');

function complaintText(input: ComplaintInput, reference: string): string {
  return [
    `Reference: ${reference}`,
    `Category: ${CATEGORY_LABELS[input.category]}`,
    `From: ${input.name} <${input.email}>`,
    input.related ? `Related: ${input.related}` : null,
    input.category === 'illegal_content' ? `Good-faith statement: ${input.goodFaith ? 'confirmed' : 'not given'}` : null,
    '',
    input.message,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export async function submitComplaint({
  input,
  userId,
  ip,
  now = new Date(),
}: {
  input: ComplaintInput;
  userId: string | null;
  ip: string | null;
  now?: Date;
}): Promise<{ reference: string; threadId: string }> {
  const support = supportAddress();
  const hash = ip ? ipHash(ip) : null;
  if (hash) {
    const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data, error } = await jobsDb().from('support_threads').select('created_at').eq('ip_hash', hash).gt('created_at', since);
    if (error) throw dbError(error, 'complaint rate limit');
    const decision = rateLimitDecision(((data ?? []) as Array<{ created_at: string }>).map((r) => r.created_at), now);
    if (!decision.allowed) throw new RateLimitedError(decision.retryAfterSeconds);
  }

  const label = CATEGORY_LABELS[input.category];
  const thread = await insertThread({
    source: 'complaint',
    category: input.category,
    subject: `${label}: ${input.name}`.slice(0, 300),
    contact_name: input.name,
    contact_email: input.email.toLowerCase(),
    user_id: userId,
    related: input.related,
    good_faith: input.category === 'illegal_content' ? input.goodFaith : null,
    ip_hash: hash,
  });
  const text = complaintText(input, thread.reference);
  await insertMessage({
    thread_id: thread.id,
    direction: 'inbound',
    from_address: input.email.toLowerCase(),
    to_addresses: [support],
    subject: thread.subject,
    text_body: text,
    html_body: null,
  });

  await sendMail({
    to: support,
    replyTo: input.email,
    subject: `[${thread.reference}] ${label}: ${input.name}`,
    text,
    html: textToHtml(text),
    idempotencyKey: `complaint-${thread.id}`,
  });
  const confirmation = [
    `Hello ${input.name},`,
    '',
    `We received your ${input.category === 'illegal_content' ? 'notice' : 'message'}. Your reference is ${thread.reference}.`,
    `We aim to reply within ${COMPLAINT_RESPONSE_DAYS} days. To add anything, reply to this email and keep the reference in the subject.`,
    '',
    'What you sent:',
    text,
    '',
    'Tulzo',
  ].join('\n');
  await sendMail({
    to: input.email,
    subject: subjectWithReference('We received your message', thread.reference),
    text: confirmation,
    html: textToHtml(confirmation),
    idempotencyKey: `complaint-confirm-${thread.id}`,
  });
  await notifyAdmins('support_complaint_received', { threadId: thread.id, reference: thread.reference, category: label, fromName: input.name }, `support_complaint:${thread.id}`);
  return { reference: thread.reference, threadId: thread.id };
}

// ── inbound email ───────────────────────────────────────────────────────────

export interface ReceivedEmailEvent {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    message_id?: string;
    attachments?: Array<Record<string, unknown>>;
  };
}

interface ReceivedEmail {
  id: string;
  from?: string;
  to?: string[];
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string> | null;
  message_id?: string | null;
  attachments?: Array<Record<string, unknown>>;
  created_at?: string;
}

async function fetchReceivedEmail(id: string): Promise<ReceivedEmail> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new SupportMisconfiguredError('RESEND_API_KEY');
  const res = await fetch(`${resendApiBase()}/emails/receiving/${encodeURIComponent(id)}?html_format=cid`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new JobsError('email_failed', 502, `Resend returned ${res.status} for the received email`);
  return (await res.json()) as ReceivedEmail;
}

async function threadByReference(reference: string): Promise<ThreadRow | null> {
  const { data, error } = await jobsDb().from('support_threads').select(THREAD_COLUMNS).eq('reference', reference).maybeSingle();
  if (error) throw dbError(error, 'find thread by reference');
  return (data as ThreadRow | null) ?? null;
}

async function threadByMessageIds(ids: string[]): Promise<ThreadRow | null> {
  if (ids.length === 0) return null;
  const { data, error } = await jobsDb().from('support_messages').select('thread_id').in('message_id', ids).limit(1);
  if (error) throw dbError(error, 'find thread by message id');
  const threadId = (data as Array<{ thread_id: string }> | null)?.[0]?.thread_id;
  if (!threadId) return null;
  const { data: t, error: tErr } = await jobsDb().from('support_threads').select(THREAD_COLUMNS).eq('id', threadId).maybeSingle();
  if (tErr) throw dbError(tErr, 'load thread');
  return (t as ThreadRow | null) ?? null;
}

export type InboundResult =
  | { ok: true; ignored: true }
  | { ok: true; duplicate: true }
  | { ok: true; thread_id: string; reference: string };

export async function receiveInboundEmail(event: ReceivedEmailEvent): Promise<InboundResult> {
  if (event.type !== 'email.received') return { ok: true, ignored: true };
  const emailId = event.data?.email_id;
  if (!emailId) throw new JobsError('invalid_request', 400, 'email.received without data.email_id');
  const support = supportAddress();

  const { data: seen, error: seenErr } = await jobsDb().from('support_messages').select('id').eq('resend_email_id', emailId).maybeSingle();
  if (seenErr) throw dbError(seenErr, 'check inbound email');
  if (seen) return { ok: true, duplicate: true };

  const email = await fetchReceivedEmail(emailId);
  const sender = parseAddress(email.from ?? event.data?.from);
  // Our own outgoing mail coming back (e.g. a forward loop) is not a new message.
  if (sender.address === support.toLowerCase()) return { ok: true, ignored: true };
  const subject = (email.subject ?? event.data?.subject ?? '').trim() || '(no subject)';
  const html = email.html ? sanitizeHtml(email.html) : null;
  const text = (email.text ?? '').trim() || htmlToText(email.html);
  const messageId = email.message_id ?? event.data?.message_id ?? headerValue(email.headers, 'message-id');
  const inReplyTo = headerValue(email.headers, 'in-reply-to');
  const replyIds = [...messageIdsIn(inReplyTo), ...messageIdsIn(headerValue(email.headers, 'references'))];

  const reference = findReference(subject, text);
  let thread = (reference ? await threadByReference(reference) : null) ?? (await threadByMessageIds(replyIds));
  if (!thread) {
    thread = await insertThread({
      source: 'email',
      category: null,
      subject: subject.slice(0, 300),
      contact_name: sender.name,
      contact_email: sender.address,
    });
  }

  const stored = await insertMessage({
    thread_id: thread.id,
    direction: 'inbound',
    from_address: sender.address,
    to_addresses: email.to ?? event.data?.to ?? [],
    subject: subject.slice(0, 1000),
    text_body: text.slice(0, 200_000),
    html_body: html ? html.slice(0, 500_000) : null,
    message_id: messageId,
    in_reply_to: inReplyTo,
    resend_email_id: emailId,
    attachments: (email.attachments ?? event.data?.attachments ?? []).map((a) => ({
      filename: a.filename ?? null,
      content_type: a.content_type ?? null,
      size: a.size ?? null,
    })),
  });
  if (!stored) return { ok: true, duplicate: true };
  await touchThread(thread.id, { status: 'open', last_message_at: new Date().toISOString() });

  const forwardText = [
    `From: ${email.from ?? sender.address}`,
    `To: ${(email.to ?? []).join(', ')}`,
    `Subject: ${subject}`,
    `Reference: ${thread.reference}`,
    '',
    text,
  ].join('\n');
  for (const to of forwardTargets()) {
    await sendMail({
      to,
      replyTo: sender.address,
      subject: `[${thread.reference}] Fwd: ${subject}`.slice(0, 900),
      text: forwardText,
      html: `${textToHtml(forwardText.split('\n\n')[0])}<hr>${html ?? textToHtml(text)}`,
      idempotencyKey: `forward-${emailId}-${to}`,
    });
  }
  await notifyAdmins(
    'support_email_received',
    { threadId: thread.id, reference: thread.reference, fromAddress: sender.address.slice(0, 500), subject: subject.slice(0, 300) },
    `support_email:${emailId}`,
  );
  return { ok: true, thread_id: thread.id, reference: thread.reference };
}

// ── admin ───────────────────────────────────────────────────────────────────

export interface ThreadSummary extends ThreadRow {
  message_count: number;
}

export async function listThreads(filter: { source?: ThreadSource; status?: ThreadStatus } = {}): Promise<ThreadSummary[]> {
  let q = jobsDb().from('support_threads').select(`${THREAD_COLUMNS}, support_messages(count)`).order('last_message_at', { ascending: false }).limit(200);
  if (filter.source) q = q.eq('source', filter.source);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw dbError(error, 'list support threads');
  return ((data ?? []) as Array<ThreadRow & { support_messages?: Array<{ count: number }> }>).map(({ support_messages, ...t }) => ({
    ...t,
    message_count: support_messages?.[0]?.count ?? 0,
  }));
}

async function loadThread(id: string): Promise<ThreadRow> {
  const { data, error } = await jobsDb().from('support_threads').select(THREAD_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'load support thread');
  if (!data) throw new JobsError('not_found', 404, 'Thread not found');
  return data as ThreadRow;
}

async function loadMessages(threadId: string): Promise<MessageRow[]> {
  const { data, error } = await jobsDb().from('support_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true });
  if (error) throw dbError(error, 'load support messages');
  return (data ?? []) as MessageRow[];
}

export interface MessageView {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  message_id: string | null;
  attachments: unknown;
  created_at: string;
}

const view = (m: MessageRow): MessageView => ({
  id: m.id,
  direction: m.direction,
  from: m.from_address,
  to: m.to_addresses,
  subject: m.subject,
  text: m.text_body,
  // Sanitised on the way in; sanitised again on the way out in case of rows from older code.
  html: m.html_body ? sanitizeHtml(m.html_body) : null,
  message_id: m.message_id,
  attachments: m.attachments,
  created_at: m.created_at,
});

export async function getThread(id: string): Promise<{ thread: ThreadRow; messages: MessageView[] }> {
  const thread = await loadThread(id);
  return { thread, messages: (await loadMessages(id)).map(view) };
}

export async function updateThread(id: string, patch: { status?: ThreadStatus; notes?: string }): Promise<ThreadRow> {
  await loadThread(id);
  await touchThread(id, patch);
  return loadThread(id);
}

export async function replyToThread(adminUserId: string, id: string, text: string): Promise<MessageView> {
  const body = text.trim();
  if (!body) throw new JobsError('invalid_request', 400, 'Write a reply first');
  if (body.length > 20_000) throw new JobsError('invalid_request', 400, 'The reply is too long');
  const support = supportAddress();
  const thread = await loadThread(id);
  const messages = await loadMessages(id);
  const lastSubject = [...messages].reverse().find((m) => m.direction === 'inbound')?.subject ?? thread.subject;
  const subject = replySubject(lastSubject, thread.reference);
  const domain = support.split('@')[1];
  const messageId = `<${randomUUID()}@${domain}>`;
  const headers: Record<string, string> = { ...replyHeaders(messages), 'Message-ID': messageId };
  const sent = await sendMail({ to: thread.contact_email, subject, text: body, html: textToHtml(body), headers, idempotencyKey: `reply-${messageId}` });
  if (!sent) throw new JobsError('email_failed', 502, 'The reply could not be sent');
  const stored = await insertMessage({
    thread_id: id,
    direction: 'outbound',
    from_address: support,
    to_addresses: [thread.contact_email],
    subject,
    text_body: body,
    html_body: null,
    message_id: messageId,
    in_reply_to: headers['In-Reply-To'] ?? null,
    sent_by: adminUserId,
  });
  await touchThread(id, { status: 'answered', last_message_at: new Date().toISOString() });
  return view(stored as MessageRow);
}
