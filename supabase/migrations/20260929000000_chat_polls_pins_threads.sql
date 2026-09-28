-- League chat: polls, the commissioner's pinned announcement, and a
-- chat thread for each game.

-- ── Game threads ────────────────────────────────────────────────
-- A message with a game_id belongs to that game's thread instead of
-- the main chat.
alter table public.league_messages
  add column if not exists game_id uuid references public.nfl_games(id) on delete set null;
create index if not exists league_messages_game_idx
  on public.league_messages (league_id, game_id, created_at desc)
  where game_id is not null;

-- Same guard as before, and a message can't move between threads
create or replace function public.league_messages_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.league_id is distinct from old.league_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.is_system is distinct from old.is_system
     or new.reply_to_id is distinct from old.reply_to_id
     or new.game_id is distinct from old.game_id then
    raise exception 'Only a message''s text can be changed';
  end if;
  if old.deleted_at is not null then
    raise exception 'That message was deleted';
  end if;

  if new.deleted_at is not null then
    new.message := '';
    new.deleted_at := now();
    new.edited_at := old.edited_at;
  elsif new.message is distinct from old.message then
    if char_length(trim(new.message)) = 0 then
      raise exception 'A message can''t be empty';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

-- A reply has to point at a message in the same league and thread
drop policy if exists messages_insert on public.league_messages;
create policy messages_insert on public.league_messages
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.league_members
      where league_members.league_id = league_messages.league_id
        and league_members.user_id = auth.uid()
    )
    and (
      reply_to_id is null
      or exists (
        select 1 from public.league_messages original
        where original.id = league_messages.reply_to_id
          and original.league_id = league_messages.league_id
          and original.game_id is not distinct from league_messages.game_id
      )
    )
  );

