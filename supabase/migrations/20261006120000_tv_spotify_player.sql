-- The Shop TV as a Spotify speaker (Spotify's Web Playback SDK): the TV
-- shows up in Spotify's device list as "<league> TV", and music sent to
-- it plays out of the TV. The commissioner turns it on in Commish panel →
-- Shop TV, which asks Spotify for the playback permissions (streaming)
-- on top of the read-only ones; the TV then gets a short-lived token from
-- tv-spotify-token.

-- What Spotify granted (space-separated), and whether the TV may play
ALTER TABLE public.league_spotify ADD COLUMN IF NOT EXISTS scopes text;
ALTER TABLE public.league_spotify ADD COLUMN IF NOT EXISTS tv_player boolean NOT NULL DEFAULT false;

-- Connecting for playback: remembered across the trip to Spotify
ALTER TABLE public.spotify_auth_states ADD COLUMN IF NOT EXISTS player boolean NOT NULL DEFAULT false;

-- The Commish panel: connected, as whom, whether the grant covers
-- playback, and whether the TV plays (never the tokens)
DROP FUNCTION IF EXISTS public.league_spotify_status(uuid);
CREATE FUNCTION public.league_spotify_status(p_league uuid)
RETURNS TABLE (connected boolean, spotify_name text, connected_at timestamptz, can_play boolean, tv_player boolean)
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
    SELECT true, s.spotify_name, s.connected_at, coalesce(s.scopes, '') LIKE '%streaming%', s.tv_player
      FROM league_spotify s WHERE s.league_id = p_league
    UNION ALL
    SELECT false, NULL::text, NULL::timestamptz, false, false
      WHERE NOT EXISTS (SELECT 1 FROM league_spotify WHERE league_id = p_league);
END;
$$;
REVOKE ALL ON FUNCTION public.league_spotify_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_spotify_status(uuid) TO authenticated;

-- Turns the TV's speaker on or off (on needs a grant with playback)
CREATE OR REPLACE FUNCTION public.set_league_spotify_tv_player(p_league uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_league_commissioner(p_league) THEN
    RAISE EXCEPTION 'Only the commissioner can change this';
  END IF;
  IF p_on AND NOT EXISTS (
    SELECT 1 FROM league_spotify WHERE league_id = p_league AND coalesce(scopes, '') LIKE '%streaming%'
  ) THEN
    RAISE EXCEPTION 'Connect Spotify for playback first';
  END IF;
  UPDATE league_spotify SET tv_player = p_on WHERE league_id = p_league;
END;
$$;
REVOKE ALL ON FUNCTION public.set_league_spotify_tv_player(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_league_spotify_tv_player(uuid, boolean) TO authenticated;
