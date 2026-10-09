-- The Shop TV moved to a private realtime channel on 2026-10-06; for the
-- changeover, tv_broadcast also posted on the old public channel so TV
-- pages still on the old code kept working until their 6-hour reload.
-- They've all reloaded since, so the public post goes: it was the last
-- way anyone who knew a TV's code could put something on its screen.
CREATE OR REPLACE FUNCTION public.tv_broadcast(p_token text, p_event text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM realtime.send(p_payload, p_event, 'tv:' || p_token, true);
END;
$function$;
