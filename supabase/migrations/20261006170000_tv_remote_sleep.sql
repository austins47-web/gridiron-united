-- The TV remote's Sleep button: the TV sleeps now (the closing-time
-- screen) until a button wakes it, or the shop next opens.
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
  IF p_action NOT IN ('roast', 'standings', 'board', 'replay', 'chat', 'sleep', 'announce', 'moment', 'clear', 'reload') THEN
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
