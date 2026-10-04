-- Шаг 5а. Список учеников для админ-панели.
-- Email хранится в закрытой схеме auth, поэтому список отдаёт функция,
-- и только администратору.

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
