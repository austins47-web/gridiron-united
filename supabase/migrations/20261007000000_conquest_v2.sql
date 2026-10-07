-- Conquest, version 2: choosing your attack, and the season's titles.

-- Attack orders: the empire you mean to attack in a week (the conquest
-- function writes them, after checking it's on your border and before the
-- week's first kickoff). Yours are always yours to see; everyone else's
-- stay secret until that kickoff, then they're out in the open, like
-- orders revealed in Risk.
CREATE TABLE IF NOT EXISTS public.conquest_orders (
  league_id  uuid NOT NULL,
  season     int  NOT NULL,
  week       int  NOT NULL,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season, week, user_id),
  FOREIGN KEY (league_id, season) REFERENCES public.conquest_games (league_id, season) ON DELETE CASCADE
);
ALTER TABLE public.conquest_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conquest_orders FROM anon, authenticated;
GRANT SELECT ON public.conquest_orders TO authenticated;
DROP POLICY IF EXISTS conquest_orders_read ON public.conquest_orders;
CREATE POLICY conquest_orders_read ON public.conquest_orders FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (
    league_id IN (SELECT public.get_my_league_ids())
    AND now() >= (
      SELECT min(g.game_date) FROM public.nfl_games g
      WHERE g.season = conquest_orders.season AND g.week = conquest_orders.week
    )
  )
);

-- The war's last week (the regular season's), and the titles crowned
-- once it's settled: [{ key, label, icon, userId, value }]
ALTER TABLE public.conquest_games ADD COLUMN IF NOT EXISTS final_week int NOT NULL DEFAULT 18;
ALTER TABLE public.conquest_games ADD COLUMN IF NOT EXISTS crowned jsonb;
