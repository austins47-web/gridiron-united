-- notification_preferences.notify_conquest: Conquest's telegrams from the
-- front (send-reminders section 9), phone only: an attack ordered on you
-- when the week's orders come out, and your news when a week settles.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notify_conquest boolean NOT NULL DEFAULT true;
