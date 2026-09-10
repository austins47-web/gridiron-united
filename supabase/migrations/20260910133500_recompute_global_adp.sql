-- One-time fix: sync-nfl-projections ranks ADP within whatever chunk
-- of players it processed in a single invocation (since the rate
-- limit forces processing in ~60-player chunks per position), so
-- the adp values it writes aren't comparable across chunks/positions.
-- Recompute adp as one real rank across every NFL player with a real
-- projection, in one pass.
with ranked as (
  select id, row_number() over (order by avg_pts desc) as rnk
  from players
  where league = 'NFL' and pos <> 'DST' and avg_pts > 0
)
update players p
set adp = ranked.rnk
from ranked
where p.id = ranked.id;
