-- Шестерёнки без ожидания: победы в «Мемо «Инженерия» и «Ещё задачки» после разминки ума.
-- Нужны миграции 20261026000028_hero_path.sql и 20261029000032_city_brain.sql. Повторный запуск безопасен.
-- Откат — supabase/rollback/20261029000036_gears_games_rollback.sql.
--
-- Мемо (в кабинете, /igra/?kab в окне курса): memo_start(уровень) → номер партии, memo_finish(номер) → шестерёнки.
--   За победу: 6 пар — 4 ⚙, 10 пар — 8 ⚙, 15 пар — 14 ⚙. Сколько угодно партий; после 10 побед за день — половина.
--   Партия засчитывается, только если длилась не меньше 12 / 22 / 35 секунд (быстрее найти все пары нельзя) и не дольше 2 часов.
-- Ещё задачки: brain_more() — следующая задачка из банка, brain_extra_answer() — ответ: 2 ⚙ с первой попытки, 1 ⚙ со второй.
--   Шестерёнки — только за задачку, которую ребёнок ещё ни разу не решал (ни в разминке, ни здесь).
-- Источник событий героя — 'game': в серию дней не идёт (серию держат темы и разминка ума).

alter table public.hero_events drop constraint if exists hero_events_source_check;
alter table public.hero_events add constraint hero_events_source_check
  check (source in ('onboarding', 'episode', 'lesson', 'research', 'chat', 'teacher', 'bonus', 'quiz', 'streak', 'chest', 'city', 'game'));

-- ================= Мемо =================
create table if not exists public.memo_rounds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  level       text not null check (level in ('easy', 'mid', 'hard')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  day         date,
  gears       int not null default 0
);
create index if not exists memo_rounds_user_idx on public.memo_rounds (user_id, day);
alter table public.memo_rounds enable row level security;
drop policy if exists memo_rounds_read on public.memo_rounds;
create policy memo_rounds_read on public.memo_rounds for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- писать напрямую нельзя: только memo_start / memo_finish

create or replace function public.memo_start(p_level text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); rid uuid; wins int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  if p_level not in ('easy', 'mid', 'hard') then raise exception 'Неизвестный уровень'; end if;
  delete from public.memo_rounds where user_id = uid and finished_at is null;   -- начатые и брошенные партии не копятся
  insert into public.memo_rounds (user_id, level) values (uid, p_level) returning id into rid;
  select count(*) into wins from public.memo_rounds where user_id = uid and day = public.hero_today();
  return jsonb_build_object('id', rid, 'wins', wins, 'full', greatest(0, 10 - wins));
end;
$$;
revoke execute on function public.memo_start(text) from public, anon;

create or replace function public.memo_finish(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); r public.memo_rounds; today date := public.hero_today(); wins int; g int; sec numeric;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into r from public.memo_rounds where id = p_id and user_id = uid for update;
  if not found or r.finished_at is not null then raise exception 'Эта партия уже засчитана'; end if;
  sec := extract(epoch from now() - r.started_at);
  if sec < (case r.level when 'easy' then 12 when 'mid' then 22 else 35 end) then raise exception 'Слишком быстро — так не бывает'; end if;
  if sec > 7200 then raise exception 'Партия слишком долгая — начни новую'; end if;
  select count(*) into wins from public.memo_rounds where user_id = uid and day = today;
  g := case r.level when 'easy' then 4 when 'mid' then 8 else 14 end;
  if wins >= 10 then g := (g + 1) / 2; end if;
  update public.memo_rounds set finished_at = now(), day = today, gears = g where id = p_id;
  -- память и внимание: первые три победы за день — +1 к наблюдательности
  perform public.hero_bonus(uid, 'game', 'memo:' || p_id, case when wins < 3 then '{"obs": 1}'::jsonb else '{}'::jsonb end, g, 'Мемо «Инженерия»', true);
  return jsonb_build_object('gears', g, 'wins', wins + 1, 'full', greatest(0, 10 - wins - 1),
    'total', (select gears from public.hero where user_id = uid));
