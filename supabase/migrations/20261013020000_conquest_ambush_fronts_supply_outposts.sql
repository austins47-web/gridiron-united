-- Conquest: ambushes, second fronts, supply lines, and overseas outposts.
--   Ambush (an order, instead of attacking): name an empire on your border; if it
--     attacks you and you outscore it, you take one of its cities.
--   Second front (an empire of 5+ cities): a second attack each week, taking a city
--     only with a win by 2 (target2: the one you chose; else automatic).
--   Supply lines: a city cut off from its capital defends at -1 (worked out from
--     the map; no column).
--   Outposts: a game played abroad leaves an outpost on the map, won by the best
--     week among those who picked it right; it counts as a city to the season's end.

-- Where a game's played (the schedule sync keeps these from ESPN)
ALTER TABLE public.nfl_games ADD COLUMN IF NOT EXISTS venue_city text;
ALTER TABLE public.nfl_games ADD COLUMN IF NOT EXISTS venue_country text;
ALTER TABLE public.nfl_games ADD COLUMN IF NOT EXISTS neutral_site boolean;
-- 2026's games abroad, as ESPN lists them (the sync fills in everything else)
UPDATE public.nfl_games SET venue_city = 'Melbourne', venue_country = 'Australia', neutral_site = true
 WHERE season = 2026 AND week = 1 AND ARRAY[home_team, away_team] @> ARRAY['SF', 'LAR'];
UPDATE public.nfl_games SET venue_city = 'Rio De Janeiro', venue_country = 'Brazil', neutral_site = true
 WHERE season = 2026 AND week = 3 AND ARRAY[home_team, away_team] @> ARRAY['BAL', 'DAL'];
UPDATE public.nfl_games SET venue_city = 'London', venue_country = 'England', neutral_site = true
 WHERE season = 2026 AND week = 4 AND ARRAY[home_team, away_team] @> ARRAY['IND', 'WSH'];
UPDATE public.nfl_games SET venue_city = 'London', venue_country = 'England', neutral_site = true
 WHERE season = 2026 AND week = 5 AND ARRAY[home_team, away_team] @> ARRAY['PHI', 'JAX'];
UPDATE public.nfl_games SET venue_city = 'London', venue_country = 'England', neutral_site = true
 WHERE season = 2026 AND week = 6 AND ARRAY[home_team, away_team] @> ARRAY['HOU', 'JAX'];
UPDATE public.nfl_games SET venue_city = 'Saint-Denis', venue_country = 'France', neutral_site = true
 WHERE season = 2026 AND week = 7 AND ARRAY[home_team, away_team] @> ARRAY['PIT', 'NO'];
UPDATE public.nfl_games SET venue_city = 'Madrid', venue_country = 'Spain', neutral_site = true
 WHERE season = 2026 AND week = 9 AND ARRAY[home_team, away_team] @> ARRAY['CIN', 'ATL'];
UPDATE public.nfl_games SET venue_city = 'Munich', venue_country = 'Germany', neutral_site = true
 WHERE season = 2026 AND week = 10 AND ARRAY[home_team, away_team] @> ARRAY['NE', 'DET'];
UPDATE public.nfl_games SET venue_city = 'Mexico City', venue_country = 'Mexico', neutral_site = true
 WHERE season = 2026 AND week = 11 AND ARRAY[home_team, away_team] @> ARRAY['MIN', 'SF'];

-- Orders: an ambush (the empire you're waiting for) and a second front's target
ALTER TABLE public.conquest_orders ADD COLUMN IF NOT EXISTS ambush uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.conquest_orders ADD COLUMN IF NOT EXISTS target2 uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.conquest_orders DROP CONSTRAINT IF EXISTS conquest_orders_has_order;
ALTER TABLE public.conquest_orders ADD CONSTRAINT conquest_orders_has_order
  CHECK (target_id IS NOT NULL OR claim IS NOT NULL OR fortify OR tribute IS NOT NULL OR ambush IS NOT NULL OR target2 IS NOT NULL);

-- The war log: how a city was won (an ambush, a second front, or cut off from its
-- capital), and outposts claimed
ALTER TABLE public.conquest_moves ADD COLUMN IF NOT EXISTS tactic text;
ALTER TABLE public.conquest_moves DROP CONSTRAINT IF EXISTS conquest_moves_tactic_check;
ALTER TABLE public.conquest_moves ADD CONSTRAINT conquest_moves_tactic_check CHECK (tactic IS NULL OR tactic IN ('ambush', 'second', 'cut'));
ALTER TABLE public.conquest_moves DROP CONSTRAINT IF EXISTS conquest_moves_kind_check;
ALTER TABLE public.conquest_moves ADD CONSTRAINT conquest_moves_kind_check
  CHECK (kind IN ('capture', 'siege', 'relief', 'claim', 'rebellion', 'tribute', 'trade', 'outpost'));

-- Outposts: one per game played abroad, held by whoever won it (null: nobody picked it right)
CREATE TABLE IF NOT EXISTS public.conquest_outposts (
  league_id  uuid NOT NULL,
  season     int  NOT NULL,
  game_id    uuid NOT NULL,
  key        text NOT NULL,
  name       text NOT NULL,
  week       int  NOT NULL,
  owner_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season, game_id),
  FOREIGN KEY (league_id, season) REFERENCES public.conquest_games (league_id, season) ON DELETE CASCADE
);
ALTER TABLE public.conquest_outposts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conquest_outposts FROM anon, authenticated;
GRANT SELECT ON public.conquest_outposts TO authenticated;
DROP POLICY IF EXISTS conquest_outposts_read ON public.conquest_outposts;
CREATE POLICY conquest_outposts_read ON public.conquest_outposts FOR SELECT TO authenticated
  USING (league_id IN (SELECT public.get_my_league_ids()));

-- Coded orders: an ambush or a second front is a sealed order too
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
    AND (o.target_id IS NOT NULL OR o.fortify OR o.tribute IS NOT NULL OR o.ambush IS NOT NULL OR o.target2 IS NOT NULL)
    AND g.season = (SELECT max(season) FROM conquest_games WHERE league_id = p_league)
    AND o.week = coalesce(g.last_resolved_week, g.start_week - 1) + 1
    AND EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = p_league AND m.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.conquest_sealed_orders(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.conquest_sealed_orders(uuid) TO authenticated;
