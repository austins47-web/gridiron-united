-- ══════════════════════════════════════════════════════════════
-- Reminders: per-user notification preferences + a send log
-- ══════════════════════════════════════════════════════════════

-- ── 1. Per-user, per-league notification preferences ──────────
create table if not exists public.notification_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  league_id    uuid references public.leagues(id) on delete cascade,
  -- null league_id = the user's global default

  -- Channels
  email_enabled boolean not null default true,
  sms_enabled   boolean not null default false,

  -- Which events they want
  notify_pickem_deadline boolean not null default true,
  notify_draft           boolean not null default true,
  notify_on_the_clock    boolean not null default true,
  notify_trades          boolean not null default true,
  notify_lineup          boolean not null default true,
  notify_weekly_recap    boolean not null default true,

  -- How early to warn, in hours (comma-free, simple ints)
  lead_hours_primary   smallint not null default 24,
  lead_hours_secondary smallint not null default 2,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, league_id)
);

create index if not exists notif_prefs_user_idx   on public.notification_preferences (user_id);
create index if not exists notif_prefs_league_idx on public.notification_preferences (league_id);

alter table public.notification_preferences enable row level security;

drop policy if exists "own prefs select" on public.notification_preferences;
create policy "own prefs select" on public.notification_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "own prefs insert" on public.notification_preferences;
create policy "own prefs insert" on public.notification_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "own prefs update" on public.notification_preferences;
create policy "own prefs update" on public.notification_preferences
  for update using (auth.uid() = user_id);

drop policy if exists "own prefs delete" on public.notification_preferences;
create policy "own prefs delete" on public.notification_preferences
  for delete using (auth.uid() = user_id);


-- ── 2. Send log — the idempotency guard ───────────────────────
-- One row per (user, league, event, dedupe_key). The unique index
-- is what stops the cron from sending the same reminder twice.
create table if not exists public.reminder_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  league_id   uuid references public.leagues(id) on delete cascade,
  event_type  text not null,
  -- Uniquely identifies this specific occurrence, e.g.
  -- 'pickem:2026:w3:24h' or 'trade:<uuid>:offer'
  dedupe_key  text not null,
  channel     text not null default 'email',
  status      text not null default 'sent',   -- sent | failed | skipped
  error       text,
  sent_at     timestamptz not null default now(),

  unique (user_id, dedupe_key, channel)
);

create index if not exists reminder_log_user_idx on public.reminder_log (user_id, sent_at desc);
create index if not exists reminder_log_sent_idx on public.reminder_log (sent_at desc);

alter table public.reminder_log enable row level security;

drop policy if exists "own log select" on public.reminder_log;
create policy "own log select" on public.reminder_log
  for select using (auth.uid() = user_id);


-- ── 3. Keep updated_at fresh ──────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists notif_prefs_touch on public.notification_preferences;
create trigger notif_prefs_touch
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();


-- ── 4. Resolve a user's effective prefs for a league ───────────
-- League-specific row wins; otherwise the user's global row;
-- otherwise sensible defaults.
create or replace function public.effective_notification_prefs(
  p_user_id uuid,
  p_league_id uuid
)
returns table (
  email_enabled boolean,
  sms_enabled boolean,
  notify_pickem_deadline boolean,
  notify_draft boolean,
  notify_on_the_clock boolean,
  notify_trades boolean,
  notify_lineup boolean,
  notify_weekly_recap boolean,
  lead_hours_primary smallint,
  lead_hours_secondary smallint
)
language sql stable as $$
  select
    coalesce(l.email_enabled,          g.email_enabled,          true),
    coalesce(l.sms_enabled,            g.sms_enabled,            false),
    coalesce(l.notify_pickem_deadline, g.notify_pickem_deadline, true),
    coalesce(l.notify_draft,           g.notify_draft,           true),
    coalesce(l.notify_on_the_clock,    g.notify_on_the_clock,    true),
    coalesce(l.notify_trades,          g.notify_trades,          true),
    coalesce(l.notify_lineup,          g.notify_lineup,          true),
    coalesce(l.notify_weekly_recap,    g.notify_weekly_recap,    true),
    coalesce(l.lead_hours_primary,     g.lead_hours_primary,     24::smallint),
    coalesce(l.lead_hours_secondary,   g.lead_hours_secondary,   2::smallint)
  from (select 1) x
  left join public.notification_preferences l
    on l.user_id = p_user_id and l.league_id = p_league_id
  left join public.notification_preferences g
    on g.user_id = p_user_id and g.league_id is null
$$;

comment on table public.notification_preferences is
  'Per-user notification settings. league_id null = global default for that user.';
comment on table public.reminder_log is
  'Idempotency guard + audit trail. dedupe_key makes each reminder occurrence unique per user.';


-- ── 5. Email lookup for the reminder engine ───────────────────
-- Emails live in auth.users, not profiles. This exposes just
-- (id, email) to the service role. Locked down from every other
-- role so it can't be called from the browser.
create or replace function public.user_emails()
returns table (id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email::text
  from auth.users u
  where u.email is not null
$$;

revoke all on function public.user_emails() from public;
revoke all on function public.user_emails() from anon;
revoke all on function public.user_emails() from authenticated;
grant execute on function public.user_emails() to service_role;

comment on function public.user_emails() is
  'Service-role only. Used by the send-reminders edge function to resolve recipient addresses.';
