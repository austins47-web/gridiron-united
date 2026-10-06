-- Spotify on the Shop TV: the song playing on the commissioner's
-- Spotify shows on the TV. The commissioner connects it once
-- (spotify-connect); the TV asks tv-now-playing what's on.

-- One Spotify account per league. The tokens are the server's alone:
-- RLS on, no policies, no grants.
CREATE TABLE IF NOT EXISTS public.league_spotify (
  league_id     uuid PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  connected_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  spotify_name  text,
  refresh_token text NOT NULL,
  access_token  text,
  expires_at    timestamptz,
  connected_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.league_spotify ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_spotify FROM anon, authenticated;

-- The handshake while the commissioner is off at Spotify approving it
CREATE TABLE IF NOT EXISTS public.spotify_auth_states (
  state      text PRIMARY KEY,
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spotify_auth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spotify_auth_states FROM anon, authenticated;

-- What the Commish panel shows: connected, and as whom (never the tokens)
CREATE OR REPLACE FUNCTION public.league_spotify_status(p_league uuid)
RETURNS TABLE (connected boolean, spotify_name text, connected_at timestamptz)
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
    SELECT true, s.spotify_name, s.connected_at FROM league_spotify s WHERE s.league_id = p_league
    UNION ALL
    SELECT false, NULL::text, NULL::timestamptz WHERE NOT EXISTS (SELECT 1 FROM league_spotify WHERE league_id = p_league);
END;
$$;
REVOKE ALL ON FUNCTION public.league_spotify_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_spotify_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.disconnect_league_spotify(p_league uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_league_commissioner(p_league) THEN
    RAISE EXCEPTION 'Only the commissioner can disconnect Spotify';
  END IF;
  DELETE FROM league_spotify WHERE league_id = p_league;
END;
$$;
REVOKE ALL ON FUNCTION public.disconnect_league_spotify(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_league_spotify(uuid) TO authenticated;
