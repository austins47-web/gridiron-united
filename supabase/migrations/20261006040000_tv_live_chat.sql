-- League chat, live on the Shop TV. Each new message from a member is
-- broadcast on the TV's channel (tv:<code>, like reactions), and the TV
-- pops it up on screen. GIFs show; a photo shows as a note (the TV is in
-- the shop); a poll shows its question; a game thread message says which
-- game. A problem here never stops the message itself.
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

  PERFORM realtime.send(
    jsonb_build_object('id', NEW.id, 'name', v_name, 'avatar', v_avatar, 'text', v_text, 'gif', v_gif, 'thread', v_thread),
    'chat',
    'tv:' || v_token,
    false
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_messages_to_tv ON public.league_messages;
CREATE TRIGGER league_messages_to_tv
  AFTER INSERT ON public.league_messages
  FOR EACH ROW EXECUTE FUNCTION public.league_messages_to_tv();
