-- Откат 20261108000047: прежнее правило — скачать можно только сам файл материала.
drop policy if exists "Скачать файл материала открытой темы" on storage.objects;
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
