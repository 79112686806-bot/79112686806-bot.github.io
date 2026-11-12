-- Гараж, гонки по дорогам города и «срастание» одинаковых клеток.
-- Нужны миграции 20261026000028_hero_path.sql, 20261029000032 … 20261029000037 (город, гости). Повторный запуск безопасен.
-- Откат — supabase/rollback/20261112000049_garage_race_rollback.sql.
--
-- 1. Город: одинаковые клетки рядом (по стороне) образуют группу. Дома, поля, леса, клумбы и деревья дают за группу бонус к доходу:
--    3–4 клетки +1 ⚙ в день, 5–7 — +3, 8 и больше — +5 (за каждую группу). Предел дохода за день — 45 ⚙ (был 40).
--    Страница рисует группы по уровням: улицы с прохожими, фонари, тележки и машины, стада, птицы, лодки на озере.
-- 2. Гараж: своя машина из деталей (car_parts) — кузов, колёса, ось, двигатель, цвет, украшение. Деталь покупается за шестерёнки
--    один раз и остаётся в гараже. Часть деталей открывается с эпохой города (city_era — пройденные блоки курса).
--    car_state() — машина, детали, шестерёнки; car_buy(code) — купить и поставить; car_equip(code) — поставить купленную;
--    car_rename(прилагательное, существительное) — имя из готовых слов (свои слова дети не пишут — их увидят соперники).
-- 3. Гонка: race_start() — трасса из дорог своего города (4 клетки дороги и больше; иначе — кольцо вокруг города),
--    три соперника: машины других игроков с похожей силой (видно только имя машины и детали), не хватает — тренировочные машины.
--    Время считает сервер: прямые — мощность, обтекаемость, трение, масса; повороты — ещё и сцепление; разброс ±5 %.
--    Шестерёнки за место: 6 / 3 / 1 — первые 5 гонок в день, дальше гонки без награды. Между гонками — не меньше 12 секунд.

-- ================= 1. Группы клеток города =================
create or replace function public.city_groups(p_tiles jsonb)
returns table (x int, y int, c text, gid int, n int)
language sql
immutable
set search_path = ''
as $$
  with recursive t as (
    select (e->>'x')::int as x, (e->>'y')::int as y, e->>'c' as c, i::int as id
      from jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) with ordinality a(e, i)
     where e->>'c' in ('house', 'field', 'forest', 'flowers', 'tree', 'water', 'road')
  ), r(a, b) as (
    select id, id from t
    union
    select r.a, t2.id from r join t t1 on t1.id = r.b join t t2 on t2.c = t1.c and abs(t2.x - t1.x) + abs(t2.y - t1.y) = 1
  ), g as (select a, min(b) as gid, count(*) as n from r group by a)
  select t.x, t.y, t.c, g.gid::int, g.n::int from t join g on g.a = t.id
$$;
revoke execute on function public.city_groups(jsonb) from public, anon;

create or replace function public.city_bonus(p_n int)
returns int language sql immutable set search_path = '' as $$ select case when p_n >= 8 then 5 when p_n >= 5 then 3 when p_n >= 3 then 1 else 0 end $$;

