-- Откат 20261103000041_ep5.sql: серия ep5 («Серия 4. Колёса будущего») отключается от Модуля 4, её очки, темы встречи и заметки Модуля 4 удаляются.
update public.lesson_content set video_url = null where video_url = 'episode:ep5';
update public.lesson_content lc set meet = null
from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where lc.lesson_id = l.id and l.title like 'Модуль 4.%';
delete from public.lesson_notes n using public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where n.lesson_id = l.id and l.title like 'Модуль 4.%';
delete from public.episode_scores where episode = 'ep5';
