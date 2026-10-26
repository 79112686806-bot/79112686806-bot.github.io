-- Карта курса и награды героя: серия дней 🔥, шестерёнки ⚙, задания дня и сундуки.
-- Нужна миграция 20261026000027_hero.sql (таблицы hero и hero_events). Повторный запуск безопасен.
--
-- Серия дней: день засчитывается, когда ребёнок сам что-то сделал и получил за это событие героя
-- (серия, исследование, чат, мини-задание, отправка темы на проверку). Подтверждение темы преподавателем — не в счёт.
-- Пропустил один день — спасает «заморозка» (freezes), если она есть. Дни — по московскому времени.
-- Шестерёнки — валюта для будущего магазина: за сундуки (задания дня, пройденный блок, весь курс) и вехи серии.
-- Всё считает и выдаёт сервер; сайт только показывает и просит открыть сундук (hero_status, hero_claim).

alter table public.hero_events add column if not exists gears int not null default 0;
alter table public.hero_events drop constraint if exists hero_events_source_check;
alter table public.hero_events add constraint hero_events_source_check
  check (source in ('onboarding', 'episode', 'lesson', 'research', 'chat', 'teacher', 'bonus', 'quiz', 'streak', 'chest'));

create or replace function public.hero_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Moscow')::date $$;

