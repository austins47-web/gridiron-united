-- ── Auto-sync player projections/ADP weekly via pg_cron ───────────
-- The live cron.job table has sync-nfl-weekly (rosters, Tue 3am) and
-- sync-cfb-projections (Tue 4am) already running, but nothing has
-- ever scheduled the NFL equivalent - the sync-nfl-projections Edge
-- Function has existed the whole time with nothing calling it,
-- which is the real reason proj_pts/avg_pts/adp have been empty for
-- almost every NFL player since launch. Scheduled 15 minutes after
-- the roster sync so it's working from that week's fresh roster.

select cron.unschedule('sync-nfl-projections') where exists (
  select 1 from cron.job where jobname = 'sync-nfl-projections'
);

select cron.schedule(
  'sync-nfl-projections',
  '15 3 * * 2',
  $$
  select net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/sync-nfl-projections',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body   := '{}'::jsonb
  );
  $$
);
