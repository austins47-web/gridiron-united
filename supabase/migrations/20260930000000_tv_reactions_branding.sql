-- Phone-to-TV reactions, and a league's own logo and color.

-- ── Reactions ───────────────────────────────────────────────────
-- A member taps an emoji on their phone; send_tv_reaction broadcasts it
-- (Realtime, from the database) to the topic tv:<the league's TV code>,
-- which the Shop TV page listens on. The log is only for rate limits.
create table if not exists public.tv_reactions (
  id         bigint generated always as identity primary key,
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now()
);
create index if not exists tv_reactions_user_idx on public.tv_reactions (user_id, created_at desc);
alter table public.tv_reactions enable row level security;
-- (no policies: only the functions below touch it)

-- Whether this league has a Shop TV (without handing out its code)
create or replace function public.league_has_tv(p_league uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from league_members where league_id = p_league and user_id = auth.uid())
     and exists (select 1 from league_tv_tokens where league_id = p_league);
$$;

create or replace function public.send_tv_reaction(p_league uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_name  text;
begin
  if auth.uid() is null or not exists (
    select 1 from league_members where league_id = p_league and user_id = auth.uid()
  ) then
    raise exception 'Only league members can react';
  end if;
  if p_emoji not in ('🔥', '😂', '💀', '🏈', '🎉', '😱', '👏', '🤡', '😤', '💩') then
    raise exception 'Pick one of the reaction emojis';
  end if;
  if (select count(*) from tv_reactions
      where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'Easy there. Give it a second.';
  end if;

  select token into v_token from league_tv_tokens where league_id = p_league;
  if v_token is null then
    raise exception 'This league has no Shop TV set up';
  end if;
  select coalesce(display_name, username, 'Someone') into v_name from profiles where id = auth.uid();

  insert into tv_reactions (league_id, user_id, emoji) values (p_league, auth.uid(), p_emoji);
  delete from tv_reactions where created_at < now() - interval '2 days';

  perform realtime.send(
    jsonb_build_object('emoji', p_emoji, 'name', v_name),
    'reaction',
    'tv:' || v_token,
    false
  );
end;
$$;

revoke all on function public.league_has_tv(uuid) from public, anon;
grant execute on function public.league_has_tv(uuid) to authenticated;
revoke all on function public.send_tv_reaction(uuid, text) from public, anon;
grant execute on function public.send_tv_reaction(uuid, text) to authenticated;

-- ── Branding ────────────────────────────────────────────────────
-- A logo (league-logos/<league id>/...) and an accent color, used by the
-- app while the league is active and by the Shop TV.
alter table public.leagues
  add column if not exists brand_logo_url text,
  add column if not exists brand_color text
    check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');

insert into storage.buckets (id, name, public)
values ('league-logos', 'league-logos', true)
on conflict (id) do nothing;

-- The commissioner writes their league's folder; anyone can view (public bucket)
drop policy if exists league_logos_insert on storage.objects;
create policy league_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'league-logos'
    and exists (
      select 1 from public.leagues l
      where l.id::text = (storage.foldername(name))[1] and l.commissioner_id = auth.uid()
    )
  );

drop policy if exists league_logos_update on storage.objects;
create policy league_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'league-logos'
    and exists (
      select 1 from public.leagues l
      where l.id::text = (storage.foldername(name))[1] and l.commissioner_id = auth.uid()
    )
  );

drop policy if exists league_logos_delete on storage.objects;
create policy league_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'league-logos'
    and exists (
      select 1 from public.leagues l
      where l.id::text = (storage.foldername(name))[1] and l.commissioner_id = auth.uid()
    )
  );
