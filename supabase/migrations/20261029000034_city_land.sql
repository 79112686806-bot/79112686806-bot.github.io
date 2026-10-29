-- Мой город: расширение земли, реки, леса и мосты; постройки с условием места. Нужна миграция 20261029000032_city_brain.sql.
-- Повторный запуск безопасен. Откат — supabase/rollback/20261029000034_city_land_rollback.sql.
--
-- Земля: к полю эпохи (радиус 2–5) можно докупить до 3 рядов вокруг (city.extra), но не больше радиуса 7.
--   Цена ряда — 60, 150, 300 ⚙ (city_expand).
-- Условия места (city_items.need): on_water — только на клетку с рекой (мост: река под ним остаётся, убрал мост — снова река);
--   water_adj — рядом (по стороне клетки) должна быть река или мост (водяная мельница).

alter table public.city add column if not exists extra int not null default 0 check (extra between 0 and 3);
alter table public.city_items add column if not exists need text check (need in ('on_water', 'water_adj'));

insert into public.city_items (code, title, price, income, pop, era, sort) values
  ('forest', 'Лес', 8, 0, 0, 0, 14),
  ('water', 'Река', 3, 0, 0, 1, 25),
  ('bridge', 'Мост', 15, 0, 0, 1, 26)
on conflict (code) do nothing;
update public.city_items set need = 'on_water' where code = 'bridge';
update public.city_items set need = 'water_adj' where code = 'watermill';

-- радиус города: эпоха + докупленные ряды
create or replace function public.city_r(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select least(7, public.city_radius(public.city_era(p_user)) + coalesce((select extra from public.city where user_id = p_user), 0))
$$;
revoke execute on function public.city_r(uuid) from public, anon, authenticated;

create or replace function public.city_expand_price(p_extra int)
returns int language sql immutable set search_path = '' as $$ select (array[60, 150, 300])[p_extra + 1] $$;

-- что стоит на клетке (код или null)
create or replace function public.city_at(p_tiles jsonb, p_x int, p_y int)
returns text language sql immutable set search_path = '' as $$
  select t->>'c' from jsonb_array_elements(p_tiles) t where (t->>'x')::int = p_x and (t->>'y')::int = p_y limit 1
$$;

create or replace function public.city_place(p_code text, p_x int, p_y int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); it public.city_items; c public.city; e int; ok boolean; gift boolean; left_gears int; here text; r int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into it from public.city_items where code = p_code and active;
  if not found then raise exception 'Такой постройки нет'; end if;
  insert into public.city (user_id) values (uid) on conflict (user_id) do nothing;
  select * into c from public.city where user_id = uid for update;
  e := public.city_era(uid); r := public.city_r(uid);
  ok := case when it.lesson_id is not null
    then exists (select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = it.lesson_id and p.status = 'approved')
    else it.era <= e end;
  if not ok then raise exception 'Эта постройка ещё не открыта'; end if;
  if abs(p_x) > r or abs(p_y) > r or (p_x = 0 and p_y = 0) then raise exception 'Здесь строить нельзя — это за границей города'; end if;
  here := public.city_at(c.tiles, p_x, p_y);
  if it.need = 'on_water' then
    if here is distinct from 'water' then raise exception 'Мост ставится только на реку'; end if;
  elsif here is not null then raise exception 'Клетка занята — выбери свободную';
  end if;
  if it.need = 'water_adj' and not exists (select 1 from (values (1, 0), (-1, 0), (0, 1), (0, -1)) d(dx, dy)
       where public.city_at(c.tiles, p_x + d.dx, p_y + d.dy) in ('water', 'bridge')) then
    raise exception 'Водяную мельницу строят у реки — сначала проведи рядом реку';
  end if;
  gift := it.lesson_id is not null and not (it.code = any (c.gifts));
  if not gift then
    update public.hero set gears = gears - it.price, updated_at = now() where user_id = uid and gears >= it.price returning gears into left_gears;
    if not found then raise exception 'Не хватает шестерёнок'; end if;
  end if;
  update public.city set
    tiles = case when it.need = 'on_water'
      then (select coalesce(jsonb_agg(case when (t->>'x')::int = p_x and (t->>'y')::int = p_y then t || jsonb_build_object('c', it.code) else t end), '[]'::jsonb) from jsonb_array_elements(tiles) t)
      else tiles || jsonb_build_array(jsonb_build_object('x', p_x, 'y', p_y, 'c', it.code) || case when gift then '{"g": true}'::jsonb else '{}'::jsonb end) end,
    gifts = case when gift then array_append(gifts, it.code) else gifts end,
    updated_at = now()
  where user_id = uid;
  return jsonb_build_object('gift', gift, 'gears', left_gears);
end;
$$;
revoke execute on function public.city_place(text, int, int) from public, anon;

create or replace function public.city_move(p_x int, p_y int, p_to_x int, p_to_y int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); c public.city; i int; code text; r int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into c from public.city where user_id = uid for update;
  if not found then raise exception 'Город ещё не построен'; end if;
  select k - 1, v->>'c' into i, code from jsonb_array_elements(c.tiles) with ordinality t(v, k) where (v->>'x')::int = p_x and (v->>'y')::int = p_y limit 1;
  if i is null then raise exception 'Здесь ничего нет'; end if;
  if code in ('bridge', 'water') then raise exception 'Реку и мост не переставить — их можно убрать и построить заново'; end if;
  r := public.city_r(uid);
  if abs(p_to_x) > r or abs(p_to_y) > r or (p_to_x = 0 and p_to_y = 0) or public.city_at(c.tiles, p_to_x, p_to_y) is not null then
    raise exception 'Туда переставить нельзя — выбери свободную клетку';
  end if;
  if (select need from public.city_items where city_items.code = city_move.code) = 'water_adj'
     and not exists (select 1 from (values (1, 0), (-1, 0), (0, 1), (0, -1)) d(dx, dy)
       where public.city_at(c.tiles, p_to_x + d.dx, p_to_y + d.dy) in ('water', 'bridge')) then
    raise exception 'Водяная мельница должна стоять у реки';
  end if;
  update public.city set tiles = jsonb_set(jsonb_set(tiles, array[i::text, 'x'], to_jsonb(p_to_x)), array[i::text, 'y'], to_jsonb(p_to_y)), updated_at = now()
  where user_id = uid;
end;
$$;
revoke execute on function public.city_move(int, int, int, int) from public, anon;

-- убрать: мост превращается обратно в реку
create or replace function public.city_sell(p_x int, p_y int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); c public.city; i int; t jsonb; back int := 0;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into c from public.city where user_id = uid for update;
  if not found then raise exception 'Город ещё не построен'; end if;
  select k - 1, v into i, t from jsonb_array_elements(c.tiles) with ordinality x(v, k) where (v->>'x')::int = p_x and (v->>'y')::int = p_y limit 1;
  if i is null then raise exception 'Здесь ничего нет'; end if;
  if not coalesce((t->>'g')::boolean, false) then select price / 2 into back from public.city_items where code = t->>'c'; end if;
  if t->>'c' = 'bridge' then
    update public.city set tiles = jsonb_set(tiles, array[i::text, 'c'], '"water"'::jsonb), updated_at = now() where user_id = uid;
  else
    update public.city set tiles = tiles - i, updated_at = now() where user_id = uid;
  end if;
  if coalesce(back, 0) > 0 then update public.hero set gears = gears + back, updated_at = now() where user_id = uid; end if;
  return jsonb_build_object('gears', coalesce(back, 0));
end;
$$;
revoke execute on function public.city_sell(int, int) from public, anon;

create or replace function public.city_expand()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); c public.city; price int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  insert into public.city (user_id) values (uid) on conflict (user_id) do nothing;
  select * into c from public.city where user_id = uid for update;
  if c.extra >= 3 or public.city_r(uid) >= 7 then raise exception 'Больше земли пока купить нельзя'; end if;
  price := public.city_expand_price(c.extra);
  update public.hero set gears = gears - price, updated_at = now() where user_id = uid and gears >= price;
  if not found then raise exception 'Не хватает шестерёнок'; end if;
  update public.city set extra = extra + 1, updated_at = now() where user_id = uid;
  return jsonb_build_object('radius', public.city_r(uid));