-- событие сделал сам ребёнок (для серии дней и заданий дня)
create or replace function public.hero_is_kid(p_source text, p_ref text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_source in ('episode', 'research', 'chat', 'quiz') or (p_source = 'lesson' and coalesce(p_ref, '') like 'sub:%') $$;

-- ---------- Награда: очки характеристик и/или шестерёнки (только изнутри базы) ----------
create or replace function public.hero_bonus(p_user uuid, p_source text, p_ref text, p_deltas jsonb, p_gears int,
  p_note text default null, p_seen boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare d jsonb := '{}'::jsonb; k text; v int; total int := 0; g int := greatest(0, coalesce(p_gears, 0));
begin
  for k, v in select key, value::int from jsonb_each_text(coalesce(p_deltas, '{}'::jsonb)) loop
    if k in ('obs', 'cur', 'fan', 'craft', 'res', 'grit') and v <> 0 then
      d := d || jsonb_build_object(k, v); total := total + v;
    end if;
  end loop;
  if d = '{}'::jsonb and g = 0 then return null; end if;
  insert into public.hero_events (user_id, source, ref, deltas, xp, gears, note, seen_at)
  values (p_user, p_source, p_ref, d, total, g, p_note, case when p_seen then now() end)
  on conflict (user_id, ref) where ref is not null do nothing;
  if not found then return null; end if;
  insert into public.hero (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.hero set
    obs   = greatest(0, obs   + coalesce((d->>'obs')::int, 0)),
    cur   = greatest(0, cur   + coalesce((d->>'cur')::int, 0)),
    fan   = greatest(0, fan   + coalesce((d->>'fan')::int, 0)),
    craft = greatest(0, craft + coalesce((d->>'craft')::int, 0)),
    res   = greatest(0, res   + coalesce((d->>'res')::int, 0)),
    grit  = greatest(0, grit  + coalesce((d->>'grit')::int, 0)),
    gears = gears + g,
    updated_at = now()
  where user_id = p_user;
  return jsonb_build_object('deltas', d, 'gears', g, 'note', p_note);
end;
$$;
revoke execute on function public.hero_bonus(uuid, text, text, jsonb, int, text, boolean) from public, anon, authenticated;

-- ---------- Серия дней: после каждого события ребёнка ----------
create or replace function public.hero_streak_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare today date := public.hero_today(); h public.hero; n int; prize int;
begin
  if not public.hero_is_kid(new.source, new.ref) then return new; end if;
  insert into public.hero (user_id) values (new.user_id) on conflict (user_id) do nothing;
  select * into h from public.hero where user_id = new.user_id for update;
  if h.last_day = today then return new; end if;
  if h.last_day = today - 1 then n := h.streak + 1;
  elsif h.last_day = today - 2 and h.freezes > 0 then
    n := h.streak + 1; update public.hero set freezes = freezes - 1 where user_id = new.user_id;
  else n := 1; end if;
  update public.hero set streak = n, best_streak = greatest(best_streak, n), last_day = today where user_id = new.user_id;
  prize := case n when 3 then 10 when 7 then 25 when 14 then 50 when 30 then 100 when 50 then 150 when 100 then 300 else 0 end;
  if prize > 0 then
    perform public.hero_bonus(new.user_id, 'streak', 'streak:' || n || ':' || today, '{}'::jsonb, prize,
      'Серия ' || n || ' ' || case when n % 10 = 1 and n % 100 <> 11 then 'день' when n % 10 between 2 and 4 and n % 100 not between 12 and 14 then 'дня' else 'дней' end || ' подряд!');
    if n = 7 then update public.hero set freezes = least(2, freezes + 1) where user_id = new.user_id; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists hero_streak_tick on public.hero_events;
create trigger hero_streak_tick after insert on public.hero_events
  for each row execute function public.hero_streak_tick();

-- ---------- Задания дня: три задания, меняются каждый день; первое — всегда опыт ----------
create or replace function public.hero_quests(p_user uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare pool text[] := array['stats2', 'ep3', 'xp50', 'chat', 'fan10', 'stats3'];   -- пары i и i+3 — разные по смыслу
  n int := extract(epoch from p_day)::int / 86400; a text; b text;
  xp int; stats int; ep int; chat int; fan int; out jsonb := '[]'::jsonb; q text;
begin
  a := pool[1 + n % 6]; b := pool[1 + (n + 3) % 6];
  select coalesce(sum(greatest(e.xp, 0)), 0),
         count(*) filter (where e.source = 'episode'),
         count(*) filter (where e.source = 'chat'),
         coalesce(sum(greatest(coalesce((e.deltas->>'fan')::int, 0), 0)), 0)
    into xp, ep, chat, fan
    from public.hero_events e
   where e.user_id = p_user and public.hero_is_kid(e.source, e.ref)
     and (e.created_at at time zone 'Europe/Moscow')::date = p_day;
  select count(distinct d.key) into stats
    from public.hero_events e, jsonb_each_text(e.deltas) d
   where e.user_id = p_user and public.hero_is_kid(e.source, e.ref) and d.value::int > 0
     and (e.created_at at time zone 'Europe/Moscow')::date = p_day;
  foreach q in array array['xp20', a, b] loop
    out := out || jsonb_build_object('key', q,
      'title', case q when 'xp20' then 'Заработай 20 очков опыта' when 'xp50' then 'Заработай 50 очков опыта'
        when 'stats2' then 'Прокачай 2 разные характеристики' when 'stats3' then 'Прокачай 3 разные характеристики'
        when 'ep3' then 'Ответь на 3 вопроса в серии' when 'chat' then 'Задай вопрос преподавателю в чате темы'
        when 'fan10' then 'Получи 10 очков Фантазии' end,
      'target', case q when 'xp20' then 20 when 'xp50' then 50 when 'stats2' then 2 when 'stats3' then 3
        when 'ep3' then 3 when 'chat' then 1 when 'fan10' then 10 end,
      'have', case q when 'xp20' then xp when 'xp50' then xp when 'stats2' then stats when 'stats3' then stats
        when 'ep3' then ep when 'chat' then chat when 'fan10' then fan end);
  end loop;
  return out;
end;
$$;
revoke execute on function public.hero_quests(uuid, date) from public, anon, authenticated;

-- ---------- Всё для верхней панели и карты: серия, шестерёнки, задания дня, открытые сундуки ----------
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

-- ---------- Открыть сундук ----------
-- p_kind: 'daily' — все задания дня выполнены; 'block' — все темы блока (p_id = modules.id) подтверждены;
-- 'course' — все темы курса (p_id = courses.id) подтверждены. Награда случайная, решает сервер.
create or replace function public.hero_claim(p_kind text, p_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); today date := public.hero_today(); q jsonb; r jsonb;
  keys text[] := array['obs', 'cur', 'fan', 'craft', 'res', 'grit']; k text;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  if p_kind = 'daily' then
    q := public.hero_quests(uid, today);
    if exists (select 1 from jsonb_array_elements(q) x where (x->>'have')::int < (x->>'target')::int) then
      raise exception 'Задания дня ещё не выполнены';
    end if;
    r := public.hero_bonus(uid, 'chest', 'daily:' || today, '{}'::jsonb, 10 + floor(random() * 16)::int, 'Сундук за задания дня', true);
  elsif p_kind = 'block' then
    if not exists (select 1 from public.lessons where module_id = p_id)
       or exists (select 1 from public.lessons l where l.module_id = p_id and not exists (
         select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = l.id and p.status = 'approved')) then
      raise exception 'Блок ещё не пройден';
    end if;
    k := keys[1 + floor(random() * 6)::int];
    r := public.hero_bonus(uid, 'chest', 'block:' || p_id, jsonb_build_object(k, 10), 40 + floor(random() * 31)::int, 'Сундук за пройденный блок', true);
  elsif p_kind = 'course' then
    if not exists (select 1 from public.modules m join public.lessons l on l.module_id = m.id where m.course_id = p_id)
       or exists (select 1 from public.modules m join public.lessons l on l.module_id = m.id where m.course_id = p_id and not exists (
         select 1 from public.lesson_progress p where p.user_id = uid and p.lesson_id = l.id and p.status = 'approved')) then
      raise exception 'Курс ещё не пройден';
    end if;
    r := public.hero_bonus(uid, 'chest', 'course:' || p_id,
      '{"obs": 10, "cur": 10, "fan": 10, "craft": 10, "res": 10, "grit": 10}'::jsonb, 150, 'Кубок за весь курс', true);
  else
    raise exception 'Неизвестный сундук';
  end if;
  if r is null then raise exception 'Этот сундук уже открыт'; end if;
  return r;
end;
$$;
revoke execute on function public.hero_claim(text, bigint) from public, anon;
