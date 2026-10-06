-- Live polls on the Shop TV, and the replay on the remote.

-- The remote, as before, plus 'replay' (the finished week's slideshow)
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
  IF p_action NOT IN ('roast', 'standings', 'board', 'replay', 'announce', 'moment', 'clear', 'reload') THEN
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

-- A poll on the TV: started like any chat poll (it's posted in the chat,
-- where everyone votes), open for 1 to 10 minutes, and shown full screen
-- on the TV with the votes coming in
CREATE OR REPLACE FUNCTION public.tv_poll(p_league uuid, p_question text, p_options text[], p_minutes int DEFAULT 2)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_id    uuid;
  v_poll  league_polls%ROWTYPE;
BEGIN
  IF NOT is_league_commissioner(p_league) THEN
    RAISE EXCEPTION 'Only the commissioner can put a poll on the TV';
  END IF;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = p_league;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'This league has no Shop TV set up';
  END IF;

  v_id := create_league_poll(
    p_league, p_question, p_options,
    now() + make_interval(mins => least(greatest(coalesce(p_minutes, 2), 1), 10))
  );
  SELECT * INTO v_poll FROM league_polls WHERE id = v_id;

  PERFORM tv_broadcast(v_token, 'remote', jsonb_build_object(
    'action', 'poll',
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'question', v_poll.question,
      'options', to_jsonb(v_poll.options),
      'closesAt', v_poll.closes_at,
      'counts', (SELECT jsonb_agg(0) FROM generate_series(1, array_length(v_poll.options, 1)))
    )
  ));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tv_poll(uuid, text, text[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tv_poll(uuid, text, text[], int) TO authenticated;

-- Each vote (or change of vote) sends the poll's new counts to the TV
CREATE OR REPLACE FUNCTION public.league_poll_votes_to_tv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll   uuid;
  v_league uuid;
  v_token  text;
  v_n      int;
  v_counts jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_poll := OLD.poll_id;
    v_league := OLD.league_id;
  ELSE
    v_poll := NEW.poll_id;
    v_league := NEW.league_id;
  END IF;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = v_league;
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT array_length(options, 1) INTO v_n FROM league_polls WHERE id = v_poll;
  IF v_n IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_agg(coalesce(c.n, 0) ORDER BY i) INTO v_counts
  FROM generate_series(0, v_n - 1) AS i
  LEFT JOIN (
    SELECT option_index, count(*) AS n FROM league_poll_votes WHERE poll_id = v_poll GROUP BY option_index
  ) c ON c.option_index = i;
  PERFORM tv_broadcast(v_token, 'poll_votes', jsonb_build_object('id', v_poll, 'counts', v_counts));
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS league_poll_votes_to_tv ON public.league_poll_votes;
CREATE TRIGGER league_poll_votes_to_tv
  AFTER INSERT OR UPDATE OR DELETE ON public.league_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.league_poll_votes_to_tv();
