-- Memberships and invites, locked down. Until now:
--   - anyone signed in could add a membership row for anyone, in any
--     league, as commissioner (the insert rule only checked they were
--     signed in)
--   - every league with an invite code was readable by everyone, code
--     included, so an invite kept nobody out
--   - members could change every column of their own row: make
--     themselves commissioner, rewrite their record or FAAB, or move
--     the row into another league
--   - commissioners couldn't change anyone else's row, so the Commish
--     panel's member edits and co-commissioner button silently did
--     nothing
-- Joining goes through join_league (previous migration).

-- ── Leagues: readable by members, their commissioner, and public leagues ──
DROP POLICY IF EXISTS leagues_read ON public.leagues;
CREATE POLICY leagues_read ON public.leagues FOR SELECT USING (
  is_public = true
  OR commissioner_id = auth.uid()
  OR id IN (SELECT public.get_my_league_ids())
);

-- Whether you own a league. A policy on league_members can't read
-- leagues directly: leagues' own read rule reads league_members, and
-- Postgres refuses the loop ("infinite recursion detected in policy").
CREATE OR REPLACE FUNCTION public.owns_league(p_league uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM leagues WHERE id = p_league AND commissioner_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.owns_league(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_league(uuid) TO authenticated;

-- ── Adding a membership directly: only the league's owner, adding themselves ──
-- (when they create it); everyone else joins with an invite code
DROP POLICY IF EXISTS league_members_insert ON public.league_members;
CREATE POLICY league_members_insert ON public.league_members FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.owns_league(league_id)
);

-- ── Changing a membership ───────────────────────────────────────
-- Only these columns, from the app: the team name (anyone, their own
-- row), and draft order, waiver order, co-commissioners and the record
-- override (commissioners, any row in their league). Everything else
-- (FAAB, points against, the league or person) is the server's.
REVOKE UPDATE ON public.league_members FROM anon, authenticated;
GRANT UPDATE (team_name, draft_position, waiver_priority, is_commissioner, wins, losses, points_for)
  ON public.league_members TO authenticated;

DROP POLICY IF EXISTS league_members_update_own ON public.league_members;
CREATE POLICY league_members_update_own ON public.league_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS league_members_update_commish ON public.league_members;
CREATE POLICY league_members_update_commish ON public.league_members FOR UPDATE
  USING (public.is_league_commissioner(league_id))
  WITH CHECK (public.is_league_commissioner(league_id));

-- On your own row, only the team name, unless you're the commissioner
CREATE OR REPLACE FUNCTION public.league_members_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(auth.role(), 'service_role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (NEW.draft_position, NEW.waiver_priority, NEW.is_commissioner, NEW.wins, NEW.losses, NEW.points_for)
       IS DISTINCT FROM
     (OLD.draft_position, OLD.waiver_priority, OLD.is_commissioner, OLD.wins, OLD.losses, OLD.points_for)
     AND NOT public.is_league_commissioner(OLD.league_id) THEN
    RAISE EXCEPTION 'Only the commissioner can change that' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_members_guard ON public.league_members;
CREATE TRIGGER league_members_guard
  BEFORE UPDATE ON public.league_members
  FOR EACH ROW EXECUTE FUNCTION public.league_members_guard();
