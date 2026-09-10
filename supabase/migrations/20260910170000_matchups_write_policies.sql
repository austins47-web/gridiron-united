-- matchups had a SELECT policy only (matchups_read) - confirmed
-- directly via pg_policies. No INSERT or UPDATE policy has ever
-- existed, so any client-side write to this table (the new
-- round-robin schedule generation in useDraft.ts, or the Matchup
-- tab's own opportunistic score write-back) would be silently
-- rejected by RLS with zero matching rows affected.
--
-- INSERT: any member of the league can insert matchup rows for that
-- league - mirrors matchups_read's own membership check. Can't
-- restrict to "commissioner only" here, since schedule generation
-- fires from whichever member's browser happens to complete the
-- final draft pick (not necessarily the commissioner's).
--
-- UPDATE: same membership check, needed so the Matchup tab can write
-- real computed scores back onto the row it just displayed - without
-- this, matchups.home_score/away_score stay 0 forever, which is
-- exactly the state the Home dashboard's matchup widget and the
-- League Hall of Fame view are already reading and have always shown
-- as blank/zero, since nothing has ever written to this table.
create policy matchups_insert on matchups
  for insert
  with check (
    exists (
      select 1 from league_members
      where league_members.league_id = matchups.league_id
        and league_members.user_id = auth.uid()
    )
  );

create policy matchups_update on matchups
  for update
  using (
    exists (
      select 1 from league_members
      where league_members.league_id = matchups.league_id
        and league_members.user_id = auth.uid()
    )
  );