end;
$$;
revoke execute on function public.city_expand() from public, anon;

-- состояние: плюс радиус с докупленной землёй, цена следующего ряда, условие места у построек
create or replace function public.city_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); e int; c public.city; nx record; r int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  insert into public.city (user_id) values (uid) on conflict (user_id) do nothing;
  select * into c from public.city where user_id = uid;
  e := public.city_era(uid); r := public.city_r(uid);
  select m.title, count(l.id) as total,
         count(l.id) filter (where exists (select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = l.id and p.status = 'approved')) as done
    into nx
    from public.modules m join public.lessons l on l.module_id = m.id
   where m.course_id = (select mm.course_id from public.modules mm join public.lessons ll on ll.module_id = mm.id
                         left join public.lesson_progress pp on pp.lesson_id = ll.id and pp.user_id = uid and pp.status = 'approved'
                         group by mm.course_id order by count(pp.lesson_id) desc, mm.course_id limit 1)
   group by m.id, m.title, m.sort
  having count(l.id) filter (where exists (select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = l.id and p.status = 'approved')) < count(l.id)
   order by m.sort limit 1;
  return jsonb_build_object(
    'era', e,
    'radius', r,
    'expand_price', case when c.extra < 3 and r < 7 then public.city_expand_price(c.extra) end,
    'gears', coalesce((select gears from public.hero where user_id = uid), 0),
    'tiles', c.tiles,
    'ready', coalesce(public.city_ready(uid), 0),
    'next_hint', case when nx.title is not null then 'блок «' || nx.title || '»' end,
    'next_done', nx.done, 'next_total', nx.total,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'code', i.code, 'title', i.title, 'price', i.price, 'income', i.income, 'refund', i.price / 2, 'need', i.need,
        'pop', case when i.code = 'house' then i.pop + 2 * e else i.pop end,
        'era', i.era, 'unlocked', u.ok, 'free', u.ok and i.lesson_id is not null and not (i.code = any (c.gifts)),
        'lesson', case when not u.ok and i.lesson_id is not null then l.title end) order by i.sort, i.code)
      from public.city_items i
      left join public.lessons l on l.id = i.lesson_id
      cross join lateral (select case when i.lesson_id is not null
          then exists (select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = i.lesson_id and p.status = 'approved')
          else i.era <= e end as ok) u
      where i.active), '[]'::jsonb));
end;
$$;
revoke execute on function public.city_state() from public, anon;
