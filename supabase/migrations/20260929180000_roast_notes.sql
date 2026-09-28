-- leagues.roast_notes: the commissioner's note about the league for the
-- weekly roast (who's in it, a job everyone shares), read by
-- send-reminders alongside the week's results. Commissioners already
-- update their own league row.
alter table public.leagues
  add column if not exists roast_notes text
    check (roast_notes is null or char_length(roast_notes) <= 500);
