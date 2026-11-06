-- ══════════════════════════════════════════════════════════════
-- Autopilot picks at random, and nothing else
--
-- The commissioner found Favorites, Home teams and League majority too
-- strong: forgetting to pick did about as well as picking. Autopilot is
-- now on or off, and when it's on, each game it fills is a coin flip
-- (_shared/autopilot.ts).
--
-- Everyone who had a rule keeps autopilot on, as 'random'. Their
-- updated_at stays as it was (the stamp trigger is held off for this),
-- since autopilot only fills games that locked after it was turned on.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.pickem_autopilot DROP CONSTRAINT IF EXISTS pickem_autopilot_rule_check;

ALTER TABLE public.pickem_autopilot DISABLE TRIGGER pickem_autopilot_stamp;
UPDATE public.pickem_autopilot SET rule = 'random' WHERE rule <> 'random';
ALTER TABLE public.pickem_autopilot ENABLE TRIGGER pickem_autopilot_stamp;

ALTER TABLE public.pickem_autopilot
  ADD CONSTRAINT pickem_autopilot_rule_check CHECK (rule = 'random');
ALTER TABLE public.pickem_autopilot ALTER COLUMN rule SET DEFAULT 'random';
