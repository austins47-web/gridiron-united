-- leagues.conquest_map_style: how the league's war map is drawn on the
-- Shop TV, and on members' phones until they pick their own: the radar
-- screen, an old parchment map, or the war room's table.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS conquest_map_style text NOT NULL DEFAULT 'radar'
  CHECK (conquest_map_style IN ('radar', 'parchment', 'warroom'));
