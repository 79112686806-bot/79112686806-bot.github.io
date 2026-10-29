-- Мой город и Разминка ума. Нужны миграции 20261026000027_hero.sql, 20261026000028_hero_path.sql, 20261026000029_shop.sql.
-- Повторный запуск безопасен. Банк задачек — отдельной миграцией 20261029000033_brain_seed.sql (node scripts/brain-bank.mjs).
-- Откат — supabase/rollback/20261029000032_city_brain_rollback.sql.
--
-- Мой город (city.js): город один у ученика. Эпоха = сколько блоков (modules) пройдено полностью в лучшем курсе, 0–5;
--   с эпохой растёт поле (радиус 2,3,3,4,4,5 клеток от центра) и меняется вид домов и «сердца города» (клетка 0,0).
--   Постройки (city_items) открываются эпохой или подтверждённой темой (lesson_id); первая постройка за тему — подарок.
--   Строить, переставлять и убирать (возврат половины цены) — только через rpc; доход собирается раз в день (не больше 40 ⚙).
-- Разминка ума (brain.js): каждый день три задачки (шестерёнки/рычаг, ряд, вопрос/«что лишнее»), сложность растёт с верными
--   ответами. Ответы хранятся только в базе. Верно с первой попытки — 5 ⚙, со второй — 2 ⚙; очки героя — событие quiz
--   (засчитывается в серию дней и задания дня). Дни — по московскому времени.

alter table public.hero_events drop constraint if exists hero_events_source_check;
alter table public.hero_events add constraint hero_events_source_check
  check (source in ('onboarding', 'episode', 'lesson', 'research', 'chat', 'teacher', 'bonus', 'quiz', 'streak', 'chest', 'city'));

-- ================= Мой город =================
create table if not exists public.city_items (
  code      text primary key,
  title     text not null check (length(title) between 1 and 80),
  price     int not null check (price > 0 and price <= 10000),
  income    int not null default 0 check (income between 0 and 50),   -- ⚙ в день
  pop       int not null default 0 check (pop between 0 and 100),     -- жители (у дома растут с эпохой)
  era       int not null default 0 check (era between 0 and 5),       -- с какой эпохи доступна (если нет темы)
  lesson_id bigint references public.lessons (id) on delete set null, -- открывается подтверждённой темой
  sort      int not null default 0,
  active    boolean not null default true
);
alter table public.city_items enable row level security;
drop policy if exists city_items_read on public.city_items;
create policy city_items_read on public.city_items for select to authenticated using (true);
drop policy if exists city_items_admin on public.city_items;
create policy city_items_admin on public.city_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.city (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  tiles        jsonb not null default '[]'::jsonb,    -- [{x, y, c: code, g: true — подарок (без возврата)}]
  gifts        text[] not null default '{}',          -- за какие темы подарок уже получен
  collected_on date,
  updated_at   timestamptz not null default now()
);
alter table public.city enable row level security;
drop policy if exists city_read on public.city;
create policy city_read on public.city for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- писать напрямую нельзя: только city_place / city_move / city_sell / city_collect

