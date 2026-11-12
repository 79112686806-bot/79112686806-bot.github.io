-- Откат 20261112000049_garage_race.sql: гараж, гонки и бонус за группы клеток города.
-- Машины, купленные детали и история гонок удаляются (потраченные шестерёнки не возвращаются).
drop function if exists public.race_start();
drop function if exists public.car_rename(int, int);
drop function if exists public.car_equip(text);
drop function if exists public.car_buy(text);
drop function if exists public.car_state();
drop function if exists public.car_row(uuid);
drop function if exists public.car_lap(jsonb, numeric, numeric);
drop function if exists public.car_stats(jsonb);
drop function if exists public.car_names();
drop table if exists public.races;
drop table if exists public.cars;
drop table if exists public.car_parts;

-- доход города — как в 20261029000035 (без бонуса за группы, предел 40)
create or replace function public.city_ready(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.collected_on = public.hero_today() then 0 else least(40, coalesce((
    select sum(i.income + case when i.merge > 0 and exists (
             select 1 from jsonb_array_elements(c.tiles) n
              where n->>'c' = t->>'c' and abs((n->>'x')::int - (t->>'x')::int) + abs((n->>'y')::int - (t->>'y')::int) = 1)
           then i.merge else 0 end)
      from jsonb_array_elements(c.tiles) t join public.city_items i on i.code = t->>'c'), 0))::int end
  from public.city c where c.user_id = p_user
$$;
revoke execute on function public.city_ready(uuid) from public, anon, authenticated;
drop function if exists public.city_bonus(int);
drop function if exists public.city_groups(jsonb);
