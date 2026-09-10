-- The two earlier ADP recomputes ranked NFL and CFB independently,
-- each producing its own 1, 2, 3... sequence. That's fine for a
-- league scoped to just one of them, but leagues can mix both into
-- one shared player pool (player_pool = 'both'), where showing NFL's
-- #1 and CFB's #1 side by side as both "ADP 1.0" just looks broken -
-- confirmed directly: Quinn Ewers, Josh Allen, Harrison Mevis, Brock
-- Purdy (all NFL) and Joshua Dye (CFB) all showing adp = 1.0 at once.
-- Both leagues use the identical scoring formula and the same
-- games_played-normalized average, so avg_pts is already on a
-- comparable scale - one combined rank across both replaces the two
-- separate ones.
with ranked as (
  select id, row_number() over (order by avg_pts desc) as rnk
  from players
  where league in ('NFL', 'CFB') and avg_pts > 0
)
update players p
set adp = ranked.rnk
from ranked
where p.id = ranked.id;
