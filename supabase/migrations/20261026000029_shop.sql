-- Лавка мастера: на что тратить шестерёнки. Нужны миграции 20261026000027_hero.sql и 20261026000028_hero_path.sql.
-- Повторный запуск безопасен. Откат — supabase/rollback/20261026000029_shop_rollback.sql.
--
-- Товары (shop_items) трёх видов:
--   freeze — заморозка серии дней (сразу +1 заморозка, держать можно не больше 2);
--   ride   — украшение для транспорта на карте курса (code: pennant, horn, trail), покупается один раз;
--   prize  — настоящий приз: покупка ждёт вручения (status new), администратор отмечает «Вручён» или отменяет — шестерёнки возвращаются.
-- Покупает только сервер (shop_buy): проверяет цену, остаток и баланс, списывает шестерёнки в одной транзакции.
-- Каталог и цены администратор меняет в админке → «Лавка и призы».

create table if not exists public.shop_items (
  id         bigserial primary key,
  code       text unique,
  kind       text not null check (kind in ('freeze', 'ride', 'prize')),
  title      text not null check (length(title) between 1 and 120),
  about      text check (length(about) <= 400),
  icon       text check (length(icon) <= 16),
  price      int not null check (price > 0 and price <= 100000),
  stock      int check (stock >= 0),          -- сколько осталось (пусто — без ограничения)
  per_user   int check (per_user > 0),        -- сколько раз один ученик может купить (пусто — сколько угодно)
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.shop_items enable row level security;
drop policy if exists shop_items_read on public.shop_items;
create policy shop_items_read on public.shop_items for select to authenticated using (active or public.is_admin());
drop policy if exists shop_items_admin on public.shop_items;
create policy shop_items_admin on public.shop_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.shop_orders (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_id    bigint references public.shop_items (id) on delete set null,
  kind       text not null,
  code       text,
  title      text not null,
  price      int not null,
  note       text check (length(note) <= 300),
  status     text not null default 'new' check (status in ('new', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists shop_orders_user_idx on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_new_idx on public.shop_orders (status) where status = 'new';
alter table public.shop_orders enable row level security;
drop policy if exists shop_orders_read on public.shop_orders;
create policy shop_orders_read on public.shop_orders for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- писать напрямую нельзя никому: только shop_buy и shop_order_set

-- ---------- Купить ----------
create or replace function public.shop_buy(p_item bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); it public.shop_items; h public.hero; n int; oid bigint; st text;
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

-- ---------- Администратор: приз вручён / отменить (шестерёнки возвращаются) ----------
create or replace function public.shop_order_set(p_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.shop_orders;
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  if p_status not in ('done', 'cancelled') then raise exception 'Неизвестное состояние'; end if;
  select * into o from public.shop_orders where id = p_id for update;
  if not found then raise exception 'Покупка не найдена'; end if;
  if o.status <> 'new' then raise exception 'Эта покупка уже обработана'; end if;
  update public.shop_orders set status = p_status, done_at = now() where id = p_id;
  if p_status = 'cancelled' then
    update public.hero set gears = gears + o.price, updated_at = now() where user_id = o.user_id;
    update public.shop_items set stock = stock + 1 where id = o.item_id and stock is not null;
  end if;
end;
$$;
revoke execute on function public.shop_order_set(bigint, text) from public, anon;

-- ---------- hero_status: плюс купленные украшения транспорта ----------
create or replace function public.hero_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); today date := public.hero_today(); h public.hero; q jsonb;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into h from public.hero where user_id = uid;
  q := public.hero_quests(uid, today);
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
    'owned', coalesce((select jsonb_agg(distinct code) from public.shop_orders where user_id = uid and kind = 'ride' and status = 'done'), '[]'::jsonb));
end;
$$;
revoke execute on function public.hero_status() from public, anon;

-- ---------- Начальный каталог (цены и призы можно поменять в админке) ----------
insert into public.shop_items (code, kind, title, about, icon, price, per_user, sort) values
  ('freeze',         'freeze', 'Заморозка серии', 'Спасёт серию дней, если пропустишь один день. Держать можно не больше двух.', '❄️', 30, null, 10),
  ('pennant',        'ride',   'Вымпел на транспорт', 'Красный флажок на твоём транспорте на карте курса.', '🚩', 40, 1, 20),
  ('horn',           'ride',   'Гудок', 'Нажми на свой транспорт на карте — он погудит.', '📯', 60, 1, 21),
  ('trail',          'ride',   'Искры за транспортом', 'Когда транспорт едет по карте, за ним летят золотые искры.', '✨', 80, 1, 22),
  ('prize-stickers', 'prize',  'Наклейки «Инженерный клуб»', 'Набор наклеек. Вручим на занятии или отправим по почте.', '🏷️', 150, null, 30),
  ('prize-cert',     'prize',  'Именной сертификат «Юный инженер»', 'Красивый печатный сертификат с твоим именем.', '📜', 250, 1, 31),
  ('prize-badge',    'prize',  'Значок клуба', 'Металлический значок с шестерёнкой.', '⚙️', 300, null, 32),
  ('prize-notebook', 'prize',  'Блокнот инженера', 'Блокнот в клетку для чертежей и идей.', '📓', 500, null, 33),
  ('prize-call',     'prize',  'Дополнительная встреча с преподавателем', '15 минут: разобрать свою идею или проект.', '🎓', 600, null, 34),
  ('prize-kit',      'prize',  'Набор для сборки модели', 'Деревянный конструктор: собери свою машину.', '🧰', 1000, null, 35)
on conflict (code) do nothing;
