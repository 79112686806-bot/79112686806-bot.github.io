-- Серия 6 «Хорошая вещь — какая она?» (id ep7) — к Модулю 6 курса «Колесо» («Что должен учитывать инженер-конструктор»).
-- Откат — supabase/rollback/20261106000043_ep7_rollback.sql.
-- 1) очки за ответы в серии (episode_scores: серия, узел, tag — следующий узел → очки);
-- 2) темы встречи с преподавателем (lesson_content.meet) и заметки преподавателя (lesson_notes);
-- 3) lesson_content.video_url = 'episode:ep7' у Модуля 6.
-- Задание модуля (марка автомобиля) и таблица исследования «Удары до поломки» уже есть в Модуле 6 — не меняем.

-- ---------- 1. Очки ----------
delete from public.episode_scores where episode = 'ep7';
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep7', 'n01', 'n02a', '{"obs": 10}', null), ('ep7', 'n01', '', '{"cur": 5}', null),
  ('ep7', 'n03', 'n04a', '{"res": 10}', null), ('ep7', 'n03', '', '{"cur": 5}', null),
  ('ep7', 'n05', 'n06a', '{"obs": 10}', null), ('ep7', 'n05', '', '{"cur": 5}', null),
  ('ep7', 'n07', 'n08a', '{"res": 10}', null), ('ep7', 'n07', '', '{"cur": 5}', null),
  ('ep7', 'n09', 'n10a', '{"fan": 10}', null), ('ep7', 'n09', '', '{"cur": 5}', null),
  ('ep7', 'n11', 'n12a', '{"craft": 10}', null), ('ep7', 'n11', '', '{"cur": 5}', null),
  ('ep7', 'n13', '', '{"cur": 5}', null),
  ('ep7', 'n15', '', '{"cur": 5}', null);

-- ---------- 2. Встреча с преподавателем ----------
insert into public.lesson_content (lesson_id, meet)
select l.id, $t$Какую марку автомобиля ты выбрал и купил бы её? Почему?
Какое крепление колёс выдержало больше всего ударов и почему?
Какое требование самое главное для детского самоката?$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 6.%'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, $t$• Семь требований из серии: функционал, надёжность, безопасность, удобство, дизайн, стоимость, психология покупателя. Попросите ребёнка оценить выбранную машину хотя бы по четырём из задания (надёжность, безопасность, стоимость, дизайн) и объяснить, почему купил бы или нет. Хорошо, если ребёнок замечает, что одно требование «спорит» с другим (надёжнее — тяжелее и дороже).
• Опыт на надёжность (таблица «Удары до поломки»): обычно пластилин сдаётся за несколько ударов, скотч держит дольше, термоклей — дольше всех (если клеили со взрослым и дали остыть). Важно не «кто победил», а одинаковые условия: одна горка, одна стенка, считаем каждый удар, записываем, что именно сломалось. Предположение ребёнка — ответ узла n13 в «Ответах в сериях».
• Самокат: споры полезны — безопасность (тормоз, руль, нет острых краёв), надёжность (крепление колёс, складной механизм), удобство (вес, высота руля). Пусть ребёнок выберет главное и объяснит, чем пожертвует ради него — это и есть поиск баланса.
• Факты серии: ремень безопасности Volvo (1959, инженер Нильс Болин) — фирма открыла изобретение для всех; Генри Форд и модель Т — «любой цвет, если он чёрный»; краш-тесты с манекенами.$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 6.%'
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();

-- ---------- 3. Серия 6 — к Модулю 6 ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep7' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 6.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