create or replace function public.city_ready(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.collected_on = public.hero_today() then 0 else least(45,
    coalesce((
      select sum(i.income + case when i.merge > 0 and exists (
               select 1 from jsonb_array_elements(c.tiles) n
                where n->>'c' = t->>'c' and abs((n->>'x')::int - (t->>'x')::int) + abs((n->>'y')::int - (t->>'y')::int) = 1)
             then i.merge else 0 end)
        from jsonb_array_elements(c.tiles) t join public.city_items i on i.code = t->>'c'), 0)
    + coalesce((
      select sum(public.city_bonus(g.n)) from (select distinct q.gid, q.n, q.c from public.city_groups(c.tiles) q) g
       where g.c in ('house', 'field', 'forest', 'flowers', 'tree')), 0))::int end
  from public.city c where c.user_id = p_user
$$;
revoke execute on function public.city_ready(uuid) from public, anon, authenticated;

-- ================= 2. Гараж =================
create table if not exists public.car_parts (
  code   text primary key,
  slot   text not null check (slot in ('body', 'wheels', 'axle', 'engine', 'paint', 'extra')),
  title  text not null check (length(title) between 1 and 60),
  price  int not null default 0 check (price between 0 and 10000),
  era    int not null default 0 check (era between 0 and 5),       -- с какой эпохи города открывается
  stats  jsonb not null default '{}'::jsonb,                        -- pw мощность, gr сцепление, ar обтекаемость, fr трение, ms масса
  note   text,
  sort   int not null default 0,
  active boolean not null default true
);
alter table public.car_parts enable row level security;
drop policy if exists car_parts_read on public.car_parts;
create policy car_parts_read on public.car_parts for select to authenticated using (true);
drop policy if exists car_parts_admin on public.car_parts;
create policy car_parts_admin on public.car_parts for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.car_parts (code, slot, title, price, era, stats, note, sort) values
  ('cart',     'body',   'Тележка',            0,   0, '{"ar": 2, "ms": 4}', 'Доска и ящик. С неё начинали все: просто, но воздух упирается в плоский ящик.', 10),
  ('box',      'body',   'Фургон',             20,  0, '{"ar": 1, "ms": 5, "gr": 1}', 'Тяжёлый и устойчивый: вес прижимает колёса к дороге, но разгоняется медленнее.', 11),
  ('wedge',    'body',   'Клин',               40,  0, '{"ar": 5, "ms": 3}', 'Острый нос разрезает воздух — как нос-клин в опыте с ветром.', 12),
  ('drop',     'body',   'Капля',              70,  1, '{"ar": 7, "ms": 3}', 'Самая обтекаемая форма в природе: так летит капля дождя.', 13),
  ('racer',    'body',   'Болид',              140, 3, '{"ar": 9, "ms": 2, "gr": 1}', 'Низкий и лёгкий гоночный кузов: воздух прижимает его к трассе.', 14),
  ('wood',     'wheels', 'Деревянные колёса',  0,   0, '{"gr": 2, "fr": 3, "ms": 1}', 'Как у телеги: твёрдые и скользкие, на повороте проскальзывают.', 20),
  ('spoke',    'wheels', 'Колёса со спицами',  25,  0, '{"gr": 2, "fr": 2}', 'Спицы вместо сплошного диска — колесо легче, а значит, легче крутится.', 21),
  ('rubber',   'wheels', 'Резиновые шины',     50,  0, '{"gr": 5, "fr": 3, "ms": 1}', 'Резина проминается и цепляется за дорогу — как изолента на колёсах машинки.', 22),
  ('wide',     'wheels', 'Широкие шины',       80,  1, '{"gr": 7, "fr": 4, "ms": 2}', 'Больше пятно контакта — крепче держат в повороте, но тяжелее катятся.', 23),
  ('slick',    'wheels', 'Слики',              140, 3, '{"gr": 8, "fr": 2, "ms": 1}', 'Гоночные шины без рисунка: мягкая резина почти прилипает к трассе.', 24),
  ('axle',     'axle',   'Ось во втулках',     0,   0, '{"fr": 4}', 'Вал трётся о дерево: трение скольжения, колёса быстро останавливаются.', 30),
  ('bearing',  'axle',   'Подшипники',         45,  0, '{"fr": 0}', 'Шарики катятся между кольцами: трение качения в десятки раз меньше.', 31),
  ('slope',    'engine', 'Без мотора (горка)', 0,   0, '{"pw": 1}', 'Едет только под горку — как наша машинка-испытатель.', 40),
  ('rubber_m', 'engine', 'Резиномотор',        30,  0, '{"pw": 3}', 'Закрученная резинка раскручивается и вращает колёса.', 41),
  ('balloon',  'engine', 'Воздушный шарик',    45,  0, '{"pw": 4, "ms": -1}', 'Воздух вырывается назад — машина едет вперёд. Это реактивное движение.', 42),
  ('spring',   'engine', 'Заводная пружина',   70,  1, '{"pw": 5, "ms": 1}', 'Как в заводной игрушке и старинных часах: пружина отдаёт запасённую силу.', 43),
  ('steam',    'engine', 'Паровой котёл',      110, 2, '{"pw": 7, "ms": 3}', 'Пар толкает поршень — так ездили первые самоходные повозки.', 44),
  ('electric', 'engine', 'Электромотор',       160, 3, '{"pw": 9, "ms": 2}', 'Тихий и сильный сразу с места — как у современных электромобилей.', 45),
  ('paint_red',    'paint', 'Красный',    0, 0, '{}', null, 50),
  ('paint_blue',   'paint', 'Синий',      5, 0, '{}', null, 51),
  ('paint_green',  'paint', 'Зелёный',    5, 0, '{}', null, 52),
  ('paint_yellow', 'paint', 'Жёлтый',     5, 0, '{}', null, 53),
  ('paint_orange', 'paint', 'Оранжевый',  5, 0, '{}', null, 54),
  ('paint_purple', 'paint', 'Фиолетовый', 5, 0, '{}', null, 55),
  ('paint_black',  'paint', 'Чёрный',     5, 0, '{}', null, 56),
  ('paint_white',  'paint', 'Белый',      5, 0, '{}', null, 57),
  ('none',     'extra',  'Без украшений',      0,   0, '{}', null, 60),
  ('flag',     'extra',  'Флажок',             8,   0, '{}', 'Видно издалека на трассе.', 61),
  ('number',   'extra',  'Номер на борту',     8,   0, '{}', 'Как у настоящих гонщиков.', 62),
  ('lights',   'extra',  'Фары',               20,  0, '{}', 'Мигают на старте.', 63),
  ('spoiler',  'extra',  'Антикрыло',          60,  2, '{"gr": 1}', 'Воздух давит на крыло сверху и прижимает колёса к дороге.', 64)
on conflict (code) do nothing;

create table if not exists public.cars (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  name       text not null default 'Быстрая Молния' check (length(name) between 3 and 40),
  parts      jsonb not null default '{"body": "cart", "wheels": "wood", "axle": "axle", "engine": "slope", "paint": "paint_red", "extra": "none"}'::jsonb,
  owned      text[] not null default '{}',
  races      int not null default 0,
  wins       int not null default 0,
  last_race  timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.cars enable row level security;
drop policy if exists cars_read on public.cars;
create policy cars_read on public.cars for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- писать напрямую нельзя: только car_buy / car_equip / car_rename / race_start

create table if not exists public.races (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  place      int not null check (place between 1 and 4),
  gears      int not null default 0,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists races_user_day_idx on public.races (user_id, day);
alter table public.races enable row level security;
drop policy if exists races_read on public.races;
create policy races_read on public.races for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.car_names()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"adj": ["Быстрая", "Рыжая", "Смелая", "Хитрая", "Громкая", "Ловкая", "Звёздная", "Огненная", "Ледяная", "Весёлая", "Синяя", "Гордая"],
           "noun": ["Молния", "Комета", "Ракета", "Стрела", "Пчела", "Черепаха", "Ласточка", "Искра", "Буря", "Капля", "Шестерёнка", "Пружина"]}'::jsonb
$$;

-- характеристики машины: сумма по деталям, каждая от 0 до 10
create or replace function public.car_stats(p_parts jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pw', least(10, greatest(0, coalesce(sum((p.stats->>'pw')::int), 0))),
    'gr', least(10, greatest(0, coalesce(sum((p.stats->>'gr')::int), 0))),
    'ar', least(10, greatest(0, coalesce(sum((p.stats->>'ar')::int), 0))),
    'fr', least(10, greatest(0, coalesce(sum((p.stats->>'fr')::int), 0))),
    'ms', least(10, greatest(0, coalesce(sum((p.stats->>'ms')::int), 0))))
  from jsonb_each_text(coalesce(p_parts, '{}'::jsonb)) e join public.car_parts p on p.code = e.value
$$;
revoke execute on function public.car_stats(jsonb) from public, anon;

-- «сила» машины для подбора соперников: время на условной трассе (меньше — сильнее)
create or replace function public.car_lap(p_stats jsonb, p_straight numeric, p_turns numeric)
returns numeric language sql immutable set search_path = '' as $$
  select p_straight / v + p_turns / least(v, 0.8 + 0.3 * (p_stats->>'gr')::numeric)
    from (select greatest(0.3, 1 + 0.32 * (p_stats->>'pw')::numeric + 0.1 * (p_stats->>'ar')::numeric
                 - 0.08 * (p_stats->>'fr')::numeric - 0.06 * (p_stats->>'ms')::numeric) as v) q
$$;

create or replace function public.car_row(p_user uuid)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare c public.cars; nm jsonb := public.car_names();
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  insert into public.cars (user_id, name)
  values (p_user, (nm->'adj'->>floor(random() * 12)::int) || ' ' || (nm->'noun'->>floor(random() * 12)::int))
  on conflict (user_id) do nothing;
  select * into c from public.cars where user_id = p_user;
  return c;
end;
$$;
revoke execute on function public.car_row(uuid) from public, anon, authenticated;

create or replace function public.car_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); c public.cars; e int; today date := public.hero_today(); n int;
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  c := public.car_row(uid);
  e := public.city_era(uid);
  select count(*) into n from public.races where user_id = uid and day = today and gears > 0;
  return jsonb_build_object(
    'car', jsonb_build_object('name', c.name, 'parts', c.parts, 'races', c.races, 'wins', c.wins),
    'stats', public.car_stats(c.parts),
    'gears', coalesce((select gears from public.hero where user_id = uid), 0),
    'era', e,
    'prize_left', greatest(0, 5 - n),
    'parts', coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'slot', p.slot, 'title', p.title, 'price', p.price, 'era', p.era, 'stats', p.stats, 'note', p.note,
        'era_name', (array['Стоянка древних людей', 'Деревня у реки', 'Долина мельниц', 'Мастерская Леонардо', 'Город первых автомобилей', 'Город будущего'])[p.era + 1],
        'owned', p.price = 0 or p.code = any (c.owned), 'unlocked', p.era <= e) order by p.sort, p.code)
      from public.car_parts p where p.active), '[]'::jsonb));
