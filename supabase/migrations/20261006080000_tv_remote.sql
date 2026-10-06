-- The commissioner's TV remote, and every Shop TV post on the private
-- channel (tv_broadcast, previous migration).

-- The remote: put something on the league's TV right now
--   roast | standings | board | announce (p_text) | moment (p_moment) | clear | reload
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
  IF p_action NOT IN ('roast', 'standings', 'board', 'announce', 'moment', 'clear', 'reload') THEN
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
REVOKE ALL ON FUNCTION public.tv_remote(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tv_remote(uuid, text, text, text) TO authenticated;

-- Reactions, as before, through tv_broadcast
CREATE OR REPLACE FUNCTION public.send_tv_reaction(p_league uuid, p_emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_name  text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only league members can react';
  END IF;
  IF p_emoji NOT IN ('🔥', '😂', '💀', '🏈', '🎉', '😱', '👏', '🤡', '😤', '💩') THEN
    RAISE EXCEPTION 'Pick one of the reaction emojis';
  END IF;
  IF (SELECT count(*) FROM tv_reactions
      WHERE user_id = auth.uid() AND created_at > now() - interval '10 seconds') >= 8 THEN
    RAISE EXCEPTION 'Easy there. Give it a second.';
  END IF;

  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = p_league;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'This league has no Shop TV set up';
  END IF;
  SELECT coalesce(display_name, username, 'Someone') INTO v_name FROM profiles WHERE id = auth.uid();

  INSERT INTO tv_reactions (league_id, user_id, emoji) VALUES (p_league, auth.uid(), p_emoji);
  DELETE FROM tv_reactions WHERE created_at < now() - interval '2 days';

  PERFORM tv_broadcast(v_token, 'reaction', jsonb_build_object('emoji', p_emoji, 'name', v_name));
END;
$$;

-- League chat to the TV, as before, through tv_broadcast
CREATE OR REPLACE FUNCTION public.league_messages_to_tv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token  text;
  v_name   text;
  v_avatar text;
  v_text   text;
  v_gif    text;
  v_thread text;
BEGIN
  IF NEW.user_id IS NULL OR coalesce(NEW.is_system, false) OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = NEW.league_id;
  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.message LIKE 'GIF:%' THEN
    v_gif := substr(NEW.message, 5);
    v_text := '';
  ELSIF NEW.message LIKE 'IMAGE:%' THEN
    v_text := '📷 Sent a photo';
  ELSIF NEW.message LIKE 'POLL:%' THEN
    SELECT '📊 Poll: ' || question INTO v_text FROM league_polls WHERE id::text = trim(substr(NEW.message, 6));
    IF v_text IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.message LIKE 'COMMISH_REPLY:%' OR NEW.message LIKE 'PICKEM_%' OR NEW.message LIKE 'TRADE_COMPLETED:%' THEN
    RETURN NEW;
  ELSE
    v_text := left(NEW.message, 240);
  END IF;

  SELECT coalesce(display_name, username, 'Someone'), avatar_url INTO v_name, v_avatar
  FROM profiles WHERE id = NEW.user_id;
  IF NEW.game_id IS NOT NULL THEN
    SELECT away_team || ' @ ' || home_team INTO v_thread FROM nfl_games WHERE id = NEW.game_id;
  END IF;

  PERFORM tv_broadcast(v_token, 'chat',
    jsonb_build_object('id', NEW.id, 'name', v_name, 'avatar', v_avatar, 'text', v_text, 'gif', v_gif, 'thread', v_thread));
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

-- An unsent message off the TV, as before, through tv_broadcast
CREATE OR REPLACE FUNCTION public.league_messages_unsend_tv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF old.deleted_at IS NOT NULL OR new.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = NEW.league_id;
  IF v_token IS NOT NULL THEN
    PERFORM tv_broadcast(v_token, 'chat_delete', jsonb_build_object('id', NEW.id));
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;
