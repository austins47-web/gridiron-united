-- ══════════════════════════════════════════════════════════════
-- One-time cleanup: duplicate global notification-preference rows
--
-- Every global settings save used to INSERT a new row: the
-- (user_id, league_id) unique constraint never matched a NULL
-- league_id (NULLs are distinct in a unique constraint), so the upsert
-- never found the existing row. The app and send-reminders now read
-- and update each user's newest row, so the older ones are dead
-- weight (57 rows across 3 users when this was written).
--
-- This keeps each user's newest global row — the one the app already
-- uses — and MOVES the older ones into
-- notification_preferences_duplicates_20260924 (not deleted: nothing
-- is lost, and any row can be copied back). Then it makes "one global
-- row per user" a rule the database enforces (NULLS NOT DISTINCT,
-- Postgres 15+). The backup table has RLS on with no policies, so
-- only the service role can read it; drop it whenever it's no longer
-- wanted.
--
-- Applied 2026-09-24 with:
--   supabase db query --linked -f supabase/migrations/20260924080000_dedupe_notification_prefs.sql
-- ══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_preferences_duplicates_20260924
  (LIKE public.notification_preferences INCLUDING DEFAULTS);
ALTER TABLE public.notification_preferences_duplicates_20260924 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.notification_preferences_duplicates_20260924
SELECT stale.*
FROM public.notification_preferences AS stale
WHERE stale.league_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.notification_preferences AS newer
    WHERE newer.league_id IS NULL
      AND newer.user_id = stale.user_id
      AND (newer.updated_at, newer.id) > (stale.updated_at, stale.id)
  );

DELETE FROM public.notification_preferences AS p
USING public.notification_preferences_duplicates_20260924 AS moved
WHERE p.id = moved.id;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_user_id_league_id_key;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_user_id_league_id_key
  UNIQUE NULLS NOT DISTINCT (user_id, league_id);

COMMIT;
