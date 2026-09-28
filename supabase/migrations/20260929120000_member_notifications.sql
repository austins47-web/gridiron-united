-- Notifications to other people in your league.
--
-- notifications only lets you write your own rows, so every notification
-- the app sent to someone else (chat @mentions and replies, trade offers,
-- accepts, rejections, reviews and votes) was silently rejected. Chat
-- notifications are now made by the database when a message is saved;
-- everything else goes through notify_league_member, which checks that
-- both people are in the league.

alter table public.notifications
  add column if not exists sender_id uuid references public.profiles(id) on delete set null;
create index if not exists notifications_sender_idx
  on public.notifications (sender_id, created_at desc)
  where sender_id is not null;

-- ── Chat: @mentions and replies ─────────────────────────────────
create or replace function public.league_messages_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_body    text;
  v_replied uuid;
  v_data    jsonb;
begin
  if new.user_id is null or coalesce(new.is_system, false) or new.deleted_at is not null then
    return new;
  end if;

  select coalesce(display_name, username, 'Someone') into v_name from profiles where id = new.user_id;
  v_body := case when char_length(new.message) > 60 then left(new.message, 57) || '…' else new.message end;
  v_data := jsonb_build_object('league_id', new.league_id, 'message_id', new.id)
    || case when new.game_id is not null then jsonb_build_object('game_id', new.game_id) else '{}'::jsonb end;

  -- The person being replied to
  if new.reply_to_id is not null then
    select user_id into v_replied from league_messages
      where id = new.reply_to_id and not coalesce(is_system, false);
    if v_replied is not null and v_replied <> new.user_id then
      insert into notifications (user_id, league_id, type, title, body, is_read, data, sender_id)
        values (v_replied, new.league_id, 'mention', v_name || ' replied to you', v_body, false, v_data, new.user_id);
    end if;
  end if;

  -- Everyone @mentioned who's in the league (once each, not the sender,
  -- and not the person already told about the reply)
  insert into notifications (user_id, league_id, type, title, body, is_read, data, sender_id)
    select distinct m.user_id, new.league_id, 'mention', v_name || ' mentioned you', v_body, false, v_data, new.user_id
    from regexp_matches(new.message, '@([A-Za-z0-9_]+)', 'g') as h(handle)
    join profiles p on lower(p.username) = lower(h.handle[1])
    join league_members m on m.user_id = p.id and m.league_id = new.league_id
    where m.user_id <> new.user_id
      and m.user_id is distinct from v_replied;

  return new;
-- A notification problem never stops the message itself
exception when others then
  raise warning 'league_messages_notify: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists league_messages_notify on public.league_messages;
create trigger league_messages_notify
  after insert on public.league_messages
  for each row execute function public.league_messages_notify();

-- ── Everything else: one checked notification ───────────────────
create or replace function public.notify_league_member(
  p_user   uuid,
  p_league uuid,
  p_type   text,
  p_title  text,
  p_body   text default null,
  p_data   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from league_members where league_id = p_league and user_id = auth.uid()
  ) then
    raise exception 'Only league members can notify each other';
  end if;
  if not exists (select 1 from league_members where league_id = p_league and user_id = p_user) then
    raise exception 'They''re not in this league';
  end if;
  if p_type not in ('trade_offer', 'trade_rejected', 'trade_accepted', 'trade_pending', 'trade_review', 'trade_vote') then
    raise exception 'Unknown notification type %', p_type;
  end if;
  if (select count(*) from notifications
      where sender_id = auth.uid() and created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'Too many notifications. Try again in a bit.';
  end if;

  insert into notifications (user_id, league_id, type, title, body, is_read, data, sender_id)
    values (p_user, p_league, p_type, left(p_title, 140), left(p_body, 500), false,
            coalesce(p_data, '{}'::jsonb), auth.uid());
end;
$$;

revoke all on function public.notify_league_member(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.notify_league_member(uuid, uuid, text, text, text, jsonb) to authenticated;