-- эпоха ученика: больше всего полностью пройденных блоков в одном курсе
create or replace function public.city_era(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select least(5, coalesce(max(n), 0))::int from (
    select m.course_id, count(*) as n
      from public.modules m
     where exists (select 1 from public.lessons l where l.module_id = m.id)
       and not exists (select 1 from public.lessons l where l.module_id = m.id and not exists (
             select 1 from public.lesson_progress p where p.user_id = p_user and p.lesson_id = l.id and p.status = 'approved'))
     group by m.course_id) t
$$;
revoke execute on function public.city_era(uuid) from public, anon, authenticated;

create or replace function public.city_radius(p_era int)
returns int language sql immutable set search_path = '' as $$ select (array[2, 3, 3, 4, 4, 5])[least(5, greatest(0, p_era)) + 1] $$;

-- сколько дохода можно собрать сейчас
create or replace function public.city_ready(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.collected_on = public.hero_today() then 0 else least(40, coalesce((
    select sum(i.income) from jsonb_array_elements(c.tiles) t join public.city_items i on i.code = t->>'c'), 0))::int end
  from public.city c where c.user_id = p_user
$$;
revoke execute on function public.city_ready(uuid) from public, anon, authenticated;

create or replace function public.city_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); e int; c public.city; nx record;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  insert into public.city (user_id) values (uid) on conflict (user_id) do nothing;
  select * into c from public.city where user_id = uid;
  e := public.city_era(uid);
  -- что пройти до новой эпохи: первый незаконченный блок в курсе, где пройдено больше всего
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
    'radius', public.city_radius(e),
    'gears', coalesce((select gears from public.hero where user_id = uid), 0),
    'tiles', c.tiles,
    'ready', coalesce(public.city_ready(uid), 0),
    'next_hint', case when nx.title is not null then 'блок «' || nx.title || '»' end,
    'next_done', nx.done, 'next_total', nx.total,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'code', i.code, 'title', i.title, 'price', i.price, 'income', i.income, 'refund', i.price / 2,
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

-- общая проверка клетки: внутри поля, не центр, свободна
create or replace function public.city_cell_ok(p_tiles jsonb, p_r int, p_x int, p_y int)
returns boolean language sql immutable set search_path = '' as $$
  select abs(p_x) <= p_r and abs(p_y) <= p_r and not (p_x = 0 and p_y = 0)
     and not exists (select 1 from jsonb_array_elements(p_tiles) t where (t->>'x')::int = p_x and (t->>'y')::int = p_y)
$$;

create or replace function public.city_place(p_code text, p_x int, p_y int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); it public.city_items; c public.city; e int; ok boolean; gift boolean; left_gears int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into it from public.city_items where code = p_code and active;
  if not found then raise exception 'Такой постройки нет'; end if;
  insert into public.city (user_id) values (uid) on conflict (user_id) do nothing;
  select * into c from public.city where user_id = uid for update;
  e := public.city_era(uid);
  ok := case when it.lesson_id is not null
    then exists (select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = it.lesson_id and p.status = 'approved')
    else it.era <= e end;
  if not ok then raise exception 'Эта постройка ещё не открыта'; end if;
  if not public.city_cell_ok(c.tiles, public.city_radius(e), p_x, p_y) then raise exception 'Здесь строить нельзя — выбери свободную клетку'; end if;
  gift := it.lesson_id is not null and not (it.code = any (c.gifts));
  if not gift then
    update public.hero set gears = gears - it.price, updated_at = now() where user_id = uid and gears >= it.price returning gears into left_gears;
    if not found then raise exception 'Не хватает шестерёнок'; end if;
  end if;
  update public.city set
    tiles = tiles || jsonb_build_array(jsonb_build_object('x', p_x, 'y', p_y, 'c', it.code) || case when gift then '{"g": true}'::jsonb else '{}'::jsonb end),
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
declare uid uuid := (select auth.uid()); c public.city; i int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into c from public.city where user_id = uid for update;
  if not found then raise exception 'Город ещё не построен'; end if;
  select k - 1 into i from jsonb_array_elements(c.tiles) with ordinality t(v, k) where (v->>'x')::int = p_x and (v->>'y')::int = p_y limit 1;
  if i is null then raise exception 'Здесь ничего нет'; end if;
  if not public.city_cell_ok(c.tiles, public.city_radius(public.city_era(uid)), p_to_x, p_to_y) then raise exception 'Туда переставить нельзя — выбери свободную клетку'; end if;
  update public.city set tiles = jsonb_set(jsonb_set(tiles, array[i::text, 'x'], to_jsonb(p_to_x)), array[i::text, 'y'], to_jsonb(p_to_y)), updated_at = now()
  where user_id = uid;
end;
$$;
revoke execute on function public.city_move(int, int, int, int) from public, anon;

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
  update public.city set tiles = tiles - i, updated_at = now() where user_id = uid;
  if coalesce(back, 0) > 0 then update public.hero set gears = gears + back, updated_at = now() where user_id = uid; end if;
  return jsonb_build_object('gears', coalesce(back, 0));
end;
$$;
revoke execute on function public.city_sell(int, int) from public, anon;

create or replace function public.city_collect()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); today date := public.hero_today(); g int; r jsonb;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  perform 1 from public.city where user_id = uid for update;
  if not found then raise exception 'Город ещё не построен'; end if;
  g := public.city_ready(uid);
  if g <= 0 then raise exception 'Сегодня доход уже собран — загляни завтра'; end if;
  r := public.hero_bonus(uid, 'city', 'city:' || today, '{}'::jsonb, g, 'Доход города', true);
  update public.city set collected_on = today, updated_at = now() where user_id = uid;
  if r is null then raise exception 'Сегодня доход уже собран — загляни завтра'; end if;
  return jsonb_build_object('gears', g);
end;
$$;
revoke execute on function public.city_collect() from public, anon;

