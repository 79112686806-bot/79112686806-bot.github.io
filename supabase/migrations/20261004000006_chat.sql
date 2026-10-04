-- Шаг 4в. Чат в каждой теме: личная переписка ученика с преподавателем.
-- Переписка (тред) = ученик + тема. Писать могут сам ученик (в открытой теме) и админ.
-- Вложения (фото, видео, файлы до 50 МБ) — в закрытом бакете chat,
-- путь файла: <id ученика>/<id темы>/<имя файла>.

create table public.lesson_messages (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  lesson_id   bigint not null references public.lessons (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null default '' check (length(body) <= 4000),
  attachments jsonb not null default '[]'::jsonb,  -- [{"path","name","type","size"}]
  created_at  timestamptz not null default now(),
  check (length(trim(body)) > 0 or jsonb_array_length(attachments) > 0)
);

create index on public.lesson_messages (student_id, lesson_id, created_at);
create index on public.lesson_messages (created_at desc);

alter table public.lesson_messages enable row level security;

create policy "Своя переписка в открытых темах или админ"
  on public.lesson_messages for select to authenticated
  using (
    public.is_admin()
    or (student_id = (select auth.uid()) and public.is_lesson_unlocked(lesson_id))
  );

create policy "Писать в свою переписку или админ"
  on public.lesson_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      public.is_admin()
      or (student_id = (select auth.uid()) and public.is_lesson_unlocked(lesson_id))
    )
  );

-- Новые сообщения приходят на сайт сразу (Supabase Realtime, с учётом правил выше)
alter publication supabase_realtime add table public.lesson_messages;

-- ---------- Вложения чата ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 52428800)
on conflict (id) do nothing;

create policy "Вложения своей переписки или админ"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat'
    and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text)
  );

create policy "Загрузка вложений в свою переписку или админ"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and public.is_lesson_unlocked(
          case when (storage.foldername(name))[2] ~ '^[0-9]+$'
               then ((storage.foldername(name))[2])::bigint end
        )
      )
    )
  );

create policy "Вложения чата удаляет админ"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and public.is_admin());
