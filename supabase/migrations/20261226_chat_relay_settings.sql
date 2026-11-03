-- Chat relay v2: server-wide settings and the Supabase Realtime role the relay broker connects as.
--
-- chat_relay_settings: one row (id = 1) holding the three values the v2 relay needs. Written and read server-side
--   only (service role), so RLS is on with no policies and anon/authenticated have no grants. Managed from
--   hub /admin/relay (src/lib/chat-v2/relay-settings.ts); the CHAT_* environment variables are the per-field fallback.
-- tulzo_chat_broker: the role named in the broker JWT. It may only send and receive broadcasts on the private
--   `tc2:*` channels (one per device and per viewer stream), nothing else.

create table if not exists chat_relay_settings (
  id                smallint primary key default 1 check (id = 1),
  token_secret      text check (token_secret is null or length(token_secret) >= 32),
  realtime_anon_key text,
  broker_jwt        text,
  updated_at        timestamptz not null default now(),
  updated_by        text
);

alter table chat_relay_settings enable row level security;
revoke all on chat_relay_settings from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tulzo_chat_broker') then
    create role tulzo_chat_broker nologin noinherit;
  end if;
end
$$;

grant tulzo_chat_broker to authenticator;
grant usage on schema realtime to tulzo_chat_broker;
grant select, insert on realtime.messages to tulzo_chat_broker;

drop policy if exists tulzo_chat_broker_receive on realtime.messages;
create policy tulzo_chat_broker_receive on realtime.messages
  for select to tulzo_chat_broker
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'tc2:%');

drop policy if exists tulzo_chat_broker_send on realtime.messages;
create policy tulzo_chat_broker_send on realtime.messages
  for insert to tulzo_chat_broker
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'tc2:%');
