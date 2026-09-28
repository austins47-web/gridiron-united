-- The roast's memory of the season, per league: storylines running across
-- weeks, running jokes, and its best recent lines. The roast writer reads
-- it and hands back an updated copy each week (send-reminders), so each
-- roast can make callbacks. Only the service role touches it.
create table if not exists public.league_roast_memory (
  league_id    uuid not null references public.leagues(id) on delete cascade,
  season       int not null,
  memory       jsonb not null,
  through_week int not null,
  updated_at   timestamptz not null default now(),
  primary key (league_id, season)
);
alter table public.league_roast_memory enable row level security;
