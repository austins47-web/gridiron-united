-- Schedules the VBD ADP recompute (20260910150000_vbd_adp_ranking.sql)
-- to run weekly, 30 minutes after both projection syncs
-- (sync-nfl-projections 3:15am Tue, sync-cfb-projections 4:00am Tue)
-- would have had a chance to run. Without this, the ranking
-- methodology in that migration only reflects a one-time manual fix -
-- next Tuesday's sync would leave the old, unranked/raw-points state
-- sitting there until someone manually re-ran it again.
--
-- cron.schedule can run raw SQL directly, so this doesn't need an
-- Edge Function - it's the same query, just scheduled.

select cron.unschedule('recompute-vbd-adp') where exists (
  select 1 from cron.job where jobname = 'recompute-vbd-adp'
);

select cron.schedule(
  'recompute-vbd-adp',
  '30 4 * * 2',
  $$
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
  $$
);
