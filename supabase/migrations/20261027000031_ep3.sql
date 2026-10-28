-- Серия 3 «Трение, скольжение, качение» — к Модулю 2 курса «Колесо».
-- Откат — supabase/rollback/20261027000031_ep3_rollback.sql.
-- 1) очки за ответы в серии (episode_scores: серия, узел, tag — следующий узел → очки);
-- 2) темы встречи с преподавателем (lesson_content.meet) и заметки преподавателя (lesson_notes) для Модуля 2;
-- 3) lesson_content.video_url = 'episode:ep3' у Модуля 2.

-- ---------- 1. Очки ----------
delete from public.episode_scores where episode = 'ep3';
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep3', 'n01', 'n02a', '{"obs": 10}', null), ('ep3', 'n01', '', '{"cur": 5}', null),
  ('ep3', 'n03', 'n04a', '{"obs": 5}', null), ('ep3', 'n03', '', '{"cur": 5}', null),
  ('ep3', 'n05', 'n06a', '{"obs": 10}', null), ('ep3', 'n05', '', '{"cur": 5}', null),
  ('ep3', 'n07', 'n08a', '{"obs": 10}', null), ('ep3', 'n07', '', '{"obs": 5}', null),
  ('ep3', 'n09', '', '{}', 'fan'),
  ('ep3', 'n11', 'n12a', '{"craft": 10}', null), ('ep3', 'n11', '', '{"fan": 5}', null),
  ('ep3', 'n13', '', '{"res": 10}', null),
  ('ep3', 'n15', '', '{"cur": 5}', null);

-- ---------- 2. Встреча с преподавателем ----------
insert into public.lesson_content (lesson_id, meet)
select l.id, $t$Почему опасно, когда левые колёса машины на асфальте, а правые — на гравии или на льду?
Почему зимой дороги и тротуары посыпают песком?
Почему у гоночных машин в сухую погоду бывают совсем гладкие шины?$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 2.%'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, $t$• Разные поверхности под левыми и правыми колёсами: сцепление разное. При торможении колёса на льду проскальзывают, а на асфальте держат — машину разворачивает в сторону асфальта (занос), тормозной путь становится непредсказуемым.
• Песок делает лёд шероховатым: бугорки песчинок цепляются за подошву и шину, трение растёт.
• Гладкие шины (слики): на сухом асфальте у них больше площадь касания дороги — больше сцепления. Рисунок протектора нужен, чтобы отводить воду; в дождь слики опасны (аквапланирование), поэтому на мокрую трассу ставят шины с рисунком.$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 2.%'
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();

-- ---------- 3. Серия 3 — к Модулю 2 ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep3' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 2.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
