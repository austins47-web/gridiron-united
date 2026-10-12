-- Coded orders: who's sealed an attack order for the week being played,
-- without whom it's on (that stays hidden until the week's first kickoff,
-- conquest_orders' RLS). For the league's members.
create or replace function public.conquest_sealed_orders(p_league uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.user_id
  from conquest_orders o
  join conquest_games g on g.league_id = o.league_id and g.season = o.season
  where o.league_id = p_league
    and o.target_id is not null
    and g.season = (select max(season) from conquest_games where league_id = p_league)
    and o.week = coalesce(g.last_resolved_week, g.start_week - 1) + 1
    and exists (select 1 from league_members m where m.league_id = p_league and m.user_id = auth.uid())
$$;

revoke all on function public.conquest_sealed_orders(uuid) from public;
grant execute on function public.conquest_sealed_orders(uuid) to authenticated;
