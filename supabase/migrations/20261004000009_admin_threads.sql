-- Шаг 5б. Переписки для админ-панели: последнее сообщение и число
-- непрочитанных сообщений ученика по каждой паре «ученик + тема».
-- p_student_id — только переписки одного ученика (для его карточки).

create or replace function public.admin_threads(p_student_id uuid default null)
returns table (
  student_id        uuid,
  lesson_id         bigint,
  lesson_title      text,
  course_id         bigint,
  last_at           timestamptz,
  last_body         text,
  last_has_files    boolean,
  last_deleted      boolean,
  last_from_student boolean,
  unread            integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Только для администратора';
  end if;

  return query
  select
    t.student_id,
    t.lesson_id,
    l.title,
    m.course_id,
    last.created_at,
    last.body,
    jsonb_array_length(last.attachments) > 0,
    last.deleted_at is not null,
    last.author_id = t.student_id,
    (select count(*)::integer from public.lesson_messages u
      where u.student_id = t.student_id and u.lesson_id = t.lesson_id
        and u.author_id = t.student_id and u.read_at is null and u.deleted_at is null)
  from (
    select distinct lm.student_id, lm.lesson_id
    from public.lesson_messages lm
    where p_student_id is null or lm.student_id = p_student_id
  ) t
  join public.lessons l on l.id = t.lesson_id
  join public.modules m on m.id = l.module_id
  cross join lateral (
    select x.created_at, x.body, x.attachments, x.deleted_at, x.author_id
    from public.lesson_messages x
    where x.student_id = t.student_id and x.lesson_id = t.lesson_id
    order by x.created_at desc
    limit 1
  ) last
  order by last.created_at desc;
end;
$$;

revoke execute on function public.admin_threads(uuid) from public, anon;
grant execute on function public.admin_threads(uuid) to authenticated;
