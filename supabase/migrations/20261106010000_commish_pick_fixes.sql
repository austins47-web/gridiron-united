-- ══════════════════════════════════════════════════════════════
-- Commissioner pick fixes
--
-- The commissioner can enter, change or clear a member's pick (and
-- tiebreaker guess) on a game that has kicked off: picks written on
-- paper, a pick the app lost. Never on a game still open: that pick is
-- the member's own to make, and the commissioner, a player too, never
-- sees a pick before it locks.
--
-- Everything shows:
--   pickem_picks.entered_by  who entered the pick, when the commissioner
--                            did (the Board marks it). The member making
--                            the pick again clears it.
--   pickem_pick_edits        every change, before and after, with the
--                            commissioner's note. The whole league reads it.
--   notifications            the member hears about it (unless it's their
--                            own pick being fixed).
--
-- pickem_pick_track is rebuilt with what 20261013000000_pick_updated_at
-- dropped by mistake: switched_from (switches went unrecorded from Oct
-- 13), autopilot's marks that only the server can set, an autopilot pick
-- becoming the person's own once they change it, and an autopilot
-- tiebreaker guess a stale page can't wipe. Plus the commissioner's
-- entries: no pick time (when the member picked isn't known), no switch.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.pickem_picks
  ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pickem_pick_edits (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id      uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season         int  NOT NULL,
  week           int  NOT NULL,
  game_id        uuid NOT NULL REFERENCES public.nfl_games(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  by_user        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_team       text,
  new_team       text,
  old_tiebreaker int,
  new_tiebreaker int,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickem_pick_edits_week_idx ON public.pickem_pick_edits (league_id, season, week, created_at DESC);

ALTER TABLE public.pickem_pick_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pickem_pick_edits FROM anon, authenticated;
GRANT SELECT ON public.pickem_pick_edits TO authenticated;
DROP POLICY IF EXISTS pickem_pick_edits_read ON public.pickem_pick_edits;
CREATE POLICY pickem_pick_edits_read ON public.pickem_pick_edits FOR SELECT TO authenticated
  USING (league_id IN (SELECT public.get_my_league_ids()));

-- ── Picks: switches, autopilot, the commissioner's entries ─────────
CREATE OR REPLACE FUNCTION public.pickem_pick_track()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trusted boolean := coalesce(auth.role(), 'service_role') = 'service_role';
  -- commish_set_picks marks its own writes (for its transaction only)
  commish boolean := coalesce(current_setting('gu.commish_entry', true), '') = 'on';
BEGIN
  -- Only the server marks anything as autopilot
  IF NOT trusted THEN
    NEW.auto            := CASE WHEN TG_OP = 'UPDATE' THEN OLD.auto ELSE false END;
    NEW.tiebreaker_auto := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tiebreaker_auto ELSE false END;
  END IF;
  -- Only the commissioner's fix marks a pick as entered by them
  IF NOT commish THEN
    NEW.entered_by := CASE WHEN TG_OP = 'UPDATE' THEN OLD.entered_by ELSE NULL END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.picked_at := CASE WHEN commish THEN NULL ELSE now() END;
    NEW.spread_at_pick := (SELECT g.spread FROM public.nfl_games g WHERE g.id = NEW.game_id);
    NEW.switched_from := NULL;
  ELSIF NEW.picked_team IS DISTINCT FROM OLD.picked_team THEN
    NEW.spread_at_pick := (SELECT g.spread FROM public.nfl_games g WHERE g.id = NEW.game_id);
    NEW.auto := false;
    IF commish THEN
      -- A correction, not the member flip-flopping
      NEW.picked_at := NULL;
      NEW.switched_from := NULL;
    ELSE
      NEW.picked_at := now();
      NEW.switched_from := CASE WHEN OLD.auto THEN NULL ELSE OLD.picked_team END;
      NEW.entered_by := NULL;
    END IF;
  ELSE
    NEW.picked_at := OLD.picked_at;
    NEW.spread_at_pick := OLD.spread_at_pick;
    NEW.switched_from := OLD.switched_from;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.tiebreaker_auto AND NEW.tiebreaker_score IS NULL AND NOT commish THEN
      -- A page loaded before autopilot filled the guess never wipes it
      NEW.tiebreaker_score := OLD.tiebreaker_score;
      NEW.tiebreaker_auto := true;
    ELSIF NEW.tiebreaker_score IS DISTINCT FROM OLD.tiebreaker_score AND NOT trusted THEN
      NEW.tiebreaker_auto := false;
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ── The commissioner's fix ───────────────────────────────────────
-- p_changes: [{ game_id, team }] (team null: no pick), and on the
-- tiebreaker game optionally "tiebreaker" (a number, or null to clear).
-- Returns how many picks changed.
CREATE OR REPLACE FUNCTION public.commish_set_picks(p_league uuid, p_user uuid, p_changes jsonb, p_note text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  me       uuid := auth.uid();
  v_note   text := nullif(left(trim(coalesce(p_note, '')), 140), '');
  ch       jsonb;
  g        record;
  v_team   text;
  v_set_tb boolean;
  v_tb     int;
  had      boolean;
  old_team text;
  old_tb   int;
  new_tb   int;
  n        int := 0;
  wks      int[] := '{}';
  v_body   text;
BEGIN
  IF me IS NULL OR NOT public.is_league_commissioner(p_league) THEN
    RAISE EXCEPTION 'Only the commissioner can fix picks';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.league_members WHERE league_id = p_league AND user_id = p_user) THEN
    RAISE EXCEPTION 'They aren''t in this league';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'Nothing to change';
  END IF;
  IF jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'Too many changes at once';
  END IF;

  PERFORM set_config('gu.commish_entry', 'on', true);

  FOR ch IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    SELECT id, season, week, home_team, away_team, game_date, is_tiebreaker INTO g
      FROM public.nfl_games WHERE id = nullif(ch->>'game_id', '')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No such game';
    END IF;
    IF g.game_date IS NULL OR g.game_date > now() THEN
      RAISE EXCEPTION '% @ % hasn''t kicked off yet: that pick is still theirs to make', g.away_team, g.home_team;
    END IF;

    v_team := nullif(ch->>'team', '');
    IF v_team IS NOT NULL AND v_team <> g.home_team AND v_team <> g.away_team THEN
      RAISE EXCEPTION '% isn''t in % @ %', v_team, g.away_team, g.home_team;
    END IF;
    v_set_tb := ch ? 'tiebreaker';
    v_tb := NULL;
    IF v_set_tb THEN
      IF NOT g.is_tiebreaker THEN
        RAISE EXCEPTION 'Only the tiebreaker game takes a guess';
      END IF;
      IF jsonb_typeof(ch->'tiebreaker') = 'number' THEN
        v_tb := (ch->>'tiebreaker')::numeric::int;
        IF v_tb < 0 OR v_tb > 200 THEN
          RAISE EXCEPTION 'A tiebreaker guess is 0 to 200 points';
        END IF;
      ELSIF jsonb_typeof(ch->'tiebreaker') <> 'null' THEN
        RAISE EXCEPTION 'A tiebreaker guess is a number';
      END IF;
    END IF;

    SELECT p.picked_team, p.tiebreaker_score INTO old_team, old_tb
      FROM public.pickem_picks p
      WHERE p.league_id = p_league AND p.user_id = p_user AND p.game_id = g.id;
    had := FOUND;

    IF v_team IS NULL THEN
      -- No pick on this game
      IF NOT had THEN
        CONTINUE;
      END IF;
      DELETE FROM public.pickem_picks WHERE league_id = p_league AND user_id = p_user AND game_id = g.id;
      new_tb := NULL;
    ELSE
      IF v_set_tb THEN
        new_tb := v_tb;
      ELSE
        new_tb := old_tb;
      END IF;
      IF had AND old_team = v_team AND old_tb IS NOT DISTINCT FROM new_tb THEN
        CONTINUE;
      END IF;
      INSERT INTO public.pickem_picks (league_id, user_id, game_id, week, season, picked_team, tiebreaker_score, entered_by)
        VALUES (p_league, p_user, g.id, g.week, g.season, v_team, new_tb, me)
        ON CONFLICT (league_id, user_id, game_id) DO UPDATE
          SET picked_team = excluded.picked_team,
              tiebreaker_score = excluded.tiebreaker_score,
              entered_by = excluded.entered_by;
    END IF;

    INSERT INTO public.pickem_pick_edits (league_id, season, week, game_id, user_id, by_user, old_team, new_team, old_tiebreaker, new_tiebreaker, note)
      VALUES (p_league, g.season, g.week, g.id, p_user, me, old_team, v_team, old_tb, new_tb, v_note);
    n := n + 1;
    IF NOT (g.week = ANY (wks)) THEN
      wks := wks || g.week;
    END IF;
    old_team := NULL;
    old_tb := NULL;
  END LOOP;
  -- Anything else written in this transaction is the member's own again
  PERFORM set_config('gu.commish_entry', 'off', true);

  -- The member hears about it (not for the commissioner's own picks)
  IF n > 0 AND p_user <> me THEN
    v_body := n || ' pick' || CASE WHEN n = 1 THEN '' ELSE 's' END
      || ' in Week ' || array_to_string(wks, ', ')
      || coalesce(': ' || v_note, '');
    INSERT INTO public.notifications (user_id, league_id, type, title, body, is_read, data, sender_id)
      VALUES (p_user, p_league, 'pick_fixed', 'The commissioner changed your picks', v_body, false,
              jsonb_build_object('league_id', p_league, 'week', wks[1]), me);
  END IF;
  RETURN n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.commish_set_picks(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commish_set_picks(uuid, uuid, jsonb, text) TO authenticated;
