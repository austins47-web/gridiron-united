-- League chat: sending a message failed for everyone.
--
-- messages_insert (20260924130000, and again in 20260929000000) checked
-- that a reply points at a message in the same league by querying
-- league_messages from inside league_messages' own policy. Postgres
-- rejects that on every insert ("infinite recursion detected in policy
-- for relation league_messages"), reply or not, so only messages posted
-- by the server (which skips these policies) got through.
--
-- The check now runs in a security-definer function, which reads the
-- original message without re-entering the policy.

create or replace function public.chat_reply_target_ok(p_reply_to uuid, p_league uuid, p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from league_messages original
    where original.id = p_reply_to
      and original.league_id = p_league
      and original.game_id is not distinct from p_game
  );
$$;

revoke all on function public.chat_reply_target_ok(uuid, uuid, uuid) from public, anon;
grant execute on function public.chat_reply_target_ok(uuid, uuid, uuid) to authenticated;

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
    and (reply_to_id is null or public.chat_reply_target_ok(reply_to_id, league_id, game_id))
  );
