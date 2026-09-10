-- Updates the recurring blend-and-rank-projections job (originally
-- scheduled in 20260910160500) to the role-weighted blend
-- (20260910163000) instead of the plain shrinkage blend it replaces -
-- same schedule (every 2 hours), same job name, new body.
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
        when tp.team_pos_usage < 8 or tp.max_usage = 0 then 1.0
        else greatest(0.05, u.usage::numeric / tp.max_usage)
      end as role_weight
    from cfb_usage u
    join cfb_team_pos tp on tp.team = u.team and tp.pos = u.pos
  ),
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
