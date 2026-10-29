-- Откат 20261029000037_guest_city.sql: прежние версии функций, без play_start.
-- Профили гостей, которые уже успели поиграть, остаются (их уберёт ночная уборка вместе с гостями).

drop function if exists public.play_start();

create or replace function public.admin_students()
returns table (
  id              uuid,
  email           text,
  student_name    text,
  parent_name     text,
  contact         text,
  role            text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  courses         jsonb,
  approved        integer,
  submitted       integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Только для администратора';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.student_name,
    p.parent_name,
    p.contact,
    p.role,
    p.created_at,
    u.last_sign_in_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'course_id', c.id, 'slug', c.slug, 'title', c.title,
               'status', e.status, 'since', e.created_at) order by c.sort)
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      where e.user_id = p.id
    ), '[]'::jsonb),
    (select count(*)::integer from public.lesson_progress lp where lp.user_id = p.id and lp.status = 'approved'),
    (select count(*)::integer from public.lesson_progress lp where lp.user_id = p.id and lp.status = 'submitted')
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_students() from public, anon;
grant execute on function public.admin_students() to authenticated;

create or replace function public.cleanup_guests()
returns void language sql security definer set search_path = '' as $$
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '1 day'
    and not exists (select 1 from public.support_threads t where t.user_id = u.id);
  delete from public.notify_log where created_at < now() - interval '30 days';
$$;
revoke execute on function public.cleanup_guests() from public, anon, authenticated;

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