-- ── Polls ───────────────────────────────────────────────────────
-- Posted in chat as a message "POLL:<id>" from whoever started it
-- (user_id null for the Commish's weekly poll).
create table if not exists public.league_polls (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  -- null: posted by the Commish
  created_by uuid references public.profiles(id) on delete set null,
  question   text not null check (char_length(trim(question)) between 1 and 140),
  options    text[] not null check (array_length(options, 1) between 2 and 6),
  closes_at  timestamptz,
  game_id    uuid references public.nfl_games(id) on delete set null,
  -- The Commish's weekly poll: one per league per week
  kind       text,
  season     int,
  week       int,
  created_at timestamptz not null default now()
);
create index if not exists league_polls_league_idx on public.league_polls (league_id, created_at desc);
create unique index if not exists league_polls_weekly_idx
  on public.league_polls (league_id, kind, season, week)
  where kind is not null;

alter table public.league_polls enable row level security;

drop policy if exists polls_read on public.league_polls;
create policy polls_read on public.league_polls
  for select
  using (exists (
    select 1 from public.league_members
    where league_members.league_id = league_polls.league_id
      and league_members.user_id = auth.uid()
  ));
-- No direct writes: create_league_poll posts the poll and its message together

create table if not exists public.league_poll_votes (
  poll_id      uuid not null references public.league_polls(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  league_id    uuid not null references public.leagues(id) on delete cascade,
  option_index smallint not null check (option_index >= 0),
  created_at   timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists league_poll_votes_league_idx on public.league_poll_votes (league_id);

alter table public.league_poll_votes enable row level security;

drop policy if exists poll_votes_read on public.league_poll_votes;
create policy poll_votes_read on public.league_poll_votes
  for select
  using (exists (
    select 1 from public.league_members
    where league_members.league_id = league_poll_votes.league_id
      and league_members.user_id = auth.uid()
  ));

-- Your own vote, on an open poll in your league, for one of its options
create or replace function public.poll_vote_ok(p_poll uuid, p_league uuid, p_option int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from league_polls p
    where p.id = p_poll
      and p.league_id = p_league
      and (p.closes_at is null or p.closes_at > now())
      and (p_option is null or p_option < array_length(p.options, 1))
  ) and exists (
    select 1 from league_members m
    where m.league_id = p_league and m.user_id = auth.uid()
  );
$$;

drop policy if exists poll_votes_insert on public.league_poll_votes;
create policy poll_votes_insert on public.league_poll_votes
  for insert
  with check (auth.uid() = user_id and public.poll_vote_ok(poll_id, league_id, option_index));

drop policy if exists poll_votes_update on public.league_poll_votes;
create policy poll_votes_update on public.league_poll_votes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.poll_vote_ok(poll_id, league_id, option_index));

drop policy if exists poll_votes_delete on public.league_poll_votes;
create policy poll_votes_delete on public.league_poll_votes
  for delete
  using (auth.uid() = user_id and public.poll_vote_ok(poll_id, league_id, null));

create or replace function public.create_league_poll(
  p_league    uuid,
  p_question  text,
  p_options   text[],
  p_closes_at timestamptz default null,
  p_game      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_opts text[];
  v_q    text := trim(coalesce(p_question, ''));
begin
  if auth.uid() is null or not exists (
    select 1 from league_members where league_id = p_league and user_id = auth.uid()
  ) then
    raise exception 'Only league members can start a poll';
  end if;
  if char_length(v_q) not between 1 and 140 then
    raise exception 'The question needs 1 to 140 characters';
  end if;
  select array_agg(trim(o) order by n) into v_opts
    from unnest(p_options) with ordinality as t(o, n)
    where char_length(trim(o)) > 0;
  if coalesce(array_length(v_opts, 1), 0) not between 2 and 6 then
    raise exception 'A poll needs 2 to 6 options';
  end if;
  if exists (select 1 from unnest(v_opts) o where char_length(o) > 60) then
    raise exception 'Keep each option to 60 characters';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'The poll would already be closed';
  end if;
  if (select count(*) from league_polls
      where league_id = p_league and created_by = auth.uid()
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That''s a lot of polls. Try again in a bit.';
  end if;

  insert into league_polls (league_id, created_by, question, options, closes_at, game_id)
    values (p_league, auth.uid(), v_q, v_opts, p_closes_at, p_game)
    returning id into v_id;
  insert into league_messages (league_id, user_id, message, is_system, game_id)
    values (p_league, auth.uid(), 'POLL:' || v_id, false, p_game);
  return v_id;
end;
$$;

revoke all on function public.create_league_poll(uuid, text, text[], timestamptz, uuid) from public, anon;
grant execute on function public.create_league_poll(uuid, text, text[], timestamptz, uuid) to authenticated;
revoke all on function public.poll_vote_ok(uuid, uuid, int) from public, anon;
grant execute on function public.poll_vote_ok(uuid, uuid, int) to authenticated;

-- ── The pinned announcement ─────────────────────────────────────
-- One per league, shown at the top of Pick'Em and the chat. Only the
-- commissioner pins or unpins, through the functions below.
create table if not exists public.league_pins (
  league_id         uuid primary key references public.leagues(id) on delete cascade,
  message           text not null check (char_length(trim(message)) between 1 and 500),
  pinned_by         uuid references public.profiles(id) on delete set null,
  source_message_id uuid references public.league_messages(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.league_pins enable row level security;

drop policy if exists pins_read on public.league_pins;
create policy pins_read on public.league_pins
  for select
  using (exists (
    select 1 from public.league_members
    where league_members.league_id = league_pins.league_id
      and league_members.user_id = auth.uid()
  ));

-- Pins a chat message (p_source), or a new announcement (p_message),
-- which p_post also posts in the chat. Everyone else in the league
-- gets a notification (p_notify; an edit can skip it).
drop function if exists public.pin_league_announcement(uuid, text, uuid, boolean);
create or replace function public.pin_league_announcement(
  p_league  uuid,
  p_message text default null,
  p_source  uuid default null,
  p_post    boolean default false,
  p_notify  boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text   text := trim(coalesce(p_message, ''));
  v_source uuid := p_source;
  v_name   text;
  v_league text;
begin
  if auth.uid() is null or not exists (
    select 1 from league_members
    where league_id = p_league and user_id = auth.uid() and is_commissioner
  ) then
    raise exception 'Only the commissioner can pin announcements';
  end if;

  if v_source is not null then
    select trim(message) into v_text from league_messages
      where id = v_source and league_id = p_league and deleted_at is null
        and not coalesce(is_system, false);
    if v_text is null then
      raise exception 'That message can''t be pinned';
    end if;
  end if;
  if char_length(v_text) not between 1 and 500 then
    raise exception 'An announcement needs 1 to 500 characters';
  end if;

  select coalesce(display_name, username, 'The commissioner') into v_name from profiles where id = auth.uid();
  select name into v_league from leagues where id = p_league;

  if v_source is null and p_post then
    insert into league_messages (league_id, user_id, message, is_system)
      values (p_league, auth.uid(), v_text, false)
      returning id into v_source;
  elsif v_source is not null then
    insert into league_messages (league_id, user_id, message, is_system)
      values (p_league, null, '📌 ' || v_name || ' pinned a message', true);
  end if;

  insert into league_pins (league_id, message, pinned_by, source_message_id, created_at, updated_at)
    values (p_league, v_text, auth.uid(), v_source, now(), now())
    on conflict (league_id) do update
      set message = excluded.message, pinned_by = excluded.pinned_by,
          source_message_id = excluded.source_message_id, updated_at = now();

  if not p_notify then
    return;
  end if;
  insert into notifications (user_id, league_id, type, title, body, is_read, data)
    select m.user_id, p_league, 'announcement',
           '📌 ' || v_name || ' pinned an announcement',
           case when char_length(v_text) > 90 then left(v_text, 87) || '…' else v_text end,
           false, jsonb_build_object('league_id', p_league, 'league_name', v_league)
    from league_members m
    where m.league_id = p_league and m.user_id <> auth.uid();
end;
$$;

create or replace function public.unpin_league_announcement(p_league uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from league_members
    where league_id = p_league and user_id = auth.uid() and is_commissioner
  ) then
    raise exception 'Only the commissioner can unpin announcements';
  end if;
  delete from league_pins where league_id = p_league;
end;
$$;

revoke all on function public.pin_league_announcement(uuid, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.pin_league_announcement(uuid, text, uuid, boolean, boolean) to authenticated;
revoke all on function public.unpin_league_announcement(uuid) from public, anon;
grant execute on function public.unpin_league_announcement(uuid) to authenticated;

-- ── Live updates ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'league_poll_votes'
  ) then
    alter publication supabase_realtime add table public.league_poll_votes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'league_pins'
  ) then
    alter publication supabase_realtime add table public.league_pins;
  end if;
end $$;
