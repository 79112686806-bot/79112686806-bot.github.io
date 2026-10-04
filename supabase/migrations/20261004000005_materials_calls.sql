-- Шаг 4б. Материалы тем и звонки с преподавателем.
--
-- Материалы открываются вместе с темой. Бывают:
--   file — файл в хранилище Supabase (бакет materials)
--   link — ссылка (например, запись занятия на Яндекс Диске)
-- user_id пустой — материал для всех учеников курса;
-- user_id заполнен — личный материал ученика (например, запись его занятия).
--
-- Звонки: ссылка на встречу (Яндекс Телемост) для конкретного ученика и темы.

create table public.materials (
  id           bigint generated always as identity primary key,
  lesson_id    bigint not null references public.lessons (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete cascade,
  title        text not null,
  kind         text not null check (kind in ('file', 'link')),
  storage_path text unique,
  url          text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url ~ '^https://'))
);

create index on public.materials (lesson_id);
create index on public.materials (user_id);

alter table public.materials enable row level security;

create policy "Материалы открытых тем"
  on public.materials for select to authenticated
  using (
    public.is_admin()
    or (
      (user_id is null or user_id = (select auth.uid()))
      and public.is_lesson_unlocked(lesson_id)
    )
  );

create policy "Материалы меняет админ"
  on public.materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Ссылки на занятия (Телемост) для ученика по теме
create table public.lesson_calls (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lesson_id  bigint not null references public.lessons (id) on delete cascade,
  url        text not null check (url ~ '^https://'),
  starts_at  timestamptz,
  note       text,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create trigger lesson_calls_updated_at
  before update on public.lesson_calls
  for each row execute function public.set_updated_at();

alter table public.lesson_calls enable row level security;

create policy "Свои звонки в открытых темах или админ"
  on public.lesson_calls for select to authenticated
  using (public.is_admin() or (user_id = (select auth.uid()) and public.is_lesson_unlocked(lesson_id)));

create policy "Звонки назначает админ"
  on public.lesson_calls for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Старое поле для списка материалов больше не нужно — теперь отдельная таблица
alter table public.lesson_content drop column materials;

-- ---------- Хранилище файлов материалов ----------
-- Закрытый бакет, файлы до 50 МБ. Скачать файл можно, только если
-- соответствующий материал виден пользователю (те же правила, что у таблицы).
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 52428800)
on conflict (id) do nothing;

create policy "Скачать файл материала открытой темы"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.is_admin()
      or exists (
        select 1 from public.materials m
        where m.storage_path = storage.objects.name
          and (m.user_id is null or m.user_id = (select auth.uid()))
          and public.is_lesson_unlocked(m.lesson_id)
      )
    )
  );

create policy "Файлы материалов загружает админ"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_admin());

create policy "Файлы материалов меняет админ"
  on storage.objects for update to authenticated
  using (bucket_id = 'materials' and public.is_admin());

create policy "Файлы материалов удаляет админ"
  on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_admin());
