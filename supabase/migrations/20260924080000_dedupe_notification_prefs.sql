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
-- uses — deletes the rest, and makes "one global row per user" a rule
-- the database enforces (NULLS NOT DISTINCT, Postgres 15+).
--
-- Deletes data, so it's run by hand, once:
--   supabase db query --linked -f supabase/migrations/20260924080000_dedupe_notification_prefs.sql
-- ══════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM public.notification_preferences AS stale
USING public.notification_preferences AS newer
WHERE stale.league_id IS NULL
  AND newer.league_id IS NULL
  AND stale.user_id = newer.user_id
  AND (newer.updated_at, newer.id) > (stale.updated_at, stale.id);

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_user_id_league_id_key;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_user_id_league_id_key
  UNIQUE NULLS NOT DISTINCT (user_id, league_id);

COMMIT;
