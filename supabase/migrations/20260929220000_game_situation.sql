-- The live game situation, from ESPN's scoreboard (sync-nfl-schedule),
-- for the Shop TV's live tiles. All null unless the game is in progress.
alter table public.nfl_games
  add column if not exists possession text,     -- team abbreviation with the ball
  add column if not exists down_distance text,  -- e.g. "3rd & 7 at MIA 23"
  add column if not exists red_zone boolean,
  add column if not exists last_play text;
