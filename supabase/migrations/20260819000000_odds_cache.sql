-- ══════════════════════════════════════════════════════════════
-- Odds cache
--
-- The client used to call The Odds API directly from the browser,
-- once per open tab, every 10-30 minutes. On a 500-request/month
-- free tier that scales with concurrent users, not with time —
-- a handful of people leaving the site open exhausts the quota in
-- days. This table lets ONE scheduled function fetch odds on a
-- fixed cadence regardless of how many people are looking at the
-- site, and every client reads from here instead.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.odds_cache (
  game_key      text primary key,   -- "AWAY@HOME", matches useNflOdds' existing key shape
  league        text not null check (league in ('NFL', 'CFB')),
  home_team     text not null,
  away_team     text not null,
  spread        numeric,
  home_win_pct  smallint,
  away_win_pct  smallint,
  home_moneyline integer,
  away_moneyline integer,
  updated_at    timestamptz not null default now()
);

create index if not exists odds_cache_league_idx on public.odds_cache (league);

alter table public.odds_cache enable row level security;

-- Reference data — everyone reads, only the service role writes.
drop policy if exists "odds cache is readable" on public.odds_cache;
create policy "odds cache is readable"
  on public.odds_cache for select
  using (true);

comment on table public.odds_cache is
  'Odds fetched on a schedule by sync-odds. Clients read this instead of calling The Odds API directly, so usage is fixed regardless of concurrent users.';
