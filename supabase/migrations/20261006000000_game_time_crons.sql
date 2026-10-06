-- Supabase usage: the live-game jobs only run around games, finished
-- games stop being re-read, and the cron log stops growing forever.

-- A final game's box score has been read (poll-live-stats). Without
-- this it re-read 30 finished games every 2 minutes, around the clock.
ALTER TABLE public.live_games ADD COLUMN IF NOT EXISTS stats_final_at timestamptz;

UPDATE public.live_games g
SET stats_final_at = now()
WHERE g.status = 'final'
  AND g.stats_final_at IS NULL
  AND EXISTS (SELECT 1 FROM public.live_player_stats s WHERE s.game_id = g.game_id);

-- Whether a game-time cron job has anything to do right now. Most of
-- the week no game is on, so these jobs skip their function call
-- unless this says so.
CREATE OR REPLACE FUNCTION public.game_time(p_job text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p_job
    -- Box scores: a game on, or a final one whose box score isn't read yet
    WHEN 'poll-live-stats' THEN EXISTS (
      SELECT 1 FROM live_games
      WHERE status = 'in_progress'
         OR (status = 'final' AND stats_final_at IS NULL AND start_time > now() - interval '2 days')
    )
    -- NFL and college scoreboards: a game on, or one due to start
    WHEN 'detect-games' THEN EXISTS (
      SELECT 1 FROM live_games
      WHERE status = 'in_progress'
         OR (status = 'scheduled' AND start_time BETWEEN now() - interval '6 hours' AND now() + interval '10 minutes')
    )
    -- Pick'Em scores: an NFL game that's started (or about to) and isn't final
    WHEN 'sync-nfl-schedule' THEN EXISTS (
      SELECT 1 FROM nfl_games
      WHERE status IN ('scheduled', 'in_progress')
        AND game_date BETWEEN now() - interval '8 hours' AND now() + interval '10 minutes'
    )
    -- Live Pick'Em alerts, from the hour before a kickoff (the
    -- "who to root for" alert) until the game is final
    WHEN 'send-reminders-live' THEN EXISTS (
      SELECT 1 FROM nfl_games
      WHERE status IN ('scheduled', 'in_progress')
        AND game_date BETWEEN now() - interval '8 hours' AND now() + interval '75 minutes'
    )
    ELSE true
  END
$$;

REVOKE ALL ON FUNCTION public.game_time(text) FROM PUBLIC, anon, authenticated;

-- Each job keeps its URL and key (built from its existing command, so
-- the key never lands in this file) and only fires when game_time()
-- says so. detect-games and sync-nfl-schedule also fire at the top of
-- every hour, to pick up a new week's games, line moves and schedule
-- changes. (SELECT … WHERE false never evaluates the http_post.)
DO $$
DECLARE
  j record;
  cond text;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE jobname IN ('poll-live-stats', 'detect-games', 'sync-nfl-schedule', 'send-reminders-live')
      AND command NOT LIKE '%game_time(%'
  LOOP
    cond := format('public.game_time(%L)', j.jobname);
    IF j.jobname IN ('detect-games', 'sync-nfl-schedule') THEN
      cond := cond || ' OR extract(minute FROM now()) < 2';
    END IF;
    PERFORM cron.alter_job(
      j.jobid,
      command := regexp_replace(j.command, ';\s*$', '') || E'\n  WHERE ' || cond || ';'
    );
  END LOOP;
END $$;

-- pg_cron logs every run and never clears it: 137 MB of the 177 MB
-- database by October. Keep three days.
SELECT cron.schedule(
  'purge-cron-history',
  '17 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$
);

DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';
