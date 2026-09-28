-- Shop TV: a live Pick'Em board for a TV, at /tv/<code>.
--
-- A TV can't sign in, so an 8-character code is the key (easy to type
-- with a remote: no 0/o, 1/l/i). The shop-tv edge function reads the
-- league's board with it; only the commissioner hands it out or resets
-- it, which turns the old code off.

create table if not exists public.league_tv_tokens (
  league_id  uuid primary key references public.leagues(id) on delete cascade,
  token      text not null unique check (token ~ '^[a-z2-9]{8}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Read only through the function below and the edge function (service role)
alter table public.league_tv_tokens enable row level security;

create or replace function public.league_tv_token(p_league uuid, p_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  t text;
begin
  if auth.uid() is null or not exists (
    select 1 from league_members
    where league_id = p_league and user_id = auth.uid() and is_commissioner
  ) then
    raise exception 'Only the commissioner can set up the Shop TV';
  end if;

  if p_reset then
    delete from league_tv_tokens where league_id = p_league;
  end if;
  select token into t from league_tv_tokens where league_id = p_league;
  if t is not null then
    return t;
  end if;

  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into t from generate_series(1, 8);
    begin
      insert into league_tv_tokens (league_id, token, created_by) values (p_league, t, auth.uid());
      return t;
    exception when unique_violation then
      -- that code's taken (or another tab just made this league's): try again
      select token into t from league_tv_tokens where league_id = p_league;
      if t is not null then
        return t;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.league_tv_token(uuid, boolean) from public, anon;
grant execute on function public.league_tv_token(uuid, boolean) to authenticated;
