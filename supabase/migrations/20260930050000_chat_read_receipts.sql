-- Read receipts for league chat: how far each member has read in each
-- room (the main chat, or a game's thread). read_at is the time of the
-- newest message they've seen, so a message is "seen by" everyone whose
-- read_at is at or after it. The chat shows their avatars under the last
-- message each one has seen.
--
-- user_id references auth.users, not profiles: a table keyed on
-- (league_id, user_id) that pointed at both leagues and profiles would be
-- a second leagues <-> profiles route for PostgREST, and a bare
-- profiles(...) embed then fails as ambiguous (that's what blanked the
-- chat after the reactions table went in).
create table if not exists public.league_chat_reads (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- 'main', or the game id of a thread
  room       text not null,
  read_at    timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id, room)
);

alter table public.league_chat_reads enable row level security;

drop policy if exists chat_reads_read on public.league_chat_reads;
create policy chat_reads_read on public.league_chat_reads
  for select
  using (exists (
    select 1 from public.league_members
    where league_members.league_id = league_chat_reads.league_id
      and league_members.user_id = auth.uid()
  ));

drop policy if exists chat_reads_insert on public.league_chat_reads;
create policy chat_reads_insert on public.league_chat_reads
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.league_members
      where league_members.league_id = league_chat_reads.league_id
        and league_members.user_id = auth.uid()
    )
  );

drop policy if exists chat_reads_update on public.league_chat_reads;
create policy chat_reads_update on public.league_chat_reads
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Moves your read mark forward (never back, never past now). Runs as the
-- caller, so the policies above apply.
create or replace function public.mark_chat_read(p_league uuid, p_room text, p_at timestamptz)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.league_chat_reads (league_id, user_id, room, read_at)
  values (p_league, auth.uid(), p_room, least(p_at, now()))
  on conflict (league_id, user_id, room) do update
    set read_at = greatest(league_chat_reads.read_at, excluded.read_at),
        updated_at = now()
    where excluded.read_at > league_chat_reads.read_at;
$$;

grant execute on function public.mark_chat_read(uuid, text, timestamptz) to authenticated;

-- Live: receipts move as people read
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'league_chat_reads'
  ) then
    alter publication supabase_realtime add table public.league_chat_reads;
  end if;
end $$;
