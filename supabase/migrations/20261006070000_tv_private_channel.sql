-- The Shop TV's live channel (tv:<code>) goes private. On a public
-- channel anyone who knew a TV's code could post to it from a browser:
-- fake reactions, fake chat, and (with the remote) any text full screen.
-- Now the TV and the commissioner's remote can listen, and a TV can say
-- it's on (presence), but only the database posts (realtime.send from
-- the functions below, which bypass these rules).
DROP POLICY IF EXISTS tv_channel_listen ON realtime.messages;
CREATE POLICY tv_channel_listen ON realtime.messages
  FOR SELECT TO anon, authenticated
  USING (realtime.topic() LIKE 'tv:%' AND extension IN ('broadcast', 'presence'));

DROP POLICY IF EXISTS tv_channel_presence ON realtime.messages;
CREATE POLICY tv_channel_presence ON realtime.messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (realtime.topic() LIKE 'tv:%' AND extension = 'presence');

-- One way to post to a TV. Also on the old public channel until every
-- TV has reloaded onto the private one (they reload every 6 hours);
-- drop that second send after 2026-10-08.
CREATE OR REPLACE FUNCTION public.tv_broadcast(p_token text, p_event text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(p_payload, p_event, 'tv:' || p_token, true);
  PERFORM realtime.send(p_payload, p_event, 'tv:' || p_token, false);
END;
$$;
REVOKE ALL ON FUNCTION public.tv_broadcast(text, text, jsonb) FROM PUBLIC, anon, authenticated;
