-- Мой город: поля, леса, клумбы и дома рядом объединяются (большое поле, чаща, парк, квартал) и дают больше;
-- особые здания строятся один раз; реки и леса дороже. Настоящие призы лавки — дороже и с условиями.
-- Нужны миграции 20261026000029_shop.sql, 20261029000032_city_brain.sql и 20261029000034_city_land.sql.
-- Повторный запуск безопасен. Откат — supabase/rollback/20261029000035_city_merge_prizes_rollback.sql.
--
-- city_items.merge — сколько ⚙ в день добавляет клетка, если рядом (по стороне) стоит такая же: поле +1, лес +1, клумба +1.
--   Дома рядом образуют квартал (+1 житель у каждого дома — считает страница, на доход не влияет).
-- city_items.once — особое здание: в городе может стоять только одно (убрал — можно построить заново).
-- shop_items.need_streak — нужен рекорд серии дней не меньше N; need_blocks — пройдено блоков курса не меньше N.
--   Настоящий приз — не чаще одного раза в 30 дней (отменённые покупки не считаются).

alter table public.city_items add column if not exists merge int not null default 0 check (merge between 0 and 10);
alter table public.city_items add column if not exists once boolean not null default false;
update public.city_items set merge = 1 where code in ('field', 'forest', 'flowers');
update public.city_items set once = true where code in ('stall', 'wheelshop', 'watermill', 'windmill', 'ferris', 'lab', 'leonardo', 'garage', 'monument');
-- ландшафт за шестерёнки: река и лес дороже (меняем, только если цену не правили вручную)
update public.city_items set price = 10 where code = 'water' and price = 3;
update public.city_items set price = 12 where code = 'forest' and price = 8;

-- доход за день: доход построек + бонус за соседей того же вида (не больше 40 в день)
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
  if it.once and exists (select 1 from jsonb_array_elements(c.tiles) t where t->>'c' = it.code) then
    raise exception 'Это особое здание — в городе может быть только одно';
  end if;
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

-- состояние: плюс merge и once у построек
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
        'merge', i.merge, 'once', i.once,
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

-- ================= Лавка: настоящие призы — дорого и с условиями =================
alter table public.shop_items add column if not exists need_streak int check (need_streak between 1 and 365);
alter table public.shop_items add column if not exists need_blocks int check (need_blocks between 1 and 20);

-- новые цены и условия (только у призов, которые не правили вручную)
with t(code, old, price, streak, blocks) as (values
  ('prize-stickers', 150, 600, 7, null::int),
  ('prize-cert', 250, 1000, null::int, 1),
  ('prize-badge', 300, 1500, 14, null::int),
  ('prize-notebook', 500, 2000, 14, 2),
  ('prize-call', 600, 3000, null::int, 3),
  ('prize-kit', 1000, 6000, 30, 5))
update public.shop_items s set price = t.price, need_streak = coalesce(s.need_streak, t.streak), need_blocks = coalesce(s.need_blocks, t.blocks)
  from t where s.code = t.code and s.price = t.old;

-- что нужно для призов: рекорд серии, пройдено блоков, когда можно взять следующий приз
create or replace function public.shop_prize_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'best_streak', coalesce((select best_streak from public.hero where user_id = (select auth.uid())), 0),
    'blocks', public.city_era((select auth.uid())),
    'next_on', (select (max(created_at) + interval '30 days')::date from public.shop_orders
                 where user_id = (select auth.uid()) and kind = 'prize' and status <> 'cancelled' and created_at > now() - interval '30 days'))
$$;
revoke execute on function public.shop_prize_info() from public, anon;

create or replace function public.shop_buy(p_item bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); it public.shop_items; h public.hero; n int; oid bigint; st text; last timestamptz;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into it from public.shop_items where id = p_item and active for update;
  if not found then raise exception 'Этого товара уже нет в лавке'; end if;
  if it.stock is not null and it.stock <= 0 then raise exception 'Этот приз закончился'; end if;
  if it.kind = 'ride' then
    if exists (select 1 from public.shop_orders where user_id = uid and code = it.code and status <> 'cancelled') then
      raise exception 'Это украшение у тебя уже есть';
    end if;
  elsif it.per_user is not null then
    select count(*) into n from public.shop_orders where user_id = uid and item_id = it.id and status <> 'cancelled';
    if n >= it.per_user then raise exception 'Больше этот приз взять нельзя'; end if;
  end if;
  insert into public.hero (user_id) values (uid) on conflict (user_id) do nothing;
  select * into h from public.hero where user_id = uid for update;
  if it.kind = 'prize' then
    if it.need_streak is not null and h.best_streak < it.need_streak then
      raise exception 'Для этого приза нужна серия % дн. подряд (твой рекорд — %)', it.need_streak, h.best_streak;
    end if;
    if it.need_blocks is not null and public.city_era(uid) < it.need_blocks then
      raise exception 'Для этого приза нужно пройти блоков курса: %', it.need_blocks;
    end if;
    select max(created_at) into last from public.shop_orders where user_id = uid and kind = 'prize' and status <> 'cancelled';
    if last > now() - interval '30 days' then
      raise exception 'Настоящий приз можно брать раз в 30 дней — следующий с %', to_char(last + interval '30 days', 'DD.MM');
    end if;
  end if;
  if it.kind = 'freeze' and h.freezes >= 2 then raise exception 'Заморозок уже две — больше держать нельзя'; end if;
  if h.gears < it.price then raise exception 'Не хватает шестерёнок'; end if;
  update public.hero set gears = gears - it.price,
    freezes = case when it.kind = 'freeze' then freezes + 1 else freezes end, updated_at = now()
  where user_id = uid;
  if it.stock is not null then update public.shop_items set stock = stock - 1 where id = it.id; end if;
  st := case when it.kind = 'prize' then 'new' else 'done' end;
  insert into public.shop_orders (user_id, item_id, kind, code, title, price, note, status, done_at)
  values (uid, it.id, it.kind, it.code, it.title, it.price, nullif(left(trim(coalesce(p_note, '')), 300), ''), st,
    case when st = 'done' then now() end)
  returning id into oid;
  return jsonb_build_object('order', oid, 'status', st, 'gears', h.gears - it.price);
end;
$$;
revoke execute on function public.shop_buy(bigint, text) from public, anon;
