-- Серия 5 «Предположение или факт?» (id ep6) — к Модулю 5 курса «Колесо» («Исследования и измерения»).
-- Откат — supabase/rollback/20261105000042_ep6_rollback.sql.
-- 1) очки за ответы в серии (episode_scores: серия, узел, tag — следующий узел → очки);
-- 2) задание модуля и таблица исследования (в тексте модуля задания нет): тяжёлая и лёгкая машинка, три попытки, среднее —
--    только если у Модуля 5 их ещё нет (правки из админки не затираются);
-- 3) темы встречи с преподавателем (lesson_content.meet) и заметки преподавателя (lesson_notes);
-- 4) lesson_content.video_url = 'episode:ep6' у Модуля 5.

-- ---------- 1. Очки ----------
delete from public.episode_scores where episode = 'ep6';
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep6', 'n01', 'n02a', '{"res": 10}', null), ('ep6', 'n01', '', '{"cur": 5}', null),
  ('ep6', 'n03', 'n04a', '{"cur": 10}', null), ('ep6', 'n03', '', '{"cur": 5}', null),
  ('ep6', 'n05', 'n06a', '{"res": 10}', null), ('ep6', 'n05', '', '{"cur": 5}', null),
  ('ep6', 'n07', 'n08a', '{"obs": 10}', null), ('ep6', 'n07', '', '{"cur": 5}', null),
  ('ep6', 'n09', 'n10a', '{"craft": 10}', null), ('ep6', 'n09', '', '{"cur": 5}', null),
  ('ep6', 'n11', 'n12a', '{"res": 10}', null), ('ep6', 'n11', '', '{"cur": 5}', null),
  ('ep6', 'n13', '', '{"cur": 5}', null),
  ('ep6', 'n15', '', '{"cur": 5}', null);

-- ---------- 2. Задание и таблица исследования ----------
update public.lessons l set
  research_task = coalesce(l.research_task, 'Тяжёлая и лёгкая машинка: какая проедет дальше с горки'),
  research_plan = coalesce(l.research_plan, $j${"tables":[
    {"title":"Сколько проехала машинка от горки","unit":"см","rows":["Тяжёлая машинка","Лёгкая машинка"],"cols":["Попытка 1","Попытка 2","Попытка 3"],"avg":true,"addRows":true}]}$j$::jsonb)
from public.modules m join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where m.id = l.module_id and l.title like 'Модуль 5.%';

-- ---------- 3. Встреча с преподавателем ----------
insert into public.lesson_content (lesson_id, meet)
select l.id, $t$Подтвердилось ли твоё предположение про машинки?
Зачем инженеру проверять идею, если он в ней уверен?
Почему опыт повторяют несколько раз?$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 5.%'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, $t$• Предположение ребёнка — ответ узла n13 в «Ответах в сериях» (тяжёлая / лёгкая / одинаково). Таблица с тремя попытками — в его исследовании. Обычно тяжёлая машинка с горки уезжает дальше: на неё меньше влияют трение и неровности пола. Но важнее не «угадал ли», а честно ли проведён опыт: один старт, одна горка, никто не толкает, три попытки.
• Зачем проверять, если уверен: уверенность — это ещё предположение. Пример из серии: Миша и Дима оба были уверены. Исторический пример — до Галилея считали, что тяжёлое падает быстрее. Инженеру ошибка дорого стоит: мост, машина, лифт.
• Почему несколько попыток: результат каждый раз немного разный (толчок, неровность, как поставили). Одна попытка может случайно оказаться лучше или хуже. Среднее «делит попытки поровну» и показывает, на что можно рассчитывать. Можно попросить ребёнка посчитать среднее своих трёх попыток вместе с вами.
• Этапы исследования (для преподавателя, детей не спрашиваем): задача и требования → что уже придумано → идеи → модель и прототип → испытания (в лаборатории, на полигоне) → анализ данных и доработка → документы. В серии это круг «идея → опыт → измерение → доработка».$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 5.%'
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();

-- ---------- 4. Серия 5 — к Модулю 5 ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep6' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 5.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
