-- Autopilot picks, nudges, flip-flops, badge flair and the problem log.

-- ── Picks: autopilot and switches ────────────────────────────────
ALTER TABLE public.pickem_picks
  ADD COLUMN IF NOT EXISTS auto            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiebreaker_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS switched_from   text;

-- picked_at and spread_at_pick as before (the time and line of the
-- latest pick or switch). Also:
--   switched_from    the team picked before the latest switch. Not set
--                    when replacing an autopilot pick: that isn't a flip-flop.
--   auto             an autopilot pick (send-reminders). Changing the
--                    team makes it the person's own.
--   tiebreaker_auto  an autopilot tiebreaker guess. A page loaded before
--                    autopilot filled it re-saves the pick without a
--                    guess; that never wipes it.
-- Only the server (service role, or the database itself) can mark
-- anything as autopilot, and nobody can write switched_from directly.
CREATE OR REPLACE FUNCTION public.pickem_pick_track()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trusted boolean := coalesce(auth.role(), 'service_role') = 'service_role';
BEGIN
  IF NOT trusted THEN
    NEW.auto            := CASE WHEN TG_OP = 'UPDATE' THEN OLD.auto ELSE false END;
    NEW.tiebreaker_auto := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tiebreaker_auto ELSE false END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.picked_at := now();
    NEW.spread_at_pick := (SELECT g.spread FROM public.nfl_games g WHERE g.id = NEW.game_id);
    NEW.switched_from := NULL;
  ELSIF NEW.picked_team IS DISTINCT FROM OLD.picked_team THEN
    NEW.picked_at := now();
    NEW.spread_at_pick := (SELECT g.spread FROM public.nfl_games g WHERE g.id = NEW.game_id);
    NEW.switched_from := CASE WHEN OLD.auto THEN NULL ELSE OLD.picked_team END;
    NEW.auto := false;
  ELSE
    NEW.picked_at := OLD.picked_at;
    NEW.spread_at_pick := OLD.spread_at_pick;
    NEW.switched_from := OLD.switched_from;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.tiebreaker_auto AND NEW.tiebreaker_score IS NULL THEN
      NEW.tiebreaker_score := OLD.tiebreaker_score;
      NEW.tiebreaker_auto := true;
    ELSIF NEW.tiebreaker_score IS DISTINCT FROM OLD.tiebreaker_score AND NOT trusted THEN
      NEW.tiebreaker_auto := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Autopilot: each member's backup rule, per league ─────────────
-- send-reminders fills any game a member hasn't picked as it locks,
-- by this rule, but only if the rule was set before that lock.
CREATE TABLE IF NOT EXISTS public.pickem_autopilot (
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule       text NOT NULL CHECK (rule IN ('favorites', 'home', 'majority')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

-- The time it was set is the server's, so a rule can't be backdated
-- to before a game that's already being played
CREATE OR REPLACE FUNCTION public.pickem_autopilot_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pickem_autopilot_stamp ON public.pickem_autopilot;
CREATE TRIGGER pickem_autopilot_stamp
  BEFORE INSERT OR UPDATE ON public.pickem_autopilot
  FOR EACH ROW EXECUTE FUNCTION public.pickem_autopilot_stamp();

ALTER TABLE public.pickem_autopilot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pickem_autopilot_own ON public.pickem_autopilot;
CREATE POLICY pickem_autopilot_own ON public.pickem_autopilot FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND league_id IN (SELECT public.get_my_league_ids()));

-- ── Nudges: written by the pickem-nudge function ─────────────────
CREATE TABLE IF NOT EXISTS public.pickem_nudges (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nudger_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season     int  NOT NULL,
  week       int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickem_nudges_league_idx ON public.pickem_nudges (league_id, created_at DESC);

ALTER TABLE public.pickem_nudges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pickem_nudges_read ON public.pickem_nudges;
CREATE POLICY pickem_nudges_read ON public.pickem_nudges FOR SELECT
  USING (league_id IN (SELECT public.get_my_league_ids()));

-- ── Badge flair: one earned badge shown next to your name ────────
ALTER TABLE public.league_members ADD COLUMN IF NOT EXISTS badge_flair text;

CREATE OR REPLACE FUNCTION public.set_badge_flair(p_league uuid, p_badge text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_badge IS NOT NULL AND p_badge NOT IN (
    'champ', 'defender', 'dynasty', 'perfect', 'sniper', 'calledIt',
    'beatVegas', 'upsetArtist', 'miracle', 'scarTissue', 'ironMan'
  ) THEN
    RAISE EXCEPTION 'Unknown badge';
  END IF;
  UPDATE league_members SET badge_flair = p_badge
  WHERE league_id = p_league AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You''re not in this league';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_badge_flair(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_badge_flair(uuid, text) TO authenticated;

-- ── The problem log ──────────────────────────────────────────────
-- What fails for people in the app (an error screen, a request the
-- server refused), so a break gets noticed the same day. Written only
-- through log_client_error; nobody reads it from the app.
CREATE TABLE IF NOT EXISTS public.client_errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  kind        text NOT NULL,
  message     text NOT NULL,
  detail      jsonb,
  path        text,
  app_version text,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS client_errors_created_idx ON public.client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS client_errors_user_idx ON public.client_errors (user_id, created_at DESC);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_client_error(
  p_kind text, p_message text, p_detail jsonb, p_path text, p_version text, p_agent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  -- At most 30 an hour from one person, so a broken loop can't flood it
  IF (SELECT count(*) FROM client_errors
      WHERE user_id = auth.uid() AND created_at > now() - interval '1 hour') >= 30 THEN
    RETURN;
  END IF;
  INSERT INTO client_errors (user_id, kind, message, detail, path, app_version, user_agent)
  VALUES (
    auth.uid(),
    left(coalesce(p_kind, 'unknown'), 40),
    left(coalesce(p_message, ''), 500),
    CASE WHEN octet_length(p_detail::text) <= 4000 THEN p_detail END,
    left(p_path, 200),
    left(p_version, 40),
    left(p_agent, 300)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.log_client_error(text, text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb, text, text, text) TO authenticated;

-- The last two weeks of problems, newest first: one row per distinct error
CREATE OR REPLACE VIEW public.client_error_summary
WITH (security_invoker = true) AS
SELECT
  kind,
  message,
  count(*)                                     AS times,
  count(DISTINCT user_id)                      AS people,
  min(created_at)                              AS first_seen,
  max(created_at)                              AS last_seen,
  (array_agg(path ORDER BY created_at DESC))[1] AS last_path
FROM public.client_errors
WHERE created_at > now() - interval '14 days'
GROUP BY kind, message
ORDER BY max(created_at) DESC;
REVOKE ALL ON public.client_error_summary FROM anon, authenticated;

-- Keep a month of it
SELECT cron.schedule(
  'purge-client-errors',
  '23 4 * * *',
  $$DELETE FROM public.client_errors WHERE created_at < now() - interval '30 days'$$
);
