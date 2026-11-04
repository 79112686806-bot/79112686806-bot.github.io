-- Серия 4 «Колёса будущего» (id ep5) — к Модулю 4 курса «Колесо» («Перспективные идеи развития колеса»).
-- Откат — supabase/rollback/20261103000041_ep5_rollback.sql.
-- 1) очки за ответы в серии (episode_scores: серия, узел, tag — следующий узел → очки; per_item — за каждую идею штурма);
-- 2) темы встречи с преподавателем (lesson_content.meet) — вопросы 7–9 модуля — и заметки преподавателя (lesson_notes);
-- 3) lesson_content.video_url = 'episode:ep5' у Модуля 4.

-- ---------- 1. Очки ----------
delete from public.episode_scores where episode = 'ep5';
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep5', 'n01', 'n02a', '{"obs": 10}', null), ('ep5', 'n01', '', '{"cur": 5}', null),
  ('ep5', 'n03', 'n04a', '{"fan": 10}', null), ('ep5', 'n03', '', '{"cur": 5}', null),
  ('ep5', 'n05', 'n06a', '{"craft": 10}', null), ('ep5', 'n05', '', '{"cur": 5}', null),
  ('ep5', 'n07', 'n08a', '{"obs": 10}', null), ('ep5', 'n07', '', '{"cur": 5}', null),
  ('ep5', 'n09', 'n10a', '{"fan": 10}', null), ('ep5', 'n09', '', '{"cur": 5}', null),
  ('ep5', 'n11', 'n12a', '{"craft": 10}', null), ('ep5', 'n11', '', '{"cur": 5}', null),
  ('ep5', 'n13', '', '{}', 'fan'),
  ('ep5', 'n15', '', '{"cur": 5}', null);

-- ---------- 2. Встреча с преподавателем ----------
insert into public.lesson_content (lesson_id, meet)
select l.id, $t$Раньше в автомобильных шинах были камеры. Почему перешли на бескамерные шины?
Что будет, если вместо воздуха залить в колесо воду?
Что такое принцип ячейки в колесе?$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 4.%'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, $t$• Камеры: камера — отдельная резиновая трубка внутри шины. При проколе она рвётся, и воздух уходит сразу — колесо мгновенно спускает, опасно на скорости. Бескамерная шина плотно прилегает к диску: при проколе воздух выходит медленно (гвоздь часто сам затыкает дырку), можно доехать. Меньше деталей и веса, меньше нагрев от трения камеры о шину, проще ремонт.
• Вода вместо воздуха: вода почти не сжимается — колесо станет жёстким и перестанет смягчать удары (тряска, нагрузка на подвеску). Оно станет очень тяжёлым — хуже разгон и торможение. Зимой вода замёрзнет, расширится и может разорвать шину. Интересно: у тракторов задние шины иногда частично заливают незамерзающей жидкостью — для веса и сцепления с землёй.
• Принцип ячейки: колесо или шина собраны из множества одинаковых ячеек, как пчелиные соты. Каждая ячейка гнётся сама по себе и делит нагрузку с соседними, поэтому конструкция лёгкая и прочная, а повреждение одной ячейки не выводит колесо из строя. Так устроены безвоздушные шины (в серии — «гибкие спицы»).
• Задание модуля — колесо для крутых и отвесных склонов: в серии ребёнок накидал идеи (ответ узла n13 в «Ответах в сериях»). Подсказки, если застрял: присоски, шипы и грунтозацепы, гусеницы, магниты (для железной стены), колёса-лапы, лебёдка.$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 4.%'
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();

-- ---------- 3. Серия 4 — к Модулю 4 ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep5' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 4.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
