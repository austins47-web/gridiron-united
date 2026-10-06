-- Conquest: the league as a war over a hex map of the 32 NFL cities
-- (supabase/functions/_shared/conquest.ts has the rules). The conquest
-- edge function starts a war (the commissioner) and settles each
-- finished week; the app and the Shop TV read these and show the week's
-- battles live. Members read their league's war; only the server writes.

CREATE TABLE IF NOT EXISTS public.conquest_games (
  league_id          uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season             int  NOT NULL,
  start_week         int  NOT NULL,
  -- The last week settled (null: none yet)
  last_resolved_week int,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season)
);

CREATE TABLE IF NOT EXISTS public.conquest_players (
  league_id   uuid NOT NULL,
  season      int  NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  color       text NOT NULL,
  -- Their starting city, the one they can always rebel to retake
  capital     text,
  joined_week int  NOT NULL,
  PRIMARY KEY (league_id, season, user_id),
  FOREIGN KEY (league_id, season) REFERENCES public.conquest_games (league_id, season) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.conquest_territories (
  league_id  uuid NOT NULL,
  season     int  NOT NULL,
  team       text NOT NULL,
  owner_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  since_week int,
  PRIMARY KEY (league_id, season, team),
  FOREIGN KEY (league_id, season) REFERENCES public.conquest_games (league_id, season) ON DELETE CASCADE
);

-- The war log: every city that changed hands, and how
CREATE TABLE IF NOT EXISTS public.conquest_moves (
  id            bigserial PRIMARY KEY,
  league_id     uuid NOT NULL,
  season        int  NOT NULL,
  week          int  NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('capture', 'claim', 'rebellion')),
  team          text NOT NULL,
  from_user     uuid,
  to_user       uuid NOT NULL,
  score_for     numeric NOT NULL,
  score_against numeric NOT NULL,
  exiled        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (league_id, season) REFERENCES public.conquest_games (league_id, season) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conquest_moves_week ON public.conquest_moves (league_id, season, week);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conquest_games', 'conquest_players', 'conquest_territories', 'conquest_moves'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (league_id IN (SELECT public.get_my_league_ids()))', t || '_read', t);
  END LOOP;
END $$;

-- Settle finished weeks: once an hour, but only call the function when
-- some war's next week has actually finished (every game final or
-- called off), so it runs about once a week.
SELECT cron.unschedule('conquest-resolve') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conquest-resolve');
SELECT cron.schedule(
  'conquest-resolve',
  '20 * * * *',
  $cmd$
  select net.http_post(
    url     := 'https://sxktvztljzxcmhezphsq.supabase.co/functions/v1/conquest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_aoMzWXhZZnrOJYSJAOjMwQ_-HGrgotK'),
    body    := '{"action":"resolve"}'::jsonb,
    timeout_milliseconds := 30000
  )
  WHERE EXISTS (
    SELECT 1 FROM public.conquest_games cg
    WHERE EXISTS (
      SELECT 1 FROM public.nfl_games g
      WHERE g.season = cg.season AND g.week = coalesce(cg.last_resolved_week, cg.start_week - 1) + 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.nfl_games g
      WHERE g.season = cg.season AND g.week = coalesce(cg.last_resolved_week, cg.start_week - 1) + 1
        AND lower(coalesce(g.status, '')) NOT LIKE '%final%'
        AND lower(coalesce(g.status, '')) <> 'post'
        AND lower(coalesce(g.status, '')) NOT LIKE '%postpon%'
        AND lower(coalesce(g.status, '')) NOT LIKE '%cancel%'
    )
  );
  $cmd$
);

-- The TV remote's Map button: the war map full screen on the Shop TV
CREATE OR REPLACE FUNCTION public.tv_remote(p_league uuid, p_action text, p_text text DEFAULT NULL, p_moment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token   text;
  v_payload jsonb;
BEGIN
  IF NOT is_league_commissioner(p_league) THEN
    RAISE EXCEPTION 'Only the commissioner can use the TV remote';
  END IF;
  IF p_action NOT IN ('roast', 'standings', 'board', 'replay', 'chat', 'map', 'sleep', 'announce', 'moment', 'clear', 'reload') THEN
    RAISE EXCEPTION 'Unknown TV remote button';
  END IF;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = p_league;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'This league has no Shop TV set up';
  END IF;

  v_payload := jsonb_build_object('action', p_action);
  IF p_action = 'announce' THEN
    IF coalesce(char_length(trim(p_text)), 0) = 0 THEN
      RAISE EXCEPTION 'Type the announcement first';
    END IF;
    v_payload := v_payload || jsonb_build_object('text', left(trim(p_text), 140));
  ELSIF p_action = 'moment' THEN
    IF p_moment IS NULL OR p_moment NOT IN ('bats', 'ghost', 'sleigh', 'turkey', 'fireworks', 'flyover', 'football', 'spotlight') THEN
      RAISE EXCEPTION 'Unknown moment';
    END IF;
    v_payload := v_payload || jsonb_build_object('moment', p_moment);
  END IF;

  PERFORM tv_broadcast(v_token, 'remote', v_payload);
END;
$$;
