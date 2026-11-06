-- Откат 20261108000046_ep8.sql: серия ep8 («Серия 7. Как устроен автомобиль») отключается от Модуля 7, её очки, темы встречи и заметки Модуля 7 удаляются.
update public.lesson_content set video_url = null where video_url = 'episode:ep8';
update public.lesson_content lc set meet = null
from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where lc.lesson_id = l.id and l.title like 'Модуль 7.%';
delete from public.lesson_notes n using public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where n.lesson_id = l.id and l.title like 'Модуль 7.%';
delete from public.episode_scores where episode = 'ep8';
