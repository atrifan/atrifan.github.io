-- Legal: withdrawal consents, complaints and the support inbox.
--
-- purchase_consents: the EU right-of-withdrawal waiver (Directive 2011/83/EU art. 16(m)) a buyer
--   gives before a credit top-up, a subscription or a gig contract checkout. One row per consent,
--   with the terms version shown at the time. Written by src/lib/legal/consent-service.ts.
-- support_threads: one conversation with a customer. Complaint-form submissions (hub
--   /legal/complaints, POST /api/legal/complaints) are threads with source 'complaint'; inbound
--   email to the support address (Resend `email.received`, POST /api/webhooks/resend) opens a
--   thread with source 'email' unless it carries an existing reference (TZ-XXXX-XXXX) or replies
--   to a stored message. Admins work them at hub /admin/inbox.
-- support_messages: the messages of a thread: the form text, inbound emails (HTML sanitised
--   before storage) and admin replies.
-- Accessed server-side only (service role), so RLS is on with no policies.

create table if not exists purchase_consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,                                  -- Clerk user id
  purchase      text not null check (purchase in ('credits', 'subscription', 'gig_contract')),
  terms_version text not null check (length(terms_version) between 1 and 20),
  -- What was bought: the top-up amount, the contract total, or null for a subscription chosen in Clerk.
  amount_cents  integer check (amount_cents is null or amount_cents >= 0),
  currency      text check (currency is null or length(currency) = 3),
  reference     text check (reference is null or length(reference) <= 200),  -- contract id, bid id
  consent_text  text not null check (length(consent_text) between 1 and 1000),
  consented_at  timestamptz not null default now()
);

create index if not exists purchase_consents_user_idx on purchase_consents (user_id, consented_at desc);

alter table purchase_consents enable row level security;

create table if not exists support_threads (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique check (reference ~ '^TZ-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  source          text not null check (source in ('complaint', 'email')),
  category        text check (category is null or category in
                    ('payment_refund', 'gigs_dispute', 'marketplace_content', 'illegal_content', 'account', 'privacy', 'other')),
  subject         text not null check (length(subject) between 1 and 300),
  contact_name    text check (contact_name is null or length(contact_name) <= 200),
  contact_email   text not null check (length(contact_email) between 3 and 320),
  user_id         text,                                         -- Clerk user id when signed in
  related         text check (related is null or length(related) <= 500),  -- URL or contract id
  good_faith      boolean,                                      -- DSA art. 16(2)(d) statement
  ip_hash         text,                                         -- sha256, for the form's rate limit
  status          text not null default 'open' check (status in ('open', 'answered', 'closed')),
  notes           text not null default '' check (length(notes) <= 10000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_threads_recent_idx on support_threads (last_message_at desc);
create index if not exists support_threads_ip_idx on support_threads (ip_hash, created_at) where ip_hash is not null;

alter table support_threads enable row level security;

create table if not exists support_messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references support_threads (id) on delete cascade,
  direction       text not null check (direction in ('inbound', 'outbound')),
  from_address    text not null check (length(from_address) <= 500),
  to_addresses    text[] not null default '{}',
  subject         text not null default '' check (length(subject) <= 1000),
  text_body       text not null default '' check (length(text_body) <= 200000),
  html_body       text check (html_body is null or length(html_body) <= 500000),  -- sanitised
  message_id      text check (message_id is null or length(message_id) <= 1000),  -- RFC 5322 Message-ID
  in_reply_to     text check (in_reply_to is null or length(in_reply_to) <= 1000),
  resend_email_id text unique,                                  -- inbound: Resend's email id (idempotency)
  attachments     jsonb not null default '[]'::jsonb,           -- metadata only, never the content
  sent_by         text,                                         -- outbound: the admin's Clerk user id
  created_at      timestamptz not null default now()
);

create index if not exists support_messages_thread_idx on support_messages (thread_id, created_at);
create index if not exists support_messages_message_id_idx on support_messages (message_id) where message_id is not null;

alter table support_messages enable row level security;
