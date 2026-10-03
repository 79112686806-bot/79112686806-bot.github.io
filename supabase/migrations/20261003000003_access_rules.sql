-- Шаг 2. Правила доступа (RLS) и функции подтверждения тем.
--
-- Кто что может:
--   гость        — каталог курсов, программы доступных курсов, отправить заявку
--   ученик       — свой профиль, свои записи на курсы, свой прогресс,
--                  видео/материалы только открытых тем, свои ответы на исследования
--   администратор — всё
--
-- Тема открыта ученику, если он записан на курс (active/finished) и все
-- предыдущие темы курса подтверждены администратором (первая открыта сразу).

-- ---------- Вспомогательные функции ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_lesson_unlocked(p_lesson_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select l.id, m.course_id, m.sort as module_sort, l.sort as lesson_sort
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = p_lesson_id
  )
  select
    exists (
      select 1 from public.enrollments e, cur
      where e.user_id = (select auth.uid())
        and e.course_id = cur.course_id
        and e.status in ('active', 'finished')
    )
    -- нет ни одной предыдущей темы без подтверждения
    and not exists (
      select 1
      from cur
      join public.modules m2 on m2.course_id = cur.course_id
      join public.lessons l2 on l2.module_id = m2.id
      where (m2.sort, l2.sort) < (cur.module_sort, cur.lesson_sort)
        and not exists (
          select 1 from public.lesson_progress p
          where p.user_id = (select auth.uid())
            and p.lesson_id = l2.id
            and p.status = 'approved'
        )
    );
$$;

-- ---------- Политики ----------

-- profiles: ученик видит только себя; менять профили (и роль) может только админ
create policy "Свой профиль или админ"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "Профили меняет админ"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- courses: чтение уже открыто всем (миграция 2), изменения — админ
create policy "Курсы меняет админ"
  on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- modules / lessons: программа видна, если курс не в разработке; админ видит всё
create policy "Модули доступных курсов видны всем"
  on public.modules for select to anon, authenticated
  using (
    exists (select 1 from public.courses c where c.id = course_id and c.status <> 'draft')
    or public.is_admin()
  );

create policy "Модули меняет админ"
  on public.modules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Темы доступных курсов видны всем"
  on public.lessons for select to anon, authenticated
  using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.status <> 'draft'
    )
    or public.is_admin()
  );

create policy "Темы меняет админ"
  on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- lesson_content: только открытые темы
create policy "Содержимое открытых тем"
  on public.lesson_content for select to authenticated
  using (public.is_lesson_unlocked(lesson_id) or public.is_admin());

create policy "Содержимое меняет админ"
  on public.lesson_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- enrollments: ученик видит свои; создаёт и меняет админ (и позже — оплата)
create policy "Свои записи на курсы или админ"
  on public.enrollments for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "Записи на курсы меняет админ"
  on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- lesson_progress: ученик только читает своё; пишут функции ниже
create policy "Свой прогресс или админ"
  on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- research_answers: ученик пишет свои ответы только в открытых темах
create policy "Свои ответы или админ"
  on public.research_answers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "Ученик добавляет свои ответы"
  on public.research_answers for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_lesson_unlocked(lesson_id));

create policy "Ученик меняет свои ответы"
  on public.research_answers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_lesson_unlocked(lesson_id));

-- leads: отправить заявку может любой, читает и обрабатывает админ
create policy "Любой может оставить заявку"
  on public.leads for insert to anon, authenticated
  with check (status = 'new' and length(trim(contact)) between 3 and 200);

create policy "Заявки видит админ"
  on public.leads for select to authenticated
  using (public.is_admin());

create policy "Заявки меняет админ"
  on public.leads for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Подтверждение тем ----------

-- Ученик: «Отправить тему на проверку»
create or replace function public.submit_lesson(p_lesson_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Нужно войти в кабинет';
  end if;
  if not public.is_lesson_unlocked(p_lesson_id) then
    raise exception 'Тема ещё не открыта';
  end if;

  insert into public.lesson_progress (user_id, lesson_id, status, submitted_at)
  values ((select auth.uid()), p_lesson_id, 'submitted', now())
  on conflict (user_id, lesson_id) do update
    set status = 'submitted', submitted_at = now()
    where public.lesson_progress.status <> 'approved';
end;
$$;

-- Администратор: подтвердить тему (открывает её материалы и следующую тему)
create or replace function public.approve_lesson(p_user_id uuid, p_lesson_id bigint, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Только для администратора';
  end if;
  if not exists (
    select 1 from public.enrollments e
    join public.modules m on m.course_id = e.course_id
    join public.lessons l on l.module_id = m.id
    where e.user_id = p_user_id and l.id = p_lesson_id
  ) then
    raise exception 'Ученик не записан на курс этой темы';
  end if;

  insert into public.lesson_progress (user_id, lesson_id, status, approved_at, approved_by, teacher_comment)
  values (p_user_id, p_lesson_id, 'approved', now(), (select auth.uid()), p_comment)
  on conflict (user_id, lesson_id) do update
    set status = 'approved',
        approved_at = now(),
        approved_by = (select auth.uid()),
        teacher_comment = coalesce(excluded.teacher_comment, public.lesson_progress.teacher_comment);
end;
$$;

-- Администратор: отменить подтверждение (тема снова «на проверке»)
create or replace function public.revoke_lesson(p_user_id uuid, p_lesson_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Только для администратора';
  end if;

  update public.lesson_progress
    set status = 'submitted', approved_at = null, approved_by = null
    where user_id = p_user_id and lesson_id = p_lesson_id;
end;
$$;

-- is_admin() нужна и гостям: её вызывают политики каталога (для гостя вернёт false).
-- Остальные функции — только вошедшим пользователям.
grant execute on function public.is_admin() to anon;
revoke execute on function public.is_lesson_unlocked(bigint) from public, anon;
revoke execute on function public.submit_lesson(bigint) from public, anon;
revoke execute on function public.approve_lesson(uuid, bigint, text) from public, anon;
revoke execute on function public.revoke_lesson(uuid, bigint) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_lesson_unlocked(bigint) to authenticated;
grant execute on function public.submit_lesson(bigint) to authenticated;
grant execute on function public.approve_lesson(uuid, bigint, text) to authenticated;
grant execute on function public.revoke_lesson(uuid, bigint) to authenticated;
