-- Серия 4 «Большие и маленькие, узкие и широкие» — к Модулю 3 курса «Колесо».
-- Откат — supabase/rollback/20261102000039_ep4_rollback.sql.
-- 1) очки за ответы в серии (episode_scores: серия, узел, tag — следующий узел → очки);
-- 2) темы встречи с преподавателем (lesson_content.meet) и заметки преподавателя (lesson_notes) для Модуля 3;
-- 3) lesson_content.video_url = 'episode:ep4' у Модуля 3.

-- ---------- 1. Очки ----------
delete from public.episode_scores where episode = 'ep4';
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep4', 'n01', 'n02a', '{"obs": 10}', null), ('ep4', 'n01', '', '{"cur": 5}', null),
  ('ep4', 'n03', 'n04a', '{"obs": 10}', null), ('ep4', 'n03', '', '{"cur": 5}', null),
  ('ep4', 'n05', 'n06a', '{"craft": 10}', null), ('ep4', 'n05', '', '{"fan": 5}', null),
  ('ep4', 'n07', 'n08a', '{"obs": 10}', null), ('ep4', 'n07', 'n08b', '{"fan": 5}', null), ('ep4', 'n07', '', '{"cur": 5}', null),
  ('ep4', 'n09', 'n10a', '{"craft": 10}', null), ('ep4', 'n09', '', '{"cur": 5}', null),
  ('ep4', 'n11', 'n12a', '{"craft": 10}', null), ('ep4', 'n11', '', '{"fan": 5}', null),
  ('ep4', 'n13', '', '{"res": 10}', null),
  ('ep4', 'n15', '', '{"cur": 5}', null);

-- ---------- 2. Встреча с преподавателем ----------
insert into public.lesson_content (lesson_id, meet)
select l.id, $t$Почему у гоночных машин на сухой трассе совсем гладкие шины?
Почему у трактора огромные задние колёса?
Почему у гоночного велосипеда шины узкие, а у горного — широкие?$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 3.%'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, $t$• Слики: на сухом асфальте без рисунка пятно контакта максимальное — лучше сцепление в поворотах и при торможении. Канавки нужны только для воды; в дождь ставят шины с глубоким рисунком, иначе аквапланирование.
• Трактор: большие задние колёса — высокий клиренс над бороздами и кочками, большое пятно контакта не даёт проваливаться в мягкую землю, крупные грунтозацепы тянут тяжёлый плуг. Передние маленькие — легче поворачивать.
• Велосипед: узкая шина шоссейника — меньше трение качения и вес, быстрее по ровному асфальту. Широкая шина горного — больше пятно контакта и сцепление на грязи, камнях и корнях, мягче ход, меньше проваливается.$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 3.%'
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();

-- ---------- 3. Серия 4 — к Модулю 3 ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep4' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 3.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
