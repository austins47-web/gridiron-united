-- ── Value-Based Drafting ADP, replacing raw-points ranking ────────
-- Every earlier ADP pass ranked players by raw avg_pts, which is why
-- Josh Allen (22.1 avg) outranked every RB despite none of them
-- being within 2 points of him - a flat points ranking always
-- favors QB, because QB is the only position with just one starter
-- and no flex competition inflating the demand curve. Real ADP
-- reflects positional scarcity instead: how much better a player is
-- than a startable "replacement" at their own position - a QB
-- replacement (streaming-tier QB15) is still fine, so even a great
-- QB's edge over replacement is small; an RB replacement (RB30, once
-- flex demand is counted) is much worse than the RB1s, so elite RBs
-- have a far bigger edge. That gap is why real drafts go RB/WR-heavy
-- early and QB comes in tiers starting a few rounds in.
--
-- Baselines below assume a standard 12-team league (1 QB, 2 RB, 2 WR,
-- 1 TE, 1 flex) - this app doesn't have a single fixed league size to
-- calibrate against exactly, but these match what public consensus
-- ADP (FantasyPros et al.) already assumes, so it's a reasonable
-- default rather than an arbitrary one.

with pos_ranked as (
  select
    id, league, pos, avg_pts,
    row_number() over (partition by league, pos order by avg_pts desc) as pos_rank,
    count(*) over (partition by league, pos) as pos_count
  from players
  where league in ('NFL', 'CFB') and avg_pts > 0
),
target as (
  select
    id, league, pos, avg_pts, pos_rank,
    least(
      case pos
        when 'QB' then 14
        when 'RB' then 30
        when 'WR' then 36
        when 'TE' then 14
        when 'K'  then 12
        else 12
      end,
      pos_count
    ) as replacement_rank
  from pos_ranked
),
replacement as (
  select league, pos, min(avg_pts) as replacement_pts
  from target
  where pos_rank = replacement_rank
  group by league, pos
),
valued as (
  select t.id, t.league, t.avg_pts - r.replacement_pts as vbd
  from target t
  join replacement r on r.league = t.league and r.pos = t.pos
),
-- CFB's raw stat totals run systematically higher than NFL's (more
-- plays per game, far more lopsided competition), so CFB's VBD
-- values were inflated by scale alone, not real value - flattening
-- each league to its own 0-1 range (1.0 = that league's own best
-- player) before combining keeps each league's internal positional-
-- scarcity shape while removing the cross-league scale mismatch.
scaled as (
  select id, vbd / nullif(max(vbd) over (partition by league), 0) as vbd_scaled
  from valued
),
ranked as (
  select id, row_number() over (order by vbd_scaled desc) as rnk
  from scaled
)
update players p
set adp = ranked.rnk
from ranked
where p.id = ranked.id;
