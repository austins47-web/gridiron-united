-- Unsend and delete. Members could already delete (unsend) their own
-- messages; now commissioners can delete anyone's in their league,
-- including the Commish's posts, but not change what they say. And a
-- deleted message comes off the Shop TV right away.

DROP POLICY IF EXISTS messages_moderate ON public.league_messages;
CREATE POLICY messages_moderate ON public.league_messages
  FOR UPDATE
  USING (public.is_league_commissioner(league_id))
  WITH CHECK (public.is_league_commissioner(league_id));

-- As before (only the text changes, deleting blanks it), plus: on
-- someone else's message, a commissioner can only delete it
CREATE OR REPLACE FUNCTION public.league_messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.league_id IS DISTINCT FROM old.league_id
     OR new.user_id IS DISTINCT FROM old.user_id
     OR new.created_at IS DISTINCT FROM old.created_at
     OR new.is_system IS DISTINCT FROM old.is_system
     OR new.reply_to_id IS DISTINCT FROM old.reply_to_id
     OR new.game_id IS DISTINCT FROM old.game_id THEN
    RAISE EXCEPTION 'Only a message''s text can be changed';
  END IF;
  IF old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'That message was deleted';
  END IF;
  IF coalesce(auth.role(), 'service_role') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM old.user_id
     AND new.deleted_at IS NULL THEN
    RAISE EXCEPTION 'You can only delete other people''s messages';
  END IF;

  IF new.deleted_at IS NOT NULL THEN
    new.message := '';
    new.deleted_at := now();
    new.edited_at := old.edited_at;
  ELSIF new.message IS DISTINCT FROM old.message THEN
    IF char_length(trim(new.message)) = 0 THEN
      RAISE EXCEPTION 'A message can''t be empty';
    END IF;
    new.edited_at := now();
  ELSE
    new.edited_at := old.edited_at;
  END IF;
  RETURN new;
END;
$$;

-- Tells the Shop TV a message was deleted, so its pop-up (and the
-- trash talk panel) drop it now rather than at the next refresh
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
    PERFORM realtime.send(jsonb_build_object('id', NEW.id), 'chat_delete', 'tv:' || v_token, false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_messages_unsend_tv ON public.league_messages;
CREATE TRIGGER league_messages_unsend_tv
  AFTER UPDATE OF deleted_at ON public.league_messages
  FOR EACH ROW EXECUTE FUNCTION public.league_messages_unsend_tv();
