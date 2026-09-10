-- ── Role-aware projections ──────────────────────────────────────
-- Fixes the exact case the user reported: Joshua Dye (Ole Miss RB)
-- topped the entire combined board off a gaudy prior-season average,
-- despite being a real backup - he recorded zero rush attempts in
-- week 1 while three teammates split real carries (confirmed
-- directly: Kewan Lacy 17 att/61 yds/1 TD, Makhi Frazier and JT
-- Lindsey 7 att each, Dye 0). Pure stat-average projection has no way
-- to know that - it only sees his own historical rate, wherever it
-- came from, with no sense of whether he's actually going to touch
-- the ball this year.
--
-- Two role signals feed a single role_weight multiplier, applied
-- ONLY to the prior-season baseline term (never to real 2026
-- production - if a "backup" is actually racking up real stats,
-- that's true signal and shouldn't be suppressed):
--
-- NFL: real ESPN depth charts (sync-depth-charts), stored as
-- players.depth_chart_rank. A position- and rank-specific weight
-- table reflects how real touches/targets actually split by depth
-- slot in a typical NFL offense - a backup RB in a committee still
-- gets real work, a backup QB behind a healthy starter gets none.
-- Null (no chart entry - practice squad, or one of the 1/32 teams
-- ESPN's endpoint didn't return this run) defaults to full weight
-- rather than penalizing an unknown.
--
-- CFB: no free equivalent exists (ESPN doesn't publish CFB depth
-- charts at all - confirmed directly). Instead, once a team has
-- logged a real minimum of current-season usage at a position
-- (rush attempts for RB, targets for WR/TE, pass attempts for QB),
-- each player's role_weight is their own usage as a fraction of
-- that team-position's current usage leader - the leader stays at
-- full weight, everyone else is scaled down by how much less
-- they're actually being used, in real games, right now. Before a
-- team has enough current-season usage to judge by (early season,
-- bye weeks), no penalty is applied - there's no honest signal yet.