end;
$$;
revoke execute on function public.memo_finish(uuid) from public, anon;

-- ================= Ещё задачки =================
create table if not exists public.brain_extra (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  puzzle_id  bigint not null references public.brain_puzzles (id) on delete cascade,
  tries      int not null default 0,
  ok         boolean not null default false,
  done       boolean not null default false,
  gears      int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);
alter table public.brain_extra enable row level security;
drop policy if exists brain_extra_read on public.brain_extra;
create policy brain_extra_read on public.brain_extra for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

-- следующая задачка: начатая (если есть), иначе — ещё не решённая; уровень растёт с числом верных ответов
create or replace function public.brain_more()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); p public.brain_puzzles; e public.brain_extra; lv int; left_n int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select x.* into e from public.brain_extra x where x.user_id = uid and not x.done order by x.updated_at desc limit 1;
  if found then select * into p from public.brain_puzzles where id = e.puzzle_id;
  else
    select least(3, 1 + (count(*) filter (where ok)) / 6)::int into lv from (
      select ok from public.brain_answers where user_id = uid union all select ok from public.brain_extra where user_id = uid) t;
    select q.* into p from public.brain_puzzles q
     where q.active
       and not exists (select 1 from public.brain_extra x where x.user_id = uid and x.puzzle_id = q.id)
       and not exists (select 1 from public.brain_answers a where a.user_id = uid and a.puzzle_id = q.id and (a.ok or a.day = public.hero_today()))
     order by abs(q.level - lv), random() limit 1;
    if not found then return jsonb_build_object('puzzle', null, 'left', 0); end if;
    insert into public.brain_extra (user_id, puzzle_id) values (uid, p.id);
  end if;
  select count(*) into left_n from public.brain_puzzles q where q.active
     and not exists (select 1 from public.brain_extra x where x.user_id = uid and x.puzzle_id = q.id and x.done)
     and not exists (select 1 from public.brain_answers a where a.user_id = uid and a.puzzle_id = q.id and a.ok);
  return jsonb_build_object('left', left_n, 'puzzle', jsonb_build_object('id', p.id, 'kind', p.kind, 'level', p.level, 'data', p.data,
    'state', case when coalesce(e.tries, 0) > 0 then 'retry' else 'new' end, 'hint', case when coalesce(e.tries, 0) > 0 then p.hint end));
end;
$$;
revoke execute on function public.brain_more() from public, anon;

create or replace function public.brain_extra_answer(p_id bigint, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); p public.brain_puzzles; e public.brain_extra; good boolean; g int;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  select * into e from public.brain_extra where user_id = uid and puzzle_id = p_id for update;
  if not found then raise exception 'Эту задачку сначала нужно открыть'; end if;
  if e.done then raise exception 'Эта задачка уже решена'; end if;
  select * into p from public.brain_puzzles where id = p_id;
  good := trim(coalesce(p_answer, '')) = p.answer;
  if not good and e.tries = 0 then
    update public.brain_extra set tries = 1, updated_at = now() where user_id = uid and puzzle_id = p_id;
    return jsonb_build_object('retry', true, 'hint', p.hint);
  end if;
  g := case when not good then 0 when e.tries = 0 then 2 else 1 end;
  update public.brain_extra set tries = e.tries + 1, ok = good, done = true, gears = g, updated_at = now() where user_id = uid and puzzle_id = p_id;
  if g > 0 then perform public.hero_bonus(uid, 'game', 'brainx:' || p_id, '{}'::jsonb, g, 'Ещё задачки', true); end if;
  return jsonb_build_object('ok', good, 'gears', g, 'explain', p.explain) || case when good then '{}'::jsonb else jsonb_build_object('answer', p.answer) end;
end;
$$;
revoke execute on function public.brain_extra_answer(bigint, text) from public, anon;