end;
$$;
revoke execute on function public.car_state() from public, anon;
grant execute on function public.car_state() to authenticated;

create or replace function public.car_buy(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); p public.car_parts; c public.cars;
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  select * into p from public.car_parts where code = p_code and active;
  if not found then raise exception 'Такой детали нет'; end if;
  c := public.car_row(uid);
  perform 1 from public.cars where user_id = uid for update;
  if p.era > public.city_era(uid) then raise exception 'Эта деталь откроется в новой эпохе города — пройди следующий блок курса'; end if;
  if p.price > 0 and not (p.code = any (c.owned)) then
    update public.hero set gears = gears - p.price, updated_at = now() where user_id = uid and gears >= p.price;
    if not found then raise exception 'Не хватает шестерёнок'; end if;
    update public.cars set owned = array_append(owned, p.code) where user_id = uid;
  end if;
  update public.cars set parts = parts || jsonb_build_object(p.slot, p.code), updated_at = now() where user_id = uid;
  return public.car_state();
end;
$$;
revoke execute on function public.car_buy(text) from public, anon;
grant execute on function public.car_buy(text) to authenticated;

create or replace function public.car_equip(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); p public.car_parts; c public.cars;
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  select * into p from public.car_parts where code = p_code and active;
  if not found then raise exception 'Такой детали нет'; end if;
  c := public.car_row(uid);
  if p.price > 0 and not (p.code = any (c.owned)) then raise exception 'Сначала купи эту деталь'; end if;
  update public.cars set parts = parts || jsonb_build_object(p.slot, p.code), updated_at = now() where user_id = uid;
  return public.car_state();
