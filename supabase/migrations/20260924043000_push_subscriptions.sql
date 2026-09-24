-- ══════════════════════════════════════════════════════════════
-- Phone / browser push notifications
--
-- One row per device that turned notifications on. The endpoint is
-- the device's address at its browser's push service (Google, Apple,
-- Mozilla); p256dh/auth are the keys the payload is encrypted to.
-- send-reminders and push-test read these with the service role.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user can see and remove their own devices. Adding one goes
-- through save_push_subscription below.
DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- Saves this device for the signed-in user. A device's endpoint is
-- unique, so if someone else was signed in on this browser before,
-- the device moves to the current user instead of failing — a plain
-- insert/upsert can't do that under RLS, since the old row isn't
-- theirs.
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent;
END;
$$;

-- Supabase's default privileges also grant new functions to anon;
-- revoke that explicitly (it would only hit the exception anyway).
REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;
