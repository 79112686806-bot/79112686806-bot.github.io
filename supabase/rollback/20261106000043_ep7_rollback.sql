-- Откат 20261106000043_ep7.sql: серия ep7 («Серия 6. Хорошая вещь — какая она?») отключается от Модуля 6, её очки, темы встречи и заметки Модуля 6 удаляются.
update public.lesson_content set video_url = null where video_url = 'episode:ep7';
update public.lesson_content lc set meet = null
from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where lc.lesson_id = l.id and l.title like 'Модуль 6.%';
delete from public.lesson_notes n using public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where n.lesson_id = l.id and l.title like 'Модуль 6.%';
delete from public.episode_scores where episode = 'ep7';
