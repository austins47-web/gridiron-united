-- ══════════════════════════════════════════════════════════════
-- Schedule sync-odds
--
-- Runs every 2 hours. 2 calls per run × 12 runs/day = 24/day
-- = ~720/month against the 500/month free tier — still over, so
-- this defaults to every 3 hours instead (8 runs/day = 16 calls/day
-- = ~480/month, comfortably under quota with room for manual runs).
--
-- Odds barely move outside raid week / the hour before kickoff, so
-- this cadence is plenty fresh for a casual pick'em / fantasy app.
--
-- IMPORTANT: replace <ANON_KEY> below with your project's anon key
-- (Dashboard -> Project Settings -> API -> anon public key).
--
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ══════════════════════════════════════════════════════════════

create extension if not exists pg_cron  with schema pg_catalog;
create extension if not exists pg_net   with schema extensions;

select cron.unschedule('sync-odds')
 where exists (select 1 from cron.job where jobname = 'sync-odds');

select cron.schedule(
  'sync-odds',
  '0 */3 * * *',   -- every 3 hours, on the hour
  $$
  select net.http_post(
    url := 'https://sxktvztljzxcmhezphsq.supabase.co/functions/v1/sync-odds',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'apikey',        '<ANON_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000   -- learned this the hard way — see the detect-games incident
  );
  $$
);

-- Confirm
select jobid, jobname, schedule, active
  from cron.job
 where jobname = 'sync-odds';

-- ── After it's run at least once, verify the actual response ───
-- (pg_net queues the request async — job success ≠ request success,
-- same lesson as before. Check the real response, not just the job.)
--
--   select status_code, left(content, 300) as body, created
--     from net._http_response
--    where created > now() - interval '10 minutes'
--    order by created desc limit 5;
