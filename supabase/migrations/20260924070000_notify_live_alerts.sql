-- Opt-in live game alerts (phone only): "you took the lead",
-- "you clinched", and tiebreaker sweat during the tiebreaker game.
-- Off by default — these fire mid-game, so people choose them.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notify_live_alerts boolean NOT NULL DEFAULT false;
