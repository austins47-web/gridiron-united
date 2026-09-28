-- ══════════════════════════════════════════════════════════════
-- Pick receipts, line moves and injury news on picks
--
-- pickem_picks
--   reason          an optional one-liner ("Bo Nix is HIM", ≤140
--                   chars), shown on the Board once the game kicks
--                   off — the same point the pick itself goes public
--   spread_at_pick  the game's line (home spread, nfl_games.spread)
--                   when this team was picked
--   picked_at       when this team was picked
--   Both kept by a trigger: set when a pick is made or switched to the
--   other team, left alone otherwise — the app re-saves every pick on
--   each change, so it can't be trusted to send them.
--
-- players.status_changed_at: when a player's injury status last
-- changed (the injury sync rewrites every row, so updated_at can't
-- say). send-reminders only warns you about injury news that broke
-- after you made your pick.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.pickem_picks
  ADD COLUMN IF NOT EXISTS reason         text,
  ADD COLUMN IF NOT EXISTS spread_at_pick real,
  ADD COLUMN IF NOT EXISTS picked_at      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pickem_picks_reason_len') THEN
    ALTER TABLE public.pickem_picks
      ADD CONSTRAINT pickem_picks_reason_len CHECK (reason IS NULL OR char_length(reason) <= 140);
  END IF;
END $$;

-- Existing picks: when they were made, and — for games that haven't
-- kicked off — today's line as the baseline. (Before the trigger
-- exists, so it doesn't overwrite these.)
UPDATE public.pickem_picks SET picked_at = coalesce(updated_at, created_at) WHERE picked_at IS NULL;
UPDATE public.pickem_picks p
   SET spread_at_pick = g.spread
  FROM public.nfl_games g
 WHERE g.id = p.game_id AND g.status = 'scheduled' AND p.spread_at_pick IS NULL;

CREATE OR REPLACE FUNCTION public.pickem_pick_track()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.picked_team IS DISTINCT FROM OLD.picked_team THEN
    NEW.picked_at := now();
    NEW.spread_at_pick := (SELECT g.spread FROM public.nfl_games g WHERE g.id = NEW.game_id);
  ELSE
    NEW.picked_at := OLD.picked_at;
    NEW.spread_at_pick := OLD.spread_at_pick;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pickem_pick_track ON public.pickem_picks;
CREATE TRIGGER pickem_pick_track
  BEFORE INSERT OR UPDATE ON public.pickem_picks
  FOR EACH ROW EXECUTE FUNCTION public.pickem_pick_track();

-- Injury status changes. Current injuries get no timestamp: nobody is
-- warned about news that was already out before this existed.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.players_status_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_status_changed ON public.players;
CREATE TRIGGER players_status_changed
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_status_changed();
