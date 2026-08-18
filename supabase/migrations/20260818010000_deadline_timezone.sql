-- ══════════════════════════════════════════════════════════════
-- Timezone-aware pick deadlines
--
-- A weekly deadline is a WALL-CLOCK time in a specific zone
-- ("Wednesdays at 5:00 PM Mountain"), not a fixed UTC offset.
-- Storing UTC would silently shift by an hour across DST, so we
-- store the local day + time plus the IANA zone and resolve to
-- UTC at read time.
-- ══════════════════════════════════════════════════════════════

alter table public.leagues
  add column if not exists pick_deadline_tz text;

comment on column public.leagues.pick_deadline_tz is
  'IANA timezone (e.g. America/Denver) that pick_deadline_day and pick_deadline_time are expressed in. Null means UTC.';

comment on column public.leagues.pick_deadline_day is
  'Day of week 0-6 (Sun-Sat) in pick_deadline_tz, NOT in UTC.';

comment on column public.leagues.pick_deadline_time is
  'Wall-clock HH:MM in pick_deadline_tz, NOT in UTC.';

-- Existing rows were saved as UTC wall-clock, so tag them as UTC
-- to preserve their current behaviour.
update public.leagues
   set pick_deadline_tz = 'UTC'
 where pick_lock_type = 'deadline'
   and pick_deadline_tz is null;
