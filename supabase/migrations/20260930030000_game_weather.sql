-- Stadium weather at kickoff (sync-odds, every 3 hours, for this week's
-- games and next week's): { indoor, roof?, temp_f, wind_mph, gust_mph,
-- precip_pct, snow_in, code, updated_at }. Shown on the pick cards and
-- the Shop TV. Null until forecast, and for venues we can't place.
alter table public.nfl_games
  add column if not exists weather jsonb;
