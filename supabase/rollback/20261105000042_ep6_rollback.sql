-- Откат 20261105000042_ep6.sql: серия ep6 («Серия 5. Предположение или факт?») отключается от Модуля 5, её очки, темы встречи и заметки Модуля 5 удаляются;
-- задание и таблица исследования, которые поставила миграция, снимаются (если задание не меняли в админке).
update public.lesson_content set video_url = null where video_url = 'episode:ep6';
update public.lesson_content lc set meet = null
from public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where lc.lesson_id = l.id and l.title like 'Модуль 5.%';
delete from public.lesson_notes n using public.lessons l join public.modules m on m.id = l.module_id join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where n.lesson_id = l.id and l.title like 'Модуль 5.%';
update public.lessons l set research_task = null, research_plan = null
from public.modules m join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where m.id = l.module_id and l.title like 'Модуль 5.%' and l.research_task = 'Тяжёлая и лёгкая машинка: какая проедет дальше с горки';
delete from public.episode_scores where episode = 'ep6';
