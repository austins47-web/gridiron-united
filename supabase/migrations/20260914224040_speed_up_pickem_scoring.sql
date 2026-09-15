-- ══════════════════════════════════════════════════════════════
-- Pick'Em scores were up to 30 minutes stale after a game finalized
--
-- Pick'Em standings (src/components/pickem/standings.ts) are derived
-- straight from nfl_games.status/home_score/away_score — no trigger
-- or background job, just a read. That's fine, EXCEPT nfl_games is
-- only ever updated by the sync-nfl-schedule edge function, and that
-- was on a 30-minute cron (jobid 40). Meanwhile the fantasy-scoring
-- side (detect-games -> live_games, poll-live-stats -> live_player_
-- stats) already runs every minute. So a game going final would show
-- up in fantasy scoring almost instantly but could sit unscored in
-- Pick'Em for up to half an hour.
--
-- sync-nfl-schedule previously defaulted to refetching all 18 weeks
-- from ESPN on every run, which is why it wasn't already on a
-- 1-minute cadence — 18 ESPN requests a minute is wasteful and risks
-- the 30s pg_net timeout. The function (supabase/functions/
-- sync-nfl-schedule/index.ts) now defaults to a "light" mode: just
-- the current week + the previous one (same pair detect-games
-- checks, for the same reason — a late-running game can still be
-- live after ESPN's own current week rolls over). ?full=1 still does
-- the old all-18-weeks sync for manual backfills.
--
-- This migration just documents/reproduces the schedule change made
-- directly against the live cron job (jobid 40) via
-- `cron.alter_job`, matching the cadence detect-games/poll-live-stats
-- already run at. Safe to re-run.
--
-- Note: this project's net.http_post cron jobs are set up with a
-- literal project URL + publishable key (visible in cron.job.command
-- for detect-games/poll-live-stats/sync-nfl-schedule already) rather
-- than current_setting('app.supabase_url'/'app.service_role_key') —
-- those settings aren't actually configured on this database, so
-- migrations that reference them (e.g. schedule_depth_charts.sql)
-- don't reflect what's actually scheduled. This follows the pattern
-- that's actually live. The key below is the *publishable* anon key,
-- already committed in .env.local — not a secret.
-- ══════════════════════════════════════════════════════════════

select cron.unschedule('sync-nfl-schedule') where exists (
  select 1 from cron.job where jobname = 'sync-nfl-schedule'
);

select cron.schedule(
  'sync-nfl-schedule',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://sxktvztljzxcmhezphsq.supabase.co/functions/v1/sync-nfl-schedule',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_aoMzWXhZZnrOJYSJAOjMwQ_-HGrgotK',
      'apikey',        'sb_publishable_aoMzWXhZZnrOJYSJAOjMwQ_-HGrgotK'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
