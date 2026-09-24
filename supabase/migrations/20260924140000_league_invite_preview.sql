-- What an invite link may show about a league before you've joined it:
-- the name and format, how many people are in, and who runs it. Used by
-- the invite page and the link preview (/join/:code → api/join), so it
-- doesn't depend on being able to read the leagues table directly.
create or replace function public.league_invite_preview(p_code text)
returns table (
  id uuid,
  name text,
  league_type text,
  scoring_type text,
  draft_type text,
  num_teams integer,
  season integer,
  member_count integer,
  commissioner text,
  pick_lock_type text,
  pick_deadline_day smallint,
  pick_deadline_time text,
  pick_deadline_tz text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.name, l.league_type, l.scoring_type, l.draft_type, l.num_teams, l.season,
    (select count(*)::int from public.league_members m where m.league_id = l.id),
    coalesce(p.display_name, p.username),
    l.pick_lock_type, l.pick_deadline_day, l.pick_deadline_time, l.pick_deadline_tz
  from public.leagues l
  left join public.profiles p on p.id = l.commissioner_id
  where p_code is not null
    and char_length(p_code) between 4 and 32
    and l.invite_code = upper(p_code)
  limit 1
$$;

revoke all on function public.league_invite_preview(text) from public;
grant execute on function public.league_invite_preview(text) to anon, authenticated;
