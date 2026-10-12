-- In-app notifications: the feed behind the header bell and hub /notifications.
--
-- enqueue() (src/lib/notify) stays the single entry point: every event writes one row here (unless
-- the user switched that group's in-app channel off) and one email outbox row in `notifications`.
-- Aggregated events (package_installed) keep one row per user, package and hour and bump `count`.
-- Accessed server-side only (service role), so RLS is on with no policies.

-- A preference row may now hold only one channel's choice: NULL means "the type's default".
alter table notification_preferences alter column email_enabled drop not null;
alter table notification_preferences alter column email_enabled drop default;
alter table notification_preferences add column if not exists inapp_enabled boolean;

create table if not exists user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,                       -- Clerk user id (the recipient)
  type        text not null,
  title       text not null check (length(title) between 1 and 300),
  body        text check (body is null or length(body) <= 1000),
  surface     text not null check (surface in ('hub', 'ai', 'marketplace', 'gigs', 'chat')),
  url         text not null check (url like '/%' and url not like '//%'),  -- path on `surface`
  payload     jsonb not null default '{}'::jsonb,
  dedupe_key  text not null unique,
  count       integer not null default 1 check (count >= 1),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()   -- last event; the feed is ordered by it
);

create index if not exists user_notifications_feed_idx
  on user_notifications (user_id, updated_at desc, id desc);

create index if not exists user_notifications_unread_idx
  on user_notifications (user_id)
  where read_at is null;

alter table user_notifications enable row level security;
