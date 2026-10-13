-- Conquest: three new kinds of orders and deals.
--   Fortify: an empire skips its attack and digs in for the week; attackers
--     must win by 2 to take anything (not two weeks running).
--   Tribute: a player whose capital is under siege hands one of their other
--     cities to the besieger, and the siege lifts before the week's battles.
--   Trades: two players swap a city each (never a capital), when both agree,
--     before the week's first kickoff.

-- Orders: dig in, and the city paid in tribute
ALTER TABLE public.conquest_orders ADD COLUMN IF NOT EXISTS fortify boolean NOT NULL DEFAULT false;
ALTER TABLE public.conquest_orders ADD COLUMN IF NOT EXISTS tribute text;
ALTER TABLE public.conquest_orders DROP CONSTRAINT IF EXISTS conquest_orders_has_order;
ALTER TABLE public.conquest_orders ADD CONSTRAINT conquest_orders_has_order
  CHECK (target_id IS NOT NULL OR claim IS NOT NULL OR fortify OR tribute IS NOT NULL);

-- The war log: tribute and trades change hands too; with_team is the other city in it
-- (a tribute's: the capital it freed; a trade's: the city that went the other way)
ALTER TABLE public.conquest_moves ADD COLUMN IF NOT EXISTS with_team text;
ALTER TABLE public.conquest_moves DROP CONSTRAINT IF EXISTS conquest_moves_kind_check;
ALTER TABLE public.conquest_moves ADD CONSTRAINT conquest_moves_kind_check
  CHECK (kind IN ('capture', 'siege', 'relief', 'claim', 'rebellion', 'tribute', 'trade'));

-- Trade offers: seen only by the two players in them (the conquest function writes them)
CREATE TABLE IF NOT EXISTS public.conquest_trades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid NOT NULL,
  season      int  NOT NULL,
  week        int  NOT NULL,
  from_user   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  give_team   text NOT NULL,
  get_team    text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'void')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  FOREIGN KEY (league_id, season) REFERENCES public.conquest_games (league_id, season) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conquest_trades_open_idx ON public.conquest_trades (league_id, season, status);
ALTER TABLE public.conquest_trades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conquest_trades FROM anon, authenticated;
GRANT SELECT ON public.conquest_trades TO authenticated;
DROP POLICY IF EXISTS conquest_trades_read ON public.conquest_trades;
CREATE POLICY conquest_trades_read ON public.conquest_trades FOR SELECT TO authenticated
  USING (from_user = auth.uid() OR to_user = auth.uid());

-- An accepted trade, all at once: both cities swap, the war log gets both, the offer's
-- marked accepted, and any other open offer for either city is void. Re-checks that each
-- still holds their city and neither is a capital. For the conquest function only.
CREATE OR REPLACE FUNCTION public.conquest_apply_trade(p_trade uuid, p_week int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.conquest_trades%ROWTYPE;
  cap_from text;
  cap_to text;
BEGIN
  SELECT * INTO t FROM public.conquest_trades WHERE id = p_trade FOR UPDATE;
  IF NOT FOUND OR t.status <> 'pending' THEN
    RETURN 'gone';
  END IF;
  SELECT capital INTO cap_from FROM public.conquest_players WHERE league_id = t.league_id AND season = t.season AND user_id = t.from_user;
  SELECT capital INTO cap_to FROM public.conquest_players WHERE league_id = t.league_id AND season = t.season AND user_id = t.to_user;
  IF t.give_team = cap_from OR t.get_team = cap_to
     OR NOT EXISTS (SELECT 1 FROM public.conquest_territories WHERE league_id = t.league_id AND season = t.season AND team = t.give_team AND owner_id = t.from_user)
     OR NOT EXISTS (SELECT 1 FROM public.conquest_territories WHERE league_id = t.league_id AND season = t.season AND team = t.get_team AND owner_id = t.to_user) THEN
    UPDATE public.conquest_trades SET status = 'void', decided_at = now() WHERE id = p_trade;
    RETURN 'void';
  END IF;
  UPDATE public.conquest_territories SET owner_id = t.to_user, since_week = p_week, besieged_by = NULL
   WHERE league_id = t.league_id AND season = t.season AND team = t.give_team;
  UPDATE public.conquest_territories SET owner_id = t.from_user, since_week = p_week, besieged_by = NULL
   WHERE league_id = t.league_id AND season = t.season AND team = t.get_team;
  INSERT INTO public.conquest_moves (league_id, season, week, kind, team, from_user, to_user, score_for, score_against, exiled, with_team) VALUES
    (t.league_id, t.season, p_week, 'trade', t.give_team, t.from_user, t.to_user, 0, 0, false, t.get_team),
    (t.league_id, t.season, p_week, 'trade', t.get_team, t.to_user, t.from_user, 0, 0, false, t.give_team);
  UPDATE public.conquest_trades SET status = 'accepted', decided_at = now() WHERE id = p_trade;
  UPDATE public.conquest_trades SET status = 'void', decided_at = now()
   WHERE league_id = t.league_id AND season = t.season AND status = 'pending' AND id <> p_trade
     AND (give_team IN (t.give_team, t.get_team) OR get_team IN (t.give_team, t.get_team));
  RETURN 'ok';
END
$$;
REVOKE ALL ON FUNCTION public.conquest_apply_trade(uuid, int) FROM public, anon, authenticated;

-- Coded orders: digging in and paying tribute are sealed orders too
CREATE OR REPLACE FUNCTION public.conquest_sealed_orders(p_league uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.user_id
  FROM conquest_orders o
  JOIN conquest_games g ON g.league_id = o.league_id AND g.season = o.season
  WHERE o.league_id = p_league
    AND (o.target_id IS NOT NULL OR o.fortify OR o.tribute IS NOT NULL)
    AND g.season = (SELECT max(season) FROM conquest_games WHERE league_id = p_league)
    AND o.week = coalesce(g.last_resolved_week, g.start_week - 1) + 1
    AND EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = p_league AND m.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.conquest_sealed_orders(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.conquest_sealed_orders(uuid) TO authenticated;