with live_agg as (
  select
    case when l.league = 'NFL' then l.espn_athlete_id + 1000000
         else l.espn_athlete_id + 50000000 end as id,
    l.league,
    count(distinct l.game_id) as games_2026,
    sum(l.pass_yards)  as pass_yards,  sum(l.pass_tds) as pass_tds, sum(l.pass_ints) as pass_ints,
    sum(l.pass_attempts) as pass_attempts,
    sum(l.rush_yards)  as rush_yards,  sum(l.rush_tds) as rush_tds, sum(l.rush_attempts) as rush_attempts,
    sum(l.rec_yards)   as rec_yards,   sum(l.rec_tds)  as rec_tds, sum(l.receptions) as receptions,
    sum(l.targets)     as targets,
    sum(l.fg_0_39)     as fg_0_39,     sum(l.fg_40_49) as fg_40_49, sum(l.fg_50_plus) as fg_50_plus,
    sum(l.pat_made)    as pat_made,    sum(l.fg_miss)  as fg_miss
  from live_player_stats l
  where l.season = 2026
  group by 1, 2
),
live_pts as (
  select id, league, games_2026, pass_attempts, rush_attempts, targets,
    (pass_yards * 0.04 + pass_tds * 4 + pass_ints * -2 +
     rush_yards * 0.1  + rush_tds * 6 +
     rec_yards  * 0.1  + rec_tds  * 6 + receptions * 0.5 +
     fg_0_39 * 3 + fg_40_49 * 4 + fg_50_plus * 5 + pat_made * 1 + fg_miss * -1
    ) as total_pts_2026
  from live_agg
),
baseline as (
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
),
-- CFB team-position current-season usage, keyed by the same "usage
-- stat" each position is actually judged by (carries for backs,
-- targets for pass-catchers, attempts for QB). Kickers have no real
-- share concept (one kicker plays almost every game) so they're
-- excluded - role_weight defaults to 1.0 for them.
cfb_usage as (
  select p.team, p.pos, p.id,
    case p.pos
      when 'QB' then coalesce(lp.pass_attempts, 0)
      when 'RB' then coalesce(lp.rush_attempts, 0)
      when 'WR' then coalesce(lp.targets, 0)
      when 'TE' then coalesce(lp.targets, 0)
      else 0
    end as usage
  from players p
  left join live_pts lp on lp.id = p.id and lp.league = 'CFB'
  where p.league = 'CFB' and p.pos in ('QB','RB','WR','TE')
),
cfb_team_pos as (
  select team, pos, sum(usage) as team_pos_usage, max(usage) as max_usage
  from cfb_usage
  group by team, pos
),
cfb_role_weight as (
  select u.id,
    case
      -- Not enough team-level usage yet at this position to judge
      -- role from (early season / bye week) - no penalty.
      when tp.team_pos_usage < 8 or tp.max_usage = 0 then 1.0
      else greatest(0.05, u.usage::numeric / tp.max_usage)
    end as role_weight
  from cfb_usage u
  join cfb_team_pos tp on tp.team = u.team and tp.pos = u.pos
),
-- NFL depth-slot weight table. Reflects typical real-world usage
-- split by depth rank per position in a standard NFL offense - a
-- committee RB2 still sees real touches most weeks, a WR3 sees
-- meaningfully fewer, a backup QB or K sees essentially none absent
-- an injury (which, if it happens, shows up in real 2026 production
-- and overrides this via the live blend anyway).
nfl_role_weight as (
  select p.id,
    case
      when p.depth_chart_rank is null then 1.0
      when p.depth_chart_rank = 1 then 1.0
      when p.depth_chart_rank = 2 and p.pos = 'QB' then 0.05
      when p.depth_chart_rank = 2 and p.pos = 'RB' then 0.35
      when p.depth_chart_rank = 2 and p.pos = 'WR' then 0.55
      when p.depth_chart_rank = 2 and p.pos = 'TE' then 0.35
      when p.depth_chart_rank = 2 and p.pos = 'K'  then 0.0
      when p.depth_chart_rank >= 3 and p.pos in ('RB','WR') then 0.10
      when p.depth_chart_rank >= 3 and p.pos = 'TE' then 0.05
      when p.depth_chart_rank >= 3 then 0.0
      else 1.0
    end as role_weight
  from players p
  where p.league = 'NFL'
),
joined as (
  select
    p.id,
    coalesce(b.prior_avg_pts, 0)   as prior_avg_pts,
    coalesce(lp.total_pts_2026, 0) as total_pts_2026,
    coalesce(lp.games_2026, 0)     as games_2026,
    coalesce(
      case when p.league = 'NFL' then nrw.role_weight else crw.role_weight end,
      1.0
    ) as role_weight
  from players p
  left join baseline b
    on b.espn_athlete_id = case when p.league = 'NFL' then p.id - 1000000 else p.espn_athlete_id end
  left join live_pts lp
    on lp.id = p.id and lp.league = p.league
  left join nfl_role_weight nrw on nrw.id = p.id
  left join cfb_role_weight crw on crw.id = p.id
  where p.league in ('NFL', 'CFB')
),
blended as (
  select id,
    (prior_avg_pts * role_weight * 6 + total_pts_2026) / (6 + games_2026) as blended_avg_pts
  from joined
  where prior_avg_pts > 0 or games_2026 > 0
)
update players p
set avg_pts    = round(b.blended_avg_pts::numeric, 1),
    proj_pts   = round(b.blended_avg_pts::numeric, 1),
    updated_at = now()
from blended b
where p.id = b.id;

-- Same reset pass as before (20260910160000), unchanged in shape:
-- clears avg_pts/adp for anyone with neither a real baseline nor any
-- 2026 production, so a leftover number from before that support
-- existed doesn't linger.
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
