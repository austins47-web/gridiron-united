-- Same fix as 20260910133500_recompute_global_adp.sql, for CFB —
-- sync-cfb-projections ranks adp within whatever chunk of players it
-- processed in a single invocation, so those values aren't
-- comparable across chunks/positions. Recompute as one real rank
-- across every CFB player with a real projection.
with ranked as (
  select id, row_number() over (order by avg_pts desc) as rnk
  from players
  where league = 'CFB' and avg_pts > 0
)
update players p
set adp = ranked.rnk
from ranked
where p.id = ranked.id;
