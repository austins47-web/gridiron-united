-- ══════════════════════════════════════════════════════════════
-- Conquest settles a week the moment its last game goes final
--
-- Until now only the hourly conquest-resolve cron (at :20) settled a
-- week, so a war could sit up to an hour after Monday night's final
-- whistle. Now a game going final (or called off) calls the conquest
-- function straight away when that leaves some war's next week with
-- every game done. sync-nfl-schedule writes scores every 2 minutes, so
-- a week settles within a couple of minutes of its last game.
--
-- The hourly cron stays as the backstop. Settling claims the week first
-- (last_resolved_week), so a second call, or two at once, does nothing.
-- pg_net only sends the request once this update commits, so the
-- function sees the final scores.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.conquest_settle_on_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.conquest_games cg
    WHERE cg.season = NEW.season
      AND coalesce(cg.last_resolved_week, cg.start_week - 1) + 1 = NEW.week
      AND NEW.week <= cg.final_week
  ) AND NOT EXISTS (
    SELECT 1 FROM public.nfl_games g
    WHERE g.season = NEW.season AND g.week = NEW.week
      AND lower(coalesce(g.status, '')) NOT LIKE '%final%'
      AND lower(coalesce(g.status, '')) <> 'post'
      AND lower(coalesce(g.status, '')) NOT LIKE '%postpon%'
      AND lower(coalesce(g.status, '')) NOT LIKE '%cancel%'
  ) THEN
    PERFORM net.http_post(
      url     := 'https://sxktvztljzxcmhezphsq.supabase.co/functions/v1/conquest',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_aoMzWXhZZnrOJYSJAOjMwQ_-HGrgotK'),
      body    := '{"action":"resolve"}'::jsonb,
      timeout_milliseconds := 30000
    );
  END IF;
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.conquest_settle_on_final() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS nfl_games_conquest_settle ON public.nfl_games;
CREATE TRIGGER nfl_games_conquest_settle
  AFTER UPDATE OF status ON public.nfl_games
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status AND (
      lower(coalesce(NEW.status, '')) LIKE '%final%'
      OR lower(coalesce(NEW.status, '')) = 'post'
      OR lower(coalesce(NEW.status, '')) LIKE '%postpon%'
      OR lower(coalesce(NEW.status, '')) LIKE '%cancel%'
    )
  )
  EXECUTE FUNCTION public.conquest_settle_on_final();
