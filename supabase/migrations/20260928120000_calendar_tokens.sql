-- ══════════════════════════════════════════════════════════════
-- Pick'Em deadline calendar feed
--
-- One private token per user. The calendar edge function serves that
-- user's pick locks at /calendar/<token>/pickem.ics — calendar apps
-- can't sign in, so the token is the key. Handed out (and reset, if
-- the link was shared by mistake) by calendar_token().
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_tokens_select_own ON public.calendar_tokens;
CREATE POLICY calendar_tokens_select_own ON public.calendar_tokens
  FOR SELECT USING (user_id = auth.uid());

-- The signed-in user's token, made on first use; p_reset swaps in a new
-- one so an old link stops working.
CREATE OR REPLACE FUNCTION public.calendar_token(p_reset boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_reset THEN
    DELETE FROM public.calendar_tokens WHERE user_id = auth.uid();
  END IF;
  INSERT INTO public.calendar_tokens (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
  SELECT token INTO t FROM public.calendar_tokens WHERE user_id = auth.uid();
  RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION public.calendar_token(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_token(boolean) TO authenticated;
