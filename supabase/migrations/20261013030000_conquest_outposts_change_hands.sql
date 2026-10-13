-- Conquest outposts: one per city a season. When the NFL goes back to a city, that
-- game's winner takes its outpost over (the row's owner, game and week move on; the
-- war log keeps who held it when).
CREATE UNIQUE INDEX IF NOT EXISTS conquest_outposts_one_per_city ON public.conquest_outposts (league_id, season, key);
