-- Админ меняет число шестерёнок ученика: админка → карточка ученика → «Герой-инженер» → «Шестерёнки».
-- Нужна миграция 20261026000028_hero_path.sql. Повторный запуск безопасен.
-- Откат — supabase/rollback/20261029000038_admin_gears_rollback.sql.
-- Изменение пишется в hero_events (source 'teacher', gears со знаком) — видно в истории у админа и у ученика.
-- Списать больше, чем есть, нельзя: остаток не уходит ниже нуля.

create or replace function public.admin_gears(p_user uuid, p_delta int, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare have int; d int;
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Укажите, сколько добавить или списать'; end if;
  if abs(p_delta) > 100000 then raise exception 'Слишком большое число'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Ученик не найден'; end if;
  insert into public.hero (user_id) values (p_user) on conflict (user_id) do nothing;
  select gears into have from public.hero where user_id = p_user for update;
  d := greatest(p_delta, -have);   -- ниже нуля не списываем
  if d = 0 then raise exception 'У ученика 0 шестерёнок — списывать нечего'; end if;
  update public.hero set gears = gears + d, updated_at = now() where user_id = p_user;
  insert into public.hero_events (user_id, source, ref, deltas, xp, gears, note, by_user, seen_at)
  values (p_user, 'teacher', 'gears:' || gen_random_uuid(), '{}'::jsonb, 0, d,
    coalesce(nullif(left(trim(coalesce(p_note, '')), 500), ''), case when d > 0 then 'Шестерёнки от преподавателя' else 'Шестерёнки списаны' end),
    (select auth.uid()), case when d < 0 then now() end);   -- о подарке ученик узнает праздничным экраном, о списании — только в истории
  return jsonb_build_object('gears', have + d, 'delta', d);
end;
$$;
revoke execute on function public.admin_gears(uuid, int, text) from public, anon;
grant execute on function public.admin_gears(uuid, int, text) to authenticated;