end;
$$;
revoke execute on function public.car_equip(text) from public, anon;
grant execute on function public.car_equip(text) to authenticated;

create or replace function public.car_rename(p_adj int, p_noun int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); nm jsonb := public.car_names();
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  if p_adj not between 0 and jsonb_array_length(nm->'adj') - 1 or p_noun not between 0 and jsonb_array_length(nm->'noun') - 1 then raise exception 'Такого имени нет'; end if;
  perform public.car_row(uid);
  update public.cars set name = (nm->'adj'->>p_adj) || ' ' || (nm->'noun'->>p_noun), updated_at = now() where user_id = uid;
  return public.car_state();
end;
$$;
revoke execute on function public.car_rename(int, int) from public, anon;
grant execute on function public.car_rename(int, int) to authenticated;

-- ================= 3. Гонка =================
create or replace function public.race_start()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid()); c public.cars; today date := public.hero_today(); tl jsonb; r int;
  n_road int; n_turn int; ring boolean; my jsonb; my_t numeric; racers jsonb := '[]'::jsonb; q record; k int := 0;
  place int; prize int; g int := 0; rid bigint; res jsonb;
  bots jsonb := '[
    {"name": "Тренировочная «Улитка»", "parts": {"body": "cart",  "wheels": "wood",   "axle": "axle",    "engine": "slope",    "paint": "paint_white",  "extra": "none"}},
    {"name": "Тренировочная «Телега»", "parts": {"body": "box",   "wheels": "wood",   "axle": "axle",    "engine": "slope",    "paint": "paint_yellow", "extra": "none"}},
    {"name": "Тренировочная «Пчёлка»", "parts": {"body": "cart",  "wheels": "spoke",  "axle": "axle",    "engine": "slope",    "paint": "paint_orange", "extra": "flag"}},
    {"name": "Тренировочная «Ёжик»",   "parts": {"body": "cart",  "wheels": "spoke",  "axle": "axle",    "engine": "rubber_m", "paint": "paint_green",  "extra": "none"}},
    {"name": "Тренировочная «Жук»",    "parts": {"body": "box",   "wheels": "rubber", "axle": "bearing", "engine": "rubber_m", "paint": "paint_blue",   "extra": "flag"}},
    {"name": "Тренировочная «Стриж»",  "parts": {"body": "wedge", "wheels": "rubber", "axle": "bearing", "engine": "balloon",  "paint": "paint_yellow", "extra": "number"}},
    {"name": "Тренировочная «Сокол»",  "parts": {"body": "drop",  "wheels": "wide",   "axle": "bearing", "engine": "spring",   "paint": "paint_orange", "extra": "lights"}},
    {"name": "Тренировочная «Гепард»", "parts": {"body": "racer", "wheels": "slick",  "axle": "bearing", "engine": "steam",    "paint": "paint_purple", "extra": "spoiler"}},
    {"name": "Тренировочная «Ракета»", "parts": {"body": "racer", "wheels": "slick",  "axle": "bearing", "engine": "electric", "paint": "paint_black",  "extra": "spoiler"}}]'::jsonb;
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  c := public.car_row(uid);
  select * into c from public.cars where user_id = uid for update;
  if c.last_race is not null and c.last_race > now() - interval '12 seconds' then raise exception 'Машина ещё не остыла после гонки — подожди несколько секунд'; end if;

  -- трасса: дороги и мосты города; меньше 4 клеток — кольцо вокруг города
  select coalesce((select tiles from public.city where user_id = uid), '[]'::jsonb) into tl;
  r := public.city_r(uid);
  select count(*), count(*) filter (where not (
           (e1 and e2 and not e3 and not e4) or (e3 and e4 and not e1 and not e2) or (e1::int + e2::int + e3::int + e4::int) <= 1))
    into n_road, n_turn
    from (select public.city_at(tl, x + 1, y) in ('road', 'bridge') is true as e1, public.city_at(tl, x - 1, y) in ('road', 'bridge') is true as e2,
                 public.city_at(tl, x, y + 1) in ('road', 'bridge') is true as e3, public.city_at(tl, x, y - 1) in ('road', 'bridge') is true as e4
            from (select (t->>'x')::int as x, (t->>'y')::int as y from jsonb_array_elements(tl) t where t->>'c' in ('road', 'bridge')) s) w;
  ring := n_road < 4;
  if ring then n_road := 8 * (r + 1); n_turn := 4; end if;

  my := public.car_stats(c.parts);
  my_t := public.car_lap(my, n_road - n_turn, n_turn);
  racers := jsonb_build_array(jsonb_build_object('name', c.name, 'me', true, 'kind', 'me', 'parts', c.parts, 'stats', my,
    'time', round(my_t * (0.95 + random()::numeric * 0.1), 3)));

  -- соперники: машины других игроков с похожей силой (только имя машины и детали)
  for q in
    select o.name, o.parts, public.car_stats(o.parts) as s
      from public.cars o
     where o.user_id <> uid and o.updated_at > now() - interval '60 days'
     order by abs(public.car_lap(public.car_stats(o.parts), n_road - n_turn, n_turn) - my_t) / greatest(my_t, 1) + random() * 0.35
     limit 3
  loop
    k := k + 1;
    racers := racers || jsonb_build_object('name', q.name, 'kind', 'player', 'parts', q.parts, 'stats', q.s,
      'time', round(public.car_lap(q.s, n_road - n_turn, n_turn) * (0.95 + random()::numeric * 0.1), 3));
  end loop;
  -- не хватает игроков — тренировочные машины примерно той же силы
  for q in
    select b->>'name' as name, b->'parts' as parts, public.car_stats(b->'parts') as s
      from jsonb_array_elements(bots) b
     order by abs(public.car_lap(public.car_stats(b->'parts'), n_road - n_turn, n_turn) - my_t) / greatest(my_t, 1) + random() * 0.6
     limit greatest(0, 3 - k)
  loop
    racers := racers || jsonb_build_object('name', q.name, 'kind', 'bot', 'parts', q.parts, 'stats', q.s,
      'time', round(public.car_lap(q.s, n_road - n_turn, n_turn) * (0.95 + random()::numeric * 0.1), 3));
  end loop;

  select jsonb_agg(x order by (x->>'time')::numeric) into racers from jsonb_array_elements(racers) x;
  select i::int into place from jsonb_array_elements(racers) with ordinality a(x, i) where (x->>'me')::boolean is true;

  select greatest(0, 5 - count(*)) into prize from public.races where user_id = uid and day = today and gears > 0;
  if prize > 0 then g := (array[6, 3, 1, 0])[place]; end if;
  res := jsonb_build_object('track', jsonb_build_object('n', n_road, 'turns', n_turn, 'ring', ring), 'racers', racers);
  insert into public.races (user_id, day, place, gears, result) values (uid, today, place, g, res) returning id into rid;
  if g > 0 then perform public.hero_bonus(uid, 'game', 'race:' || rid, '{}'::jsonb, g, 'Гонка в городе: ' || place || ' место', true); end if;
  update public.cars set races = races + 1, wins = wins + (place = 1)::int, last_race = now() where user_id = uid;
  return res || jsonb_build_object('id', rid, 'place', place, 'gears', g, 'prize_left', greatest(0, prize - (g > 0)::int),
    'balance', coalesce((select gears from public.hero where user_id = uid), 0));
end;
$$;
revoke execute on function public.race_start() from public, anon;
grant execute on function public.race_start() to authenticated;