-- постройки (цены и доход можно поменять в таблице city_items); темы — по курсу «Колесо» (блок, тема по порядку)
with t(code, title, price, income, pop, era, mod_sort, les_sort, sort) as (values
  ('house', 'Жилой дом', 20, 0, 4, 0, null, null, 10),
  ('tree', 'Дерево', 5, 0, 0, 0, null, null, 11),
  ('field', 'Поле', 15, 2, 0, 0, null, null, 12),
  ('fire', 'Костёр', 10, 0, 0, 0, 1, 1, 13),
  ('flowers', 'Клумба', 8, 0, 0, 1, null, null, 20),
  ('well', 'Колодец', 25, 1, 0, 1, null, null, 21),
  ('stall', 'Рынок', 40, 3, 0, 1, null, null, 22),
  ('wheelshop', 'Мастерская колесника', 40, 3, 0, 1, 2, 1, 23),
  ('road', 'Дорога', 2, 0, 0, 1, 3, 1, 24),
  ('watermill', 'Водяная мельница', 60, 4, 0, 2, 3, 2, 30),
  ('windmill', 'Ветряная мельница', 50, 3, 0, 2, null, null, 31),
  ('ferris', 'Колесо обозрения', 80, 5, 0, 2, 3, 3, 32),
  ('lab', 'Обсерватория', 70, 4, 0, 3, 4, 1, 40),
  ('fountain', 'Фонтан', 45, 1, 0, 3, null, null, 41),
  ('leonardo', 'Мастерская изобретателя', 90, 5, 0, 3, 4, 2, 42),
  ('lamp', 'Фонарь', 10, 0, 0, 4, null, null, 50),
  ('garage', 'Автозавод', 120, 7, 0, 4, 5, 1, 51),
  ('solar', 'Солнечная станция', 60, 4, 0, 5, null, null, 60),
  ('monument', 'Памятник твоему изобретению', 150, 0, 0, 5, 6, 1, 61))
insert into public.city_items (code, title, price, income, pop, era, lesson_id, sort)
select t.code, t.title, t.price, t.income, t.pop, t.era,
  (select l.id from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id
    where c.slug = 'wheel' and m.sort = t.mod_sort and l.sort = t.les_sort limit 1), t.sort
from t
on conflict (code) do nothing;

-- ================= Разминка ума =================
create table if not exists public.brain_puzzles (
  id      bigserial primary key,
  code    text unique not null,
  kind    text not null check (kind in ('gears', 'lever', 'seq', 'quiz', 'odd')),
  level   int not null default 1 check (level between 1 and 3),
  data    jsonb not null,
  answer  text not null,
  hint    text,
  explain text,
  active  boolean not null default true
);
alter table public.brain_puzzles enable row level security;
drop policy if exists brain_puzzles_admin on public.brain_puzzles;
create policy brain_puzzles_admin on public.brain_puzzles for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- ученикам напрямую не видно (там ответы): задачки отдаёт brain_today

create table if not exists public.brain_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  ids     bigint[] not null,
  primary key (user_id, day)
);
create table if not exists public.brain_answers (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  puzzle_id bigint not null references public.brain_puzzles (id) on delete cascade,
  day       date not null,
  tries     int not null default 0,
  ok        boolean not null default false,
  done      boolean not null default false,
  gears     int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);
alter table public.brain_days enable row level security;
alter table public.brain_answers enable row level security;
drop policy if exists brain_days_read on public.brain_days;
create policy brain_days_read on public.brain_days for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists brain_answers_read on public.brain_answers;
create policy brain_answers_read on public.brain_answers for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

-- подобрать задачку вида p_kind: уровень по числу верных ответов, сначала нерешённые
create or replace function public.brain_pick(p_user uuid, p_kind text, p_skip bigint[])
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with lv as (select least(3, 1 + count(*) filter (where a.ok) / 4)::int as l
                from public.brain_answers a join public.brain_puzzles p on p.id = a.puzzle_id
               where a.user_id = p_user and p.kind = p_kind)
  select p.id from public.brain_puzzles p
    left join public.brain_answers a on a.puzzle_id = p.id and a.user_id = p_user
   where p.active and p.kind = p_kind and not (p.id = any (p_skip))
   order by (a.puzzle_id is not null), abs(p.level - (select l from lv)), a.updated_at nulls first, random()
   limit 1
$$;
revoke execute on function public.brain_pick(uuid, text, bigint[]) from public, anon, authenticated;

create or replace function public.brain_today()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); today date := public.hero_today(); n int := extract(epoch from public.hero_today())::int / 86400;
  ids bigint[] := '{}'; k text; id bigint;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select d.ids into ids from public.brain_days d where d.user_id = uid and d.day = today;
  if ids is null then
    ids := '{}';
    foreach k in array array[case when n % 2 = 0 then 'gears' else 'lever' end, 'seq', case when n % 3 = 0 then 'odd' else 'quiz' end] loop
      id := public.brain_pick(uid, k, ids);
      if id is not null then ids := ids || id; end if;
    end loop;
    insert into public.brain_days (user_id, day, ids) values (uid, today, ids) on conflict (user_id, day) do nothing;
    select d.ids into ids from public.brain_days d where d.user_id = uid and d.day = today;
  end if;
  return jsonb_build_object('day', today, 'puzzles', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'level', p.level, 'data', p.data,
        'state', case when a.done and a.ok then 'ok' when a.done then 'fail' when a.tries > 0 then 'retry' else 'new' end,
        'hint', case when a.tries > 0 and not a.done then p.hint end, 'gears', coalesce(a.gears, 0)) order by x.k)
      from unnest(ids) with ordinality x(pid, k) join public.brain_puzzles p on p.id = x.pid
      left join public.brain_answers a on a.user_id = uid and a.puzzle_id = p.id and a.day = today), '[]'::jsonb));
