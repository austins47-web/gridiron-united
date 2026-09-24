-- League chat: replies, editing and deleting your own messages, and
-- emoji reactions.

-- ── Replies, edits, deletes ─────────────────────────────────────
alter table public.league_messages
  add column if not exists reply_to_id uuid references public.league_messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Only the text of your own message can change, and deleting clears it
-- (the row stays so replies to it still make sense). Timestamps are set
-- here, not trusted from the browser.
create or replace function public.league_messages_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.league_id is distinct from old.league_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.is_system is distinct from old.is_system
     or new.reply_to_id is distinct from old.reply_to_id then
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

drop trigger if exists league_messages_guard_update on public.league_messages;
create trigger league_messages_guard_update
  before update on public.league_messages
  for each row execute function public.league_messages_guard_update();

drop policy if exists messages_update_own on public.league_messages;
create policy messages_update_own on public.league_messages
  for update
  using (auth.uid() = user_id and not coalesce(is_system, false))
  with check (auth.uid() = user_id and not coalesce(is_system, false));

-- A reply has to point at a message in the same league
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
      )
    )
  );

-- ── Reactions ───────────────────────────────────────────────────
create table if not exists public.league_message_reactions (
  message_id uuid not null references public.league_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists league_message_reactions_league_idx
  on public.league_message_reactions (league_id, created_at desc);

alter table public.league_message_reactions enable row level security;

drop policy if exists reactions_read on public.league_message_reactions;
create policy reactions_read on public.league_message_reactions
  for select
  using (exists (
    select 1 from public.league_members
    where league_members.league_id = league_message_reactions.league_id
      and league_members.user_id = auth.uid()
  ));

drop policy if exists reactions_insert on public.league_message_reactions;
create policy reactions_insert on public.league_message_reactions
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.league_members
      where league_members.league_id = league_message_reactions.league_id
        and league_members.user_id = auth.uid()
    )
    and exists (
      select 1 from public.league_messages
      where league_messages.id = league_message_reactions.message_id
        and league_messages.league_id = league_message_reactions.league_id
    )
  );

drop policy if exists reactions_delete on public.league_message_reactions;
create policy reactions_delete on public.league_message_reactions
  for delete
  using (auth.uid() = user_id);

-- Live updates in the chat: reactions as they're added/removed
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'league_message_reactions'
  ) then
    alter publication supabase_realtime add table public.league_message_reactions;
  end if;
end $$;
