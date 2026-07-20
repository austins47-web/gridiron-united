-- ── Auto-sync players weekly via pg_cron ──────────────────────────
-- Runs every Tuesday at 03:00 UTC (after Monday Night Football ends
-- and SportsDataIO projections update for the new week).
-- Calls the sync-players Edge Function which pulls NFL + CFB players
-- and their projections directly from SportsDataIO.

-- Enable pg_cron extension (already enabled on Supabase Pro/Team,
-- requires enabling in Dashboard → Extensions on Free tier)
create extension if not exists pg_cron;

-- Remove any existing sync job
select cron.unschedule('sync-players-weekly') where exists (
  select 1 from cron.job where jobname = 'sync-players-weekly'
);

-- Schedule: every Tuesday at 03:00 UTC
select cron.schedule(
  'sync-players-weekly',
  '0 3 * * 2',
  $$
  select net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/sync-players?season=2026&week=' ||
              -- Compute current NFL week: season starts ~Sept 4, each week is 7 days
              greatest(1, least(18, floor((extract(epoch from now()) - extract(epoch from '2026-09-04'::date)) / 604800)::int + 1))::text,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body   := '{}'::jsonb
  );
  $$
);
