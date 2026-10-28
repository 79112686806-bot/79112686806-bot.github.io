-- Откат 20261027000031_ep3.sql: серия 3 отключается от Модуля 2, её очки, тема встречи и заметки Модуля 2 удаляются.
update public.lesson_content set video_url = null where video_url = 'episode:ep3';
update public.lesson_content lc set meet = null
from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where lc.lesson_id = l.id and l.title like 'Модуль 2.%';
delete from public.lesson_notes n using public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where n.lesson_id = l.id and l.title like 'Модуль 2.%';
delete from public.episode_scores where episode = 'ep3';
