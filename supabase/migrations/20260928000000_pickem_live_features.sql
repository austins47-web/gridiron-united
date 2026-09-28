-- ══════════════════════════════════════════════════════════════
-- Pick'Em live features: win-the-week odds, upset siren, bad beats,
-- the AI roast recap
--
-- nfl_games gets what sync-nfl-schedule reads off ESPN:
--   pregame_home_wp  the home team's chance to win before kickoff,
--                    from the DraftKings moneyline with the vig
--                    removed (else the spread). Frozen at kickoff, so
--                    it records who the favorite actually was.
--   spread           home team's line (-3.5 = home favored by 3.5)
--   over_under       projected combined points
--   live_home_wp     ESPN's live win probability for the home team
--   period, clock    where a live game is
--   game_story       once final, how it was lost: the loser's best
--                    second-half win chance and the score that put
--                    the winner ahead for good (see sync-nfl-schedule)
--
-- leagues.ai_recap: the commissioner's opt-in for a Claude-written
-- roast of each week, posted to league chat after the week's final.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.nfl_games
  ADD COLUMN IF NOT EXISTS pregame_home_wp real,
  ADD COLUMN IF NOT EXISTS spread          real,
  ADD COLUMN IF NOT EXISTS over_under      real,
  ADD COLUMN IF NOT EXISTS live_home_wp    real,
  ADD COLUMN IF NOT EXISTS period          smallint,
  ADD COLUMN IF NOT EXISTS clock           text,
  ADD COLUMN IF NOT EXISTS game_story      jsonb;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS ai_recap boolean NOT NULL DEFAULT false;

-- Live win probability and the upset siren need fresher scores than
-- every 10 minutes: sync every 2.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sync-nfl-schedule'),
  schedule := '*/2 * * * *'
);

-- send-reminders' live-alert pass (upset siren, win-odds swings,
-- clinches) every 3 minutes, on its own so the full reminder run
-- keeps its 15-minute cadence. Built from the existing job's command
-- so the cron key never lands in this file.
SELECT cron.schedule(
  'send-reminders-live',
  '*/3 * * * *',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'send-reminders'),
    'send-reminders?key=',
    'send-reminders?only=live&key='
  )
);
