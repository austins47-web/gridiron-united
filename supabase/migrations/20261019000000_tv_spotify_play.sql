-- The remote's "Play on the TV": tv-spotify-play moves the league's
-- Spotify playback onto the TV's speaker, so nobody has to find the TV in
-- Spotify's device list. That needs one more permission from Spotify
-- (user-modify-playback-state), which grants from before this don't have:
-- the Commish panel asks for it again.

-- The Commish panel: connected, as whom, whether the grant covers
-- playback, whether the TV plays, and whether the remote can send the
-- music to it (never the tokens)
DROP FUNCTION IF EXISTS public.league_spotify_status(uuid);
CREATE FUNCTION public.league_spotify_status(p_league uuid)
RETURNS TABLE (connected boolean, spotify_name text, connected_at timestamptz, can_play boolean, tv_player boolean, can_control boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_league_commissioner(p_league) THEN
    RAISE EXCEPTION 'Only the commissioner can see this';
  END IF;
  RETURN QUERY
    SELECT true, s.spotify_name, s.connected_at, coalesce(s.scopes, '') LIKE '%streaming%', s.tv_player,
           coalesce(s.scopes, '') LIKE '%user-modify-playback-state%'
      FROM league_spotify s WHERE s.league_id = p_league
    UNION ALL
    SELECT false, NULL::text, NULL::timestamptz, false, false, false
      WHERE NOT EXISTS (SELECT 1 FROM league_spotify WHERE league_id = p_league);
END;
$$;
REVOKE ALL ON FUNCTION public.league_spotify_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_spotify_status(uuid) TO authenticated;
