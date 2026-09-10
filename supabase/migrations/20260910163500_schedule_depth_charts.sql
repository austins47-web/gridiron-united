-- Weekly NFL depth chart refresh, ahead of the projection/blend
-- pipeline each Tuesday (rosters/depth charts settle after the
-- weekend's games and injury designations). Scheduled between
-- sync-nfl-weekly (3:00) and sync-nfl-projections (3:15) so
-- depth_chart_rank is fresh before that runs, though the blend job
-- itself (every 2h) is what actually consumes it.
select cron.unschedule('sync-depth-charts') where exists (
  select 1 from cron.job where jobname = 'sync-depth-charts'
);

select cron.schedule(
  'sync-depth-charts',
  '5 3 * * 2',
  $$
  select net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/sync-depth-charts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body   := '{}'::jsonb
  );
  $$
);
