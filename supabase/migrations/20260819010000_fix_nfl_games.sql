-- ══════════════════════════════════════════════════════════════
-- Fix nfl_games: corrupted schedule + no way to keep it in sync
--
-- Investigation found nothing in the codebase writes to nfl_games —
-- it was seeded once, outside the app, with real errors mixed in:
-- teams appearing 2-3x in the same week (e.g. week 14 had the Rams
-- in three separate games), some weeks short 3-4 games, and week 18
-- missing entirely. Since nothing syncs this table, it also means
-- scores/status never update once real games are played — Pick'Em
-- grading would silently stay 0-0 all season.
--
-- Confirmed zero rows currently exist in pickem_picks, so nothing
-- references these game ids yet — safe to clear and rebuild from
-- ESPN's real schedule via the new sync-nfl-schedule function.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

-- A stable key so future syncs UPDATE existing rows (keeping their
-- uuid, and therefore any picks referencing them, intact) instead of
-- ever being able to insert a duplicate matchup again.
alter table public.nfl_games
  add column if not exists espn_event_id text;

create unique index if not exists nfl_games_espn_event_id_key
  on public.nfl_games (espn_event_id)
  where espn_event_id is not null;

-- Clear the corrupted seed data. Confirmed safe: 0 rows in
-- pickem_picks reference any of these ids.
delete from public.nfl_games where season = 2026;

comment on column public.nfl_games.espn_event_id is
  'ESPN scoreboard event id. Sync target for sync-nfl-schedule — upsert on this, never on team names, so a row''s uuid (and any picks against it) survives re-syncing.';
