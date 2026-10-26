-- Герой-инженер ученика: шесть характеристик, как в RPG, растут (или падают) от действий ребёнка и оценок преподавателя.
-- obs — Наблюдательность, cur — Любопытство, fan — Фантазия, craft — Мастерство, res — Исследование, grit — Упорство.
-- В колонках — очки опыта характеристики (уровень считает сайт, hero.js); ниже нуля не опускаются.
-- Стартовые очки — из анкеты родителя (hero_onboard). Начисления — только на сервере (hero_award из триггеров и функций),
-- сам ученик ничего себе не пишет. Каждое начисление — строка hero_events (для анимаций «+10 💡» и истории);
-- ref не даёт начислить за одно и то же дважды (например, за один вопрос серии при повторном просмотре).
-- gears, streak, best_streak, last_day, freezes — для следующего шага (шестерёнки, серия дней, заморозки).
-- Повторный запуск безопасен.

create table if not exists public.hero (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  obs          int not null default 0 check (obs >= 0),
  cur          int not null default 0 check (cur >= 0),
  fan          int not null default 0 check (fan >= 0),
  craft        int not null default 0 check (craft >= 0),
  res          int not null default 0 check (res >= 0),
  grit         int not null default 0 check (grit >= 0),
  gears        int not null default 0 check (gears >= 0),
  streak       int not null default 0,
  best_streak  int not null default 0,
  last_day     date,
  freezes      int not null default 0,
  onboarding   jsonb,
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.hero_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  source     text not null check (source in ('onboarding', 'episode', 'lesson', 'research', 'chat', 'teacher', 'bonus')),
  ref        text,
  deltas     jsonb not null default '{}'::jsonb,   -- {"fan": 10, "obs": -5}
  xp         int not null default 0,               -- сумма deltas
  note       text,
  lesson_id  bigint references public.lessons (id) on delete set null,
  by_user    uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create unique index if not exists hero_events_ref_idx on public.hero_events (user_id, ref) where ref is not null;
create index if not exists hero_events_user_idx on public.hero_events (user_id, created_at desc);
create index if not exists hero_events_unseen_idx on public.hero_events (user_id) where seen_at is null;

alter table public.hero enable row level security;
alter table public.hero_events enable row level security;

drop policy if exists "Свой герой или админ" on public.hero;
create policy "Свой герой или админ" on public.hero for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Свои события героя или админ" on public.hero_events;
create policy "Свои события героя или админ" on public.hero_events for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------- Начисление (только изнутри базы) ----------
create or replace function public.hero_award(p_user uuid, p_source text, p_ref text, p_deltas jsonb,
  p_note text default null, p_lesson bigint default null, p_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare d jsonb := '{}'::jsonb; k text; v int; total int := 0;
begin
  if p_user is null or p_deltas is null then return '{}'::jsonb; end if;
  for k, v in select key, value::int from jsonb_each_text(p_deltas) loop
    if k in ('obs', 'cur', 'fan', 'craft', 'res', 'grit') and v <> 0 then
      d := d || jsonb_build_object(k, v); total := total + v;
    end if;
  end loop;
  if d = '{}'::jsonb then return d; end if;
  insert into public.hero_events (user_id, source, ref, deltas, xp, note, lesson_id, by_user)
  values (p_user, p_source, p_ref, d, total, p_note, p_lesson, p_by)
  on conflict (user_id, ref) where ref is not null do nothing;
  if not found then return '{}'::jsonb; end if;   -- уже начисляли за это
  insert into public.hero (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.hero set
    obs   = greatest(0, obs   + coalesce((d->>'obs')::int, 0)),
    cur   = greatest(0, cur   + coalesce((d->>'cur')::int, 0)),
    fan   = greatest(0, fan   + coalesce((d->>'fan')::int, 0)),
    craft = greatest(0, craft + coalesce((d->>'craft')::int, 0)),
    res   = greatest(0, res   + coalesce((d->>'res')::int, 0)),
    grit  = greatest(0, grit  + coalesce((d->>'grit')::int, 0)),
    updated_at = now()
  where user_id = p_user;
  return d;
end;
$$;
revoke execute on function public.hero_award(uuid, text, text, jsonb, text, bigint, uuid) from public, anon, authenticated;

-- ---------- Анкета родителя: один раз, стартовые очки считает сервер ----------
-- p: {age, likes[], fail, why, focus, team, goals[], note}
create or replace function public.hero_onboard(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); s jsonb; likes jsonb := coalesce(p->'likes', '[]'::jsonb);
  o int := 20; c int := 20; f int := 20; cr int := 20; r int := 20; g int := 20;
begin
  if uid is null then raise exception 'Нужно войти в кабинет'; end if;
  if exists (select 1 from public.hero where user_id = uid and onboarded_at is not null) then
    raise exception 'Анкета уже заполнена';
  end if;
  if length(p::text) > 4000 then raise exception 'Слишком длинные ответы'; end if;
  if likes ? 'build' then cr := cr + 40; end if;
  if likes ? 'draw' then f := f + 40; end if;
  if likes ? 'parts' then c := c + 30; cr := cr + 10; end if;
  if likes ? 'experiment' then r := r + 40; end if;
  if likes ? 'notice' then o := o + 40; end if;
  if likes ? 'games' then f := f + 20; cr := cr + 20; end if;
  case p->>'fail' when 'retry' then g := g + 50; when 'help' then g := g + 20; c := c + 10; else null; end case;
  case p->>'why' when 'often' then c := c + 45; o := o + 10; when 'some' then c := c + 20; else null; end case;
  case p->>'focus' when 'long' then g := g + 30; r := r + 20; when 'mid' then g := g + 15; r := r + 10; else null; end case;
  s := jsonb_build_object('obs', least(o, 160), 'cur', least(c, 160), 'fan', least(f, 160), 'craft', least(cr, 160), 'res', least(r, 160), 'grit', least(g, 160));
  insert into public.hero (user_id) values (uid) on conflict (user_id) do nothing;
  update public.hero set onboarding = p, onboarded_at = now() where user_id = uid;
  perform public.hero_award(uid, 'onboarding', 'onboarding', s, 'Герой создан');
  return s;
end;
$$;
revoke execute on function public.hero_onboard(jsonb) from public, anon;

-- ---------- Ученик отметил, что увидел начисления (для анимаций) ----------
create or replace function public.hero_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.hero_events set seen_at = now() where user_id = (select auth.uid()) and seen_at is null;
$$;
revoke execute on function public.hero_seen() from public, anon;

-- ---------- Оценка преподавателя: «+» или «−» по характеристикам (шаг 10 очков, от −30 до +30) ----------
create or replace function public.hero_grade(p_user uuid, p_deltas jsonb, p_note text default null, p_lesson bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare d jsonb := '{}'::jsonb; k text; v int;
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  for k, v in select key, value::int from jsonb_each_text(coalesce(p_deltas, '{}'::jsonb)) loop
    d := d || jsonb_build_object(k, greatest(-30, least(30, v)));
  end loop;
  return public.hero_award(p_user, 'teacher', 'teacher:' || gen_random_uuid(), d, nullif(left(trim(coalesce(p_note, '')), 500), ''), p_lesson, (select auth.uid()));
end;
$$;
revoke execute on function public.hero_grade(uuid, jsonb, text, bigint) from public, anon;

-- ---------- Ответы в серии: очки по узлу и ответу ----------
-- tag — какой узел выбрала серия после ответа (для проблемы: pOdd — шутка, pLife — не про вещь, pNone — нет ответа, p* — вещь).
-- За один вопрос серии начисляется один раз (ref ep:<серия>:<узел>); в строку ответа пишется, сколько начислено (deltas) —
-- плеер сразу показывает «+10 💡».
alter table public.episode_answers add column if not exists tag text check (length(tag) <= 40);
alter table public.episode_answers add column if not exists deltas jsonb;

create or replace function public.episode_points(p_node text, p_answer text, p_via text, p_tag text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare a text := coalesce(trim(p_answer), ''); n int;
begin
  if p_via in ('skip', 'timeout') and a = '' then return '{}'::jsonb; end if;
  if p_node = 'n01' then return '{"cur": 5}'::jsonb;
  elsif p_node = 'n03' then return jsonb_build_object('obs', case when a ilike 'колесо%' then 10 else 5 end);
  elsif p_node in ('n06', 'pLife', 'pOdd') then
    return (case
      when p_tag = 'pOdd' then '{"obs": -5}'
      when p_tag = 'pNone' or p_tag is null then '{}'
      when p_tag = 'pLife' then '{"obs": 3}'
      when p_tag = 'pAny' then '{"obs": 8}'
      else '{"obs": 15}' end)::jsonb;
  elsif p_node = 'n07' then
    n := case when a = '' then 0 else array_length(string_to_array(a, '; '), 1) end;
    return case when n = 0 then '{}'::jsonb else jsonb_build_object('fan', least(40, n * 5)) end;
  elsif p_node in ('n09', 'n11') then return '{"cur": 5}'::jsonb;
  elsif p_node = 's01' then return '{"res": 5}'::jsonb;
  elsif p_node = 's02' then return (case when length(a) >= 3 then '{"res": 10}' else '{}' end)::jsonb;
  elsif p_node = 'sOdd' then return (case when length(a) >= 3 then '{"res": 2}' else '{"res": -3}' end)::jsonb;
  elsif p_node = 's03' then return (case when a ilike '%пока нет%' then '{"res": 10, "grit": 5}' else '{"res": 10}' end)::jsonb;
  elsif p_node ~ '^s[A-Z][a-z]+$' then   -- ответ инженера на идею: «как исправить»
    return (case when length(a) >= 3 then '{"grit": 10}' else '{}' end)::jsonb;
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.episode_answer_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.deltas := public.hero_award(new.user_id, 'episode', 'ep:' || new.episode || ':' || new.node,
    public.episode_points(new.node, new.answer, new.via, new.tag), new.question, new.lesson_id);
  return new;
end;
$$;
drop trigger if exists episode_answer_award on public.episode_answers;
create trigger episode_answer_award before insert on public.episode_answers
  for each row execute function public.episode_answer_award();

-- ---------- Темы: сдал на проверку — Мастерство; тему подтвердили — ещё Мастерство и Упорство ----------
create or replace function public.lesson_progress_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    perform public.hero_award(new.user_id, 'lesson', 'sub:' || new.lesson_id, '{"craft": 20}', 'Работа отправлена на проверку', new.lesson_id);
  elsif new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.hero_award(new.user_id, 'lesson', 'appr:' || new.lesson_id, '{"craft": 10, "grit": 5}', 'Тема пройдена', new.lesson_id);
  end if;
  return new;
end;
$$;
drop trigger if exists lesson_progress_award on public.lesson_progress;
create trigger lesson_progress_award after insert or update of status on public.lesson_progress
  for each row execute function public.lesson_progress_award();

-- ---------- Исследование: заполнил таблицы или выводы — Исследование (раз за тему) ----------
create or replace function public.research_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(new.hypothesis, '') || coalesce(new.conclusion, '') || coalesce(new.result, '')) >= 10
     or (to_jsonb(new) ? 'data' and length(coalesce(to_jsonb(new)->>'data', '')) > 20) then
    perform public.hero_award(new.user_id, 'research', 'research:' || new.lesson_id, '{"res": 15}', 'Исследование', new.lesson_id);
  end if;
  return new;
end;
$$;
drop trigger if exists research_award on public.research_answers;
create trigger research_award after insert or update on public.research_answers
  for each row execute function public.research_award();

-- ---------- Вопрос в чате темы — Любопытство (раз в день на тему) ----------
create or replace function public.chat_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id = new.student_id then
    perform public.hero_award(new.student_id, 'chat', 'chat:' || new.lesson_id || ':' || to_char(now() at time zone 'Europe/Moscow', 'YYYY-MM-DD'),
      '{"cur": 3}', 'Вопрос в чате темы', new.lesson_id);
  end if;
  return new;
end;
$$;
drop trigger if exists chat_award on public.lesson_messages;
create trigger chat_award after insert on public.lesson_messages
  for each row execute function public.chat_award();