end;
$$;
revoke execute on function public.brain_today() from public, anon;

create or replace function public.brain_answer(p_id bigint, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); today date := public.hero_today(); p public.brain_puzzles; a public.brain_answers; good boolean; g int; d jsonb;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  if not exists (select 1 from public.brain_days where user_id = uid and day = today and p_id = any (ids)) then raise exception 'Эта задачка не на сегодня'; end if;
  select * into p from public.brain_puzzles where id = p_id;
  -- задачка могла попасться снова в другой день: тогда попытки считаются заново
  insert into public.brain_answers as ba (user_id, puzzle_id, day) values (uid, p_id, today)
    on conflict (user_id, puzzle_id) do update set day = excluded.day,
      tries = case when ba.day = excluded.day then ba.tries else 0 end,
      done = case when ba.day = excluded.day then ba.done else false end,
      ok = case when ba.day = excluded.day then ba.ok else false end;
  select * into a from public.brain_answers where user_id = uid and puzzle_id = p_id for update;
  if a.done then raise exception 'Эта задачка уже решена'; end if;
  good := trim(coalesce(p_answer, '')) = p.answer;
  if not good and a.tries = 0 then
    update public.brain_answers set tries = 1, updated_at = now() where user_id = uid and puzzle_id = p_id;
    return jsonb_build_object('retry', true, 'hint', p.hint);
  end if;
  g := case when not good then 0 when a.tries = 0 then 5 else 2 end;
  d := case when good then jsonb_build_object(case p.kind when 'gears' then 'craft' when 'lever' then 'res' when 'seq' then 'obs' when 'odd' then 'obs' else 'cur' end, 2) else '{}'::jsonb end;
  if a.tries > 0 then d := d || '{"grit": 1}'::jsonb; end if;   -- не сдался после ошибки — упорство
  update public.brain_answers set tries = a.tries + 1, ok = good, done = true, gears = g, updated_at = now() where user_id = uid and puzzle_id = p_id;
  perform public.hero_bonus(uid, 'quiz', 'brain:' || p_id || ':' || today, d, g, 'Разминка ума', true);
  return jsonb_build_object('ok', good, 'gears', g, 'explain', p.explain) || case when good then '{}'::jsonb else jsonb_build_object('answer', p.answer) end;
end;
$$;
revoke execute on function public.brain_answer(bigint, text) from public, anon;

-- ---------- hero_status: плюс разминка (сколько задачек осталось) и доход города ----------
create or replace function public.hero_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); today date := public.hero_today(); h public.hero; q jsonb; ids bigint[];
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into h from public.hero where user_id = uid;
  q := public.hero_quests(uid, today);
  select d.ids into ids from public.brain_days d where d.user_id = uid and d.day = today;
  return jsonb_build_object(
    'today', today,
    'streak', case when h.last_day >= today - 1 or (h.last_day = today - 2 and h.freezes > 0) then coalesce(h.streak, 0) else 0 end,
    'today_done', coalesce(h.last_day = today, false),
    'best_streak', coalesce(h.best_streak, 0),
    'freezes', coalesce(h.freezes, 0),
    'gears', coalesce(h.gears, 0),
    'quests', q,
    'quests_done', not exists (select 1 from jsonb_array_elements(q) x where (x->>'have')::int < (x->>'target')::int),
    'daily_claimed', exists (select 1 from public.hero_events where user_id = uid and ref = 'daily:' || today),
    'chests', coalesce((select jsonb_agg(ref) from public.hero_events where user_id = uid and source = 'chest' and ref not like 'daily:%'), '[]'::jsonb),
    'owned', coalesce((select jsonb_agg(distinct code) from public.shop_orders where user_id = uid and kind = 'ride' and status = 'done'), '[]'::jsonb),
    'brain_left', case when ids is null then 3 else (select count(*) from unnest(ids) x(pid) where not exists (
        select 1 from public.brain_answers a where a.user_id = uid and a.puzzle_id = x.pid and a.day = today and a.done)) end,
    'city_ready', coalesce(public.city_ready(uid), 0));
end;
$$;
revoke execute on function public.hero_status() from public, anon;

-- ---------- Настоящий приз из лавки: пуш администратору (notify_admin → Edge Function, случай shop_orders) ----------
drop trigger if exists notify_admin on public.shop_orders;
create trigger notify_admin after insert on public.shop_orders
  for each row when (new.kind = 'prize') execute function public.notify_admin();
