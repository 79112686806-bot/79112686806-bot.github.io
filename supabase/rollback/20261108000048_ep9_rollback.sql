-- Откат 20261108000048_ep9.sql: серия ep9 («Серия 8. Мой автомобиль») отключается от Модуля 8, её очки, темы встречи и заметки Модуля 8 удаляются.
update public.lesson_content set video_url = null where video_url = 'episode:ep9';
update public.lesson_content lc set meet = null
from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where lc.lesson_id = l.id and l.title like 'Модуль 8.%';
delete from public.lesson_notes n using public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where n.lesson_id = l.id and l.title like 'Модуль 8.%';
delete from public.episode_scores where episode = 'ep9';
