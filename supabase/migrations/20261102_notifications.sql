-- Email notifications: contacts synced from Clerk, per-type preferences, and an outbox.
-- Accessed server-side only (service role / postgres), so RLS is on with no policies.

create table if not exists user_contacts (
  user_id        text primary key,                 -- Clerk user id
  email          text,
  name           text,
  locale         text,
  email_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists notification_preferences (
  id            bigint generated always as identity primary key,
  user_id       text not null,
  type          text not null,
  email_enabled boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, type)
);

create table if not exists notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  type                text not null,
  payload             jsonb not null default '{}'::jsonb,
  dedupe_key          text not null unique,
  status              text not null default 'queued'
                      check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts            integer not null default 0,
  last_error          text,
  -- Earliest time a worker may pick the row up: retry backoff and the in-flight lease.
  next_attempt_at     timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  provider_message_id text
);

create index if not exists notifications_due_idx
  on notifications (next_attempt_at, created_at)
  where status = 'queued';

create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

alter table user_contacts enable row level security;
alter table notification_preferences enable row level security;
alter table notifications enable row level security;
