-- Статус курса: что можно купить, а что ещё в разработке.
--   draft     — в разработке: виден в каталоге, купить нельзя
--   available — открыт для покупки
--   closed    — продажи закрыты, у записанных учеников доступ остаётся
alter table public.courses
  add column status text not null default 'draft'
  check (status in ('draft', 'available', 'closed'));

update public.courses set status = 'available' where slug = 'wheel';

-- Записать ученика можно только на курс со статусом available —
-- проверка в базе, чтобы её нельзя было обойти ни с сайта, ни из оплаты.
create or replace function public.check_enrollment_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select status from public.courses where id = new.course_id) is distinct from 'available' then
    raise exception 'Курс недоступен для записи' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enrollments_check_course
  before insert or update of course_id on public.enrollments
  for each row execute function public.check_enrollment_course();

-- Каталог (названия, описания, статусы) открыт всем — нужен сайту
create policy "Каталог курсов виден всем"
  on public.courses for select
  to anon, authenticated
  using (true);
