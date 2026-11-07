-- Материалы для телефона: рядом с PDF темы лежит его вариант под узкий экран — <файл>.m.pdf
-- (крупный текст, одна колонка; загружает scripts/upload-materials-mobile.mjs). На телефоне сайт открывает его,
-- если он есть, иначе — обычный PDF. Скачать вариант можно тем же, кому открыт основной файл.
-- Откат — supabase/rollback/20261108000047_materials_mobile_rollback.sql.

drop policy if exists "Скачать файл материала открытой темы" on storage.objects;
create policy "Скачать файл материала открытой темы"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.is_admin()
      or exists (
        select 1 from public.materials m
        where (m.storage_path = storage.objects.name
               or (storage.objects.name like '%.m.pdf'
                   and m.storage_path = left(storage.objects.name, length(storage.objects.name) - 6) || '.pdf'))
          and (m.user_id is null or m.user_id = (select auth.uid()))
          and public.is_lesson_unlocked(m.lesson_id)
      )
    )
  );
