-- Откат 20261026000029_shop.sql: убрать лавку (покупки и каталог удаляются; потраченные шестерёнки не возвращаются).
drop function if exists public.shop_buy(bigint, text);
drop function if exists public.shop_order_set(bigint, text);
drop table if exists public.shop_orders;
drop table if exists public.shop_items;

-- hero_status — как в 20261026000028_hero_path.sql
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
    'chests', coalesce((select jsonb_agg(ref) from public.hero_events where user_id = uid and source = 'chest' and ref not like 'daily:%'), '[]'::jsonb));
end;
$$;
revoke execute on function public.hero_status() from public, anon;
