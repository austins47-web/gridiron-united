-- Joining a league by invite code happens in the database. The app
-- used to look the league up itself and insert the membership, which
-- needed every league (and its invite code) readable by everyone and
-- an insert rule that let anyone add any membership. Those are closed
-- in the next migration; this goes first so joining never breaks.
CREATE OR REPLACE FUNCTION public.join_league(p_code text, p_team_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lg leagues%ROWTYPE;
  members int;
  capacity int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to join a league';
  END IF;
  -- Locked, so two people taking the last spot can't both get in
  SELECT * INTO lg FROM leagues WHERE invite_code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  IF EXISTS (SELECT 1 FROM league_members WHERE league_id = lg.id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You are already in this league';
  END IF;
  SELECT count(*) INTO members FROM league_members WHERE league_id = lg.id;
  IF lg.league_type = 'pickem' THEN
    capacity := 500;
  ELSE
    capacity := lg.num_teams;
  END IF;
  IF members >= capacity THEN
    RAISE EXCEPTION 'League is full';
  END IF;
  INSERT INTO league_members (league_id, user_id, is_commissioner, team_name)
  VALUES (lg.id, auth.uid(), false, coalesce(nullif(left(trim(p_team_name), 30), ''), 'My Team'));
  RETURN lg.id;
END;
$$;
REVOKE ALL ON FUNCTION public.join_league(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_league(text, text) TO authenticated;
