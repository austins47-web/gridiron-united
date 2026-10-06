-- The commissioner's holiday theme for the league (Commish panel →
-- Shop TV): null follows the calendar (src/lib/holiday.ts), 'off' never
-- shows one, and a theme's key keeps that theme on until changed (a
-- whole month of Halloween). The Shop TV and the app's banner use it.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS tv_theme text
  CHECK (tv_theme IS NULL OR tv_theme IN (
    'off', 'kickoff', 'halloween', 'veterans', 'thanksgiving', 'christmas',
    'newyear', 'playoffs', 'superbowl', 'july4'
  ));
