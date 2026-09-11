-- Runs the weekly lineup lock (20260910180000) hourly - frequent
-- enough that a week gets locked in shortly after it actually becomes
-- current (as soon as its first real game kicks off), before there's
-- much practical chance of a roster move slipping in unlocked.
select cron.unschedule('lock-weekly-lineups') where exists (
  select 1 from cron.job where jobname = 'lock-weekly-lineups'
);

select cron.schedule(
  'lock-weekly-lineups',
  '0 * * * *',
  $$
  with nfl_week as (
    select week from nfl_games where game_date <= now() order by game_date desc limit 1
  ),
  cfb_week as (
    select week from live_games where league = 'CFB' and start_time <= now() order by start_time desc limit 1
  ),
  target_leagues as (
    select
      l.id as league_id,
      least(
        greatest(
          case when l.player_pool = 'cfb'
            then coalesce((select week from cfb_week), 1)
            else coalesce((select week from nfl_week), 1)
          end,
          1
        ),
        14
      ) as target_week
    from leagues l
    where l.draft_status = 'completed' and l.league_type <> 'pickem'
  ),
  to_lock as (
    select r.league_id, r.user_id, r.player_id, r.slot, tl.target_week
    from rosters r
    join target_leagues tl on tl.league_id = r.league_id
    where r.week = 0
      and r.slot not like 'BN%' and r.slot not like 'IR%' and r.slot not like 'CFB_OS%'
      and not exists (
        select 1 from rosters r2
        where r2.league_id = r.league_id and r2.user_id = r.user_id and r2.week = tl.target_week
      )
  )
  insert into rosters (league_id, user_id, player_id, slot, week, acquired_type)
  select league_id, user_id, player_id, slot, target_week, 'draft'
  from to_lock;
  $$
);
