-- ── Historical lineup locking ───────────────────────────────────
-- Until now, a week's starters were only ever "remembered" if a user
-- manually edited that specific week (see useWeekLineup/RosterView) -
-- an untouched week just falls back to reading the CURRENT permanent
-- roster (week 0), forever. That means browsing to a past week shows
-- whoever you own RIGHT NOW scored against that week's real stats,
-- not who you actually started back then - if you've since dropped
-- or added anyone, history silently rewrites itself.
--
-- This locks every league's CURRENT fantasy week in automatically,
-- the same "materialize" snapshot RosterView already does on a
-- manual edit, just run on a schedule instead of waiting for a user
-- to touch it. Once a week is locked, it's a real, independent set of
-- rows - later drops/adds to the permanent roster can't retroactively
-- change what that week shows, because useWeekLineup already prefers
-- week-N rows over week-0 the moment any exist for that week.
--
-- "Current week" is derived directly from real schedule data already
-- in this DB (nfl_games / live_games), not a fresh ESPN call - the
-- most recent game whose kickoff has already passed is "the current
-- week", same definition the frontend's ESPN-scoreboard-based
-- current-week endpoint effectively reflects. Matches each league's
-- own player_pool: CFB-only leagues lock to CFB's week, everyone else
-- (including "both") locks to NFL's - same rule RosterView/MatchupView
-- already use for their own default week.
--
-- Idempotent and cheap to run often (hourly): only inserts for a
-- (league, user) pair that doesn't already have a row at that week.

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
      14  -- REGULAR_SEASON_WEEKS (src/lib/scheduling.ts)
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
