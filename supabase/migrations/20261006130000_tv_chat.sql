-- The Shop TV gets its own chat. Until now a message for the TV went into
-- the league chat, and everything said in the league chat popped up on
-- the TV. Now the TV has its own messages (tv_messages): sent from the TV
-- button (send_tv_message), popped up on the TV, listed in that button's
-- feed (tv_chat), and never in the league chat. The league chat stays off
-- the TV.

CREATE TABLE IF NOT EXISTS public.tv_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tv_messages_league_recent ON public.tv_messages (league_id, created_at DESC);
-- Only through the functions below
ALTER TABLE public.tv_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_messages FROM anon, authenticated;

-- The league chat stops going to the TV
DROP TRIGGER IF EXISTS league_messages_to_tv ON public.league_messages;
DROP TRIGGER IF EXISTS league_messages_unsend_tv ON public.league_messages;
DROP FUNCTION IF EXISTS public.league_messages_to_tv();
DROP FUNCTION IF EXISTS public.league_messages_unsend_tv();

-- Says something on the TV; returns the message's id (for Unsend)
CREATE OR REPLACE FUNCTION public.send_tv_message(p_league uuid, p_text text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text   text := left(btrim(coalesce(p_text, '')), 240);
  v_token  text;
  v_name   text;
  v_avatar text;
  v_id     uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only league members can send to the TV';
  END IF;
  IF v_text = '' THEN
    RAISE EXCEPTION 'Say something first';
  END IF;
  IF (SELECT count(*) FROM tv_messages
      WHERE user_id = auth.uid() AND created_at > now() - interval '1 minute') >= 6 THEN
    RAISE EXCEPTION 'Easy there. Give the TV a minute.';
  END IF;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = p_league;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'This league has no Shop TV set up';
  END IF;
  SELECT coalesce(display_name, username, 'Someone'), avatar_url INTO v_name, v_avatar
  FROM profiles WHERE id = auth.uid();

  INSERT INTO tv_messages (league_id, user_id, message) VALUES (p_league, auth.uid(), v_text)
  RETURNING id INTO v_id;
  DELETE FROM tv_messages WHERE created_at < now() - interval '30 days';

  PERFORM tv_broadcast(v_token, 'chat',
    jsonb_build_object('id', v_id, 'name', v_name, 'avatar', v_avatar, 'text', v_text, 'gif', NULL, 'thread', NULL));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_tv_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_tv_message(uuid, text) TO authenticated;

-- Takes a message off the TV: your own, or anyone's for the commissioner
CREATE OR REPLACE FUNCTION public.unsend_tv_message(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league uuid;
  v_user   uuid;
  v_token  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  SELECT league_id, user_id INTO v_league, v_user FROM tv_messages WHERE id = p_id AND deleted_at IS NULL;
  IF v_league IS NULL THEN
    RETURN;
  END IF;
  IF v_user <> auth.uid() AND NOT is_league_commissioner(v_league) THEN
    RAISE EXCEPTION 'You can only unsend your own messages';
  END IF;
  UPDATE tv_messages SET deleted_at = now() WHERE id = p_id;
  SELECT token INTO v_token FROM league_tv_tokens WHERE league_id = v_league;
  IF v_token IS NOT NULL THEN
    PERFORM tv_broadcast(v_token, 'chat_delete', jsonb_build_object('id', p_id));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.unsend_tv_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsend_tv_message(uuid) TO authenticated;

-- The TV chat's last week, newest first, for the league's members
CREATE OR REPLACE FUNCTION public.tv_chat(p_league uuid)
RETURNS TABLE (id uuid, name text, avatar text, message text, created_at timestamptz, mine boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, coalesce(p.display_name, p.username, 'Someone'), p.avatar_url, m.message, m.created_at, m.user_id = auth.uid()
  FROM tv_messages m
  LEFT JOIN profiles p ON p.id = m.user_id
  WHERE m.league_id = p_league
    AND m.deleted_at IS NULL
    AND m.created_at > now() - interval '7 days'
    AND EXISTS (SELECT 1 FROM league_members lm WHERE lm.league_id = p_league AND lm.user_id = auth.uid())
  ORDER BY m.created_at DESC
  LIMIT 30;
$$;
REVOKE ALL ON FUNCTION public.tv_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tv_chat(uuid) TO authenticated;
