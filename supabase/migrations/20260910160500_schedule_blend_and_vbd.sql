-- Replaces the standalone weekly 'recompute-vbd-adp' cron
-- (20260910151500_schedule_vbd_adp_recompute.sql) with a single job
-- that runs the live-stats blend (20260910160000) immediately
-- followed by the unscaled VBD rerank (20260910150000, post
-- cross-league-scaling removal) in the same transaction, so avg_pts
-- and adp never disagree with each other between the two steps.
--
-- Scheduled every 2 hours instead of weekly: the blend now depends on
-- live_player_stats, which poll-live-stats updates every minute while
-- games are in progress, so avg_pts/adp can now meaningfully update
-- DURING a game day instead of only once a week after the fact. For a
-- player with zero games played this season the blend is a no-op
-- (see 20260910160000's comment), so running this often costs nothing
-- for the vast majority of the pool that hasn't played yet in a given
-- week.

select cron.unschedule('recompute-vbd-adp') where exists (
  select 1 from cron.job where jobname = 'recompute-vbd-adp'
);

select cron.unschedule('blend-and-rank-projections') where exists (
  select 1 from cron.job where jobname = 'blend-and-rank-projections'
);

select cron.schedule(
  'blend-and-rank-projections',
  '0 */2 * * *',
  $$
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
  joined as (
    select
      p.id,
      coalesce(b.prior_avg_pts, 0)   as prior_avg_pts,
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
  ranked as (
    select id, row_number() over (order by vbd desc) as rnk
    from valued
  )
  update players p
  set adp = ranked.rnk
  from ranked
  where p.id = ranked.id;
  $$
);
