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
-- Previously flattened each league to its own 0-1 range before
-- combining, to offset CFB's systematically higher raw stat totals.
-- Removed on explicit instruction: "If CFB needs to dominate let
-- them, I need real stats and real projections." Real VBD values now
-- compared directly across leagues, no artificial scale correction -
-- if CFB's real production supports CFB players ranking above NFL
-- players, that's what shows.
ranked as (
  select id, row_number() over (order by vbd desc) as rnk
  from valued
)
update players p
set adp = ranked.rnk
from ranked
where p.id = ranked.id;
