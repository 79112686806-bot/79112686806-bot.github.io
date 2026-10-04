-- Ученик сам заполняет свои данные; чат как в мессенджерах:
-- ответы, редактирование, удаление, отметки о прочтении.

-- ---------- Профиль: ученик меняет свои имя/контакты ----------
-- Менять через API можно только эти три поля (роль — только через SQL Editor).
revoke update on public.profiles from authenticated;
grant update (student_name, parent_name, contact) on public.profiles to authenticated;

alter table public.profiles
  add constraint profiles_lengths check (
    coalesce(length(student_name), 0) <= 100
    and coalesce(length(parent_name), 0) <= 100
    and coalesce(length(contact), 0) <= 200
  );

create policy "Ученик меняет свой профиль"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------- Чат: ответы, правки, удаление, прочтение ----------
alter table public.lesson_messages
  add column reply_to  bigint references public.lesson_messages (id) on delete set null,
  add column edited_at timestamptz,
  add column deleted_at timestamptz,
  add column read_at   timestamptz;

-- Удалённое сообщение остаётся в переписке как «Сообщение удалено» (пустое)
alter table public.lesson_messages drop constraint lesson_messages_check;
alter table public.lesson_messages add constraint lesson_messages_not_empty
  check (deleted_at is not null or length(trim(body)) > 0 or jsonb_array_length(attachments) > 0);

-- Через API у сообщения можно менять только текст и отметку удаления
revoke update on public.lesson_messages from authenticated;
grant update (body, deleted_at) on public.lesson_messages to authenticated;

-- Редактировать — только автор; удалять — автор или админ
create policy "Автор правит своё сообщение, админ может удалить"
  on public.lesson_messages for update to authenticated
  using (
    author_id = (select auth.uid())
    and (public.is_admin() or public.is_lesson_unlocked(lesson_id))
    or public.is_admin()
  )
  with check (true);

create or replace function public.lesson_messages_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null
     and (new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'Сообщение уже удалено';
  end if;
  if new.body is distinct from old.body then
    if old.author_id is distinct from (select auth.uid()) then
      raise exception 'Редактировать можно только свои сообщения';
    end if;
    new.edited_at := now();
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_at := now();
    new.body := '';
    new.attachments := '[]'::jsonb;
  end if;
  return new;
end;
$$;

create trigger lesson_messages_before_update
  before update on public.lesson_messages
  for each row execute function public.lesson_messages_before_update();

-- Отметить переписку прочитанной: ученик — ответы преподавателя, админ — сообщения ученика
create or replace function public.mark_thread_read(p_student_id uuid, p_lesson_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) = p_student_id then
    update public.lesson_messages set read_at = now()
    where student_id = p_student_id and lesson_id = p_lesson_id
      and author_id <> p_student_id and read_at is null;
  elsif public.is_admin() then
    update public.lesson_messages set read_at = now()
    where student_id = p_student_id and lesson_id = p_lesson_id
      and author_id = p_student_id and read_at is null;
  end if;
end;
$$;

revoke execute on function public.mark_thread_read(uuid, bigint) from public, anon;
grant execute on function public.mark_thread_read(uuid, bigint) to authenticated;
