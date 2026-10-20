-- Интерактивные мультфильмы в занятиях («серии»).
-- Ролики серии лежат в закрытом бакете episodes: <серия>/<узел>.mp4 (например ep1/n01.mp4).
-- К занятию серия подключается через lesson_content.video_url = 'episode:<серия>' —
-- кабинет показывает обложку серии на месте видео, а встречу с преподавателем — на обороте карточки.
-- Скачать ролик можно, только если занятие с этой серией у ученика открыто. Повторный запуск безопасен.

insert into storage.buckets (id, name, public, file_size_limit)
values ('episodes', 'episodes', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "Ролики серии открытого занятия" on storage.objects;
create policy "Ролики серии открытого занятия"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'episodes'
    and (
      public.is_admin()
      or exists (
        select 1 from public.lesson_content lc
        where lc.video_url = 'episode:' || split_part(storage.objects.name, '/', 1)
          and public.is_lesson_unlocked(lc.lesson_id)
      )
    )
  );

drop policy if exists "Ролики серий загружает админ" on storage.objects;
create policy "Ролики серий загружает админ"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'episodes' and public.is_admin());

drop policy if exists "Ролики серий меняет админ" on storage.objects;
create policy "Ролики серий меняет админ"
  on storage.objects for update to authenticated
  using (bucket_id = 'episodes' and public.is_admin());

drop policy if exists "Ролики серий удаляет админ" on storage.objects;
create policy "Ролики серий удаляет админ"
  on storage.objects for delete to authenticated
  using (bucket_id = 'episodes' and public.is_admin());

-- Курс «Колесо», Вводное занятие (модуль 1, тема 1) — серия 1 «Как мыслит инженер»
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep1'
from public.courses c
join public.modules m on m.course_id = c.id and m.sort = 1
join public.lessons l on l.module_id = m.id and l.sort = 1
where c.slug = 'wheel'
on conflict (lesson_id) do update set video_url = excluded.video_url;
