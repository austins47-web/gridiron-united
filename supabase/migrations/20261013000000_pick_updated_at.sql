-- pickem_picks.updated_at now moves on every change. It only ever held the
-- time a pick was first made (nothing set it on an update), so a changed
-- tiebreaker guess or a switched pick left no trace of when it changed.
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
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
