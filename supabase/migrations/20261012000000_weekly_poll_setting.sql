-- leagues.weekly_poll: the commissioner's switch for the Commish's weekly
-- upset poll in league chat (send-reminders 7b). On unless turned off, so
-- leagues keep getting it as before.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS weekly_poll boolean NOT NULL DEFAULT true;
