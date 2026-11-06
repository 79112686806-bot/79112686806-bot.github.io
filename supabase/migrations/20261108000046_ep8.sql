-- Серия 7 «Как устроен автомобиль» (id ep8) — к Модулю 7 курса «Колесо» («Автомобиль»).
-- Откат — supabase/rollback/20261108000046_ep8_rollback.sql.
-- 1) очки за ответы в серии (episode_scores: серия, узел, tag — следующий узел → очки);
-- 2) темы встречи с преподавателем (lesson_content.meet) и заметки преподавателя (lesson_notes);
-- 3) lesson_content.video_url = 'episode:ep8' у Модуля 7.
-- Задание модуля (узнать и рассказать принцип действия ДВС) уже есть в тексте Модуля 7 — не меняем. Исследования (таблицы) в модуле нет.

-- ---------- 1. Очки ----------
delete from public.episode_scores where episode = 'ep8';
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep8', 'n01', 'n02a', '{"obs": 10}', null), ('ep8', 'n01', 'n02b', '{"obs": 5}', null), ('ep8', 'n01', '', '{"cur": 5}', null),
  ('ep8', 'n03', 'n04a', '{"res": 10}', null), ('ep8', 'n03', '', '{"cur": 5}', null),
  ('ep8', 'n05', 'n06a', '{"obs": 10}', null), ('ep8', 'n05', '', '{"cur": 5}', null),
  ('ep8', 'n07', 'n08a', '{"craft": 10}', null), ('ep8', 'n07', '', '{"cur": 5}', null),
  ('ep8', 'n09', 'n10a', '{"res": 10}', null), ('ep8', 'n09', '', '{"cur": 5}', null),
  ('ep8', 'n11', 'n12a', '{"fan": 10}', null), ('ep8', 'n11', 'n12b', '{"fan": 10}', null), ('ep8', 'n11', '', '{"cur": 5}', null),
  ('ep8', 'n13', '', '{"cur": 5}', null);

-- ---------- 2. Встреча с преподавателем ----------
insert into public.lesson_content (lesson_id, meet)
select l.id, $t$Как работает двигатель внутреннего сгорания? Расскажи своими словами.
Почему в 1970-х годах стали отказываться от больших автомобилей (особенно в США)?
Почему сейчас стали мало выпускать маленьких автомобилей?
Почему люди выбирают ту или иную машину?
Какой будет машина будущего? Расскажи свою идею.$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 7.%'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, $t$• Определение (ответ узла n01 в «Ответах в сериях»): транспорт с мотором, ездит по дорогам без рельсов, возит людей или грузы, обычно не меньше четырёх колёс, автономный. Сравните с тем, что сказал ребёнок: какие признаки назвал, что упустил. Чем точнее определение, тем понятнее задача.
• Двигатель (задание модуля): четыре такта — впуск (бензин с воздухом), сжатие, вспышка от свечи зажигания (поршень толкает вниз), выпуск. Поршень через шатун крутит коленчатый вал. Пусть ребёнок расскажет сам, можно с рисунком; хорошо, если упомянет искру и то, что всё повторяется много раз в секунду.
• Вопрос 11: нефтяной кризис 1973 года — бензин резко подорожал, большие машины много тратят, люди стали выбирать экономичные. Вопрос 12: сейчас покупатели чаще выбирают кроссоверы и просторные машины (удобство, безопасность, «статус»), маленькие продаются хуже — производителям выгоднее выпускать то, что покупают. Связь с прошлой серией: психология покупателя и стоимость.
• Машина будущего: ответ узла n11. Не оценивайте «реально / нереально» — спросите, какую проблему решает идея и что для неё понадобится. Для примеров (не для сайта): Audi Skysphere (меняется длина кузова), Geely Galaxy Battleship (амфибия), Lightyear 2 (солнечные панели), CATL Choco-SEB (замена батареи быстрее заправки), BMW i Vision Circular (переработанные материалы), Cadillac InnerSpace (капсула без руля и педалей).
• Факты серии: паровая повозка Кюньо (1769) и рассказ про первую аварию; патент Бенца (29 января 1886, № 37435); поездка Берты Бенц с сыновьями (1888, около 100 км); конвейер Форда (1913, модель Т).$t$
from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 7.%'
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();

-- ---------- 3. Серия 7 — к Модулю 7 ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep8' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 7.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
