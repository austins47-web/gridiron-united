-- ── Real-stats projection infrastructure ───────────────────────────
-- Every avg_pts/adp update up to this point was a one-time snapshot
-- of the PRIOR completed season's stats (2025), run through
-- fantasyPoints() once and left static until someone manually re-ran
-- a sync. The user explicitly asked for something durable instead:
-- "we need to build the infrastructure to develop our own accurate
-- projections" using real stats, not just last season's numbers.
--
-- live_player_stats is already being populated every minute by the
-- poll-live-stats cron with real current-season (2026) box-score
-- data — confirmed directly: CFB week 1 alone already has 1,074 rows
-- with real rush_yards and 326 with real pass_yards, not zeros. NFL
-- week 1 has barely started as of this writing (games kick off later
-- today), so NFL sees almost no signal yet — that's expected and
-- self-corrects as the season plays out, without needing any further
-- manual intervention, because this whole block is now scheduled
-- (see 20260910160500_schedule_blend_and_vbd.sql).
--
-- Approach: a standard shrinkage/regression blend between each
-- player's 2025 baseline rate (recomputed fresh from player_proj_stats
-- every run, NOT from players.avg_pts — that column gets overwritten
-- by this same job, so reading it back would compound last run's
-- blend into this one instead of regressing toward a fixed prior)
-- and their real 2026 production so far:
--
--   blended_avg = (prior_avg_pts * K + total_pts_2026) / (K + games_2026)
--
-- K = 6 "games" of weight on the prior. With zero 2026 games played,
-- blended_avg reduces exactly to prior_avg_pts (no live data to blend
-- yet — nothing changes for a player who hasn't played). By 6 games
-- in, the prior and this season's real production are weighted
-- evenly. Past that, real 2026 performance increasingly dominates,
-- which is exactly what "let real stats decide, even if that means
-- CFB dominates the board" requires — CFB's larger, more lopsided
-- raw stat totals are now real signal, not something to flatten away
-- (see 20260910160800_remove_cross_league_adp_scaling.sql).
--
-- IDs: live_player_stats.espn_athlete_id is the only reliable join
-- key (player_id is null on the majority of rows — confirmed: only
-- 1,527 of 7,778 2026 rows have it set). NFL players don't store
-- espn_athlete_id at all (always null on that table); their id is
-- espn_athlete_id + 1_000_000. CFB players store espn_athlete_id
-- directly. Both are derived here rather than trusting the live
-- table's own player_id column.

with live_agg as (
  select
    case when l.league = 'NFL' then l.espn_athlete_id + 1000000
         else l.espn_athlete_id + 50000000 end as id,
    l.league,
    count(distinct l.game_id) as games_2026,
    sum(l.pass_yards)  as pass_yards,  sum(l.pass_tds) as pass_tds, sum(l.pass_ints) as pass_ints,
    sum(l.rush_yards)  as rush_yards,  sum(l.rush_tds) as rush_tds,
    sum(l.rec_yards)   as rec_yards,   sum(l.rec_tds)  as rec_tds, sum(l.receptions) as receptions,
    sum(l.fg_0_39)     as fg_0_39,     sum(l.fg_40_49) as fg_40_49, sum(l.fg_50_plus) as fg_50_plus,
    sum(l.pat_made)    as pat_made,    sum(l.fg_miss)  as fg_miss
  from live_player_stats l
  where l.season = 2026
  group by 1, 2
),
live_pts as (
  select id, league, games_2026,
    (pass_yards * 0.04 + pass_tds * 4 + pass_ints * -2 +
     rush_yards * 0.1  + rush_tds * 6 +
     rec_yards  * 0.1  + rec_tds  * 6 + receptions * 0.5 +
     fg_0_39 * 3 + fg_40_49 * 4 + fg_50_plus * 5 + pat_made * 1 + fg_miss * -1
    ) as total_pts_2026
  from live_agg
),
baseline as (
  -- source = 'espn' only: player_proj_stats still holds ~4,464 stale
  -- rows from the old CollegeFootballData-based CFB sync (source =
  -- 'cfbd'), predating the rewrite onto ESPN. Those rows use CFBD's
  -- own numeric player-ID scheme, which is a completely different
  -- namespace from ESPN's - but since both are just integers, some
  -- of them numerically collide with a real NFL player's derived
  -- espn_athlete_id and were silently overwriting that player's
  -- baseline with an unrelated stranger's old college stats
  -- (confirmed directly: "Haynes King" showing an NFL id whose
  -- derived espn_athlete_id collided with a leftover cfbd row).
  select
    espn_athlete_id,
    case when games_played > 0 then
      (proj_pass_yards * 0.04 + proj_pass_tds * 4 + proj_pass_ints * -2 +
       proj_rush_yards * 0.1  + proj_rush_tds * 6 +
       proj_rec_yards  * 0.1  + proj_rec_tds  * 6 + proj_receptions * 0.5 +
       proj_fg_0_39 * 3 + proj_fg_40_49 * 4 + proj_fg_50_plus * 5 + proj_pat * 1 + proj_fg_miss * -1
      ) / games_played
    else 0 end as prior_avg_pts
  from player_proj_stats
  where source = 'espn'
  -- No season filter: sync-nfl-projections writes season=2025
  -- (hardcoded, its most-recently-completed season), but
  -- sync-cfb-projections writes season=new Date().getFullYear()
  -- (2026) since CFB's season was already underway when that
  -- function was rewritten - filtering on season=2025 silently
  -- excluded 100% of CFB baselines (confirmed directly: Joshua Dye's
  -- real espn-sourced row is season=2026 and was being skipped
  -- entirely). player_proj_stats is upserted onConflict:
  -- espn_athlete_id, so there's exactly one row per athlete
  -- regardless of season - no ambiguity from dropping the filter.
),
joined as (
  select
    p.id,
    coalesce(b.prior_avg_pts, 0)  as prior_avg_pts,
    coalesce(lp.total_pts_2026, 0) as total_pts_2026,
    coalesce(lp.games_2026, 0)     as games_2026
  from players p
  left join baseline b
    on b.espn_athlete_id = case when p.league = 'NFL' then p.id - 1000000 else p.espn_athlete_id end
  left join live_pts lp
    on lp.id = p.id and lp.league = p.league
  where p.league in ('NFL', 'CFB')
),
blended as (
  select id, (prior_avg_pts * 6 + total_pts_2026) / (6 + games_2026) as blended_avg_pts
  from joined
  where prior_avg_pts > 0 or games_2026 > 0
)
update players p
set avg_pts    = round(b.blended_avg_pts::numeric, 1),
    proj_pts   = round(b.blended_avg_pts::numeric, 1),
    updated_at = now()
from blended b
where p.id = b.id;

-- Reset anyone who no longer has ANY valid support (no real espn
-- baseline, no 2026 live production) but still shows a leftover
-- avg_pts/adp from before that support existed - same shape as the
-- earlier stale-ADP cleanups (20260910140200, 20260910152000), now
-- needed here too: the UPDATE above only touches rows that ARE in
-- the blended set, so a player whose only "signal" was a stale
-- purged cfbd-collision row (see 20260910161500) would otherwise
-- keep showing that corrupted number forever, since nothing ever
-- overwrites it once it drops out of the blended set. CTEs don't
-- carry across statements, so the join chain is repeated here.
with live_agg2 as (
  select
    case when l.league = 'NFL' then l.espn_athlete_id + 1000000
         else l.espn_athlete_id + 50000000 end as id,
    l.league,
    count(distinct l.game_id) as games_2026
  from live_player_stats l
  where l.season = 2026
  group by 1, 2
),
baseline2 as (
  select espn_athlete_id
  from player_proj_stats
  where source = 'espn' and games_played > 0
),
joined2 as (
  select p.id,
    exists (
      select 1 from baseline2 b
      where b.espn_athlete_id = case when p.league = 'NFL' then p.id - 1000000 else p.espn_athlete_id end
    ) as has_baseline,
    coalesce((select games_2026 from live_agg2 la where la.id = p.id and la.league = p.league), 0) as games_2026
  from players p
  where p.league in ('NFL', 'CFB')
)
update players p
set avg_pts = 0, proj_pts = 0, adp = 999, updated_at = now()
from joined2 j
where p.id = j.id
  and not j.has_baseline and j.games_2026 = 0
  and (p.avg_pts <> 0 or p.adp <> 999);
