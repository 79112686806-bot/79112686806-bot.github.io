-- Серии мультфильмов ко всем модулям и темы встреч с преподавателем. Нужна 20261026000027_hero.sql. Повторный запуск безопасен.
-- Откат — supabase/rollback/20261026000030_episodes_meet_rollback.sql.
--
-- 1) Очки героя за ответы в сериях — отдельно для каждой серии. Серия 1 считается как раньше (episode_points),
--    остальные — по таблице episode_scores: (серия, узел, tag) → очки; tag — следующий узел (какой ответ выбран),
--    пустой tag — любой ответ; per_item — очки за каждую идею мозгового штурма (5 за идею, не больше 40).
-- 2) lesson_content.meet — «🚩 На занятии обсуждаем» (видят ученики с открытым модулем, по строке на тему);
--    lesson_notes — заметки преподавателя к модулю (только админка).
-- 3) Модуль 1 курса «Колесо» — серия 2 «Как придумали колесо» (lesson_content.video_url = 'episode:ep2').

-- ---------- 1. Очки за серии ----------
create table if not exists public.episode_scores (
  episode  text not null,
  node     text not null,
  tag      text not null default '',
  deltas   jsonb not null default '{}'::jsonb,
  per_item text check (per_item in ('obs', 'cur', 'fan', 'craft', 'res', 'grit')),
  primary key (episode, node, tag)
);
alter table public.episode_scores enable row level security;
drop policy if exists episode_scores_admin on public.episode_scores;
create policy episode_scores_admin on public.episode_scores for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.episode_points_for(p_episode text, p_node text, p_answer text, p_via text, p_tag text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a text := coalesce(trim(p_answer), ''); r public.episode_scores; n int;
begin
  if p_episode = 'ep1' then return public.episode_points(p_node, p_answer, p_via, p_tag); end if;
  if p_via in ('skip', 'timeout') and a = '' then return '{}'::jsonb; end if;
  select * into r from public.episode_scores where episode = p_episode and node = p_node and tag = coalesce(p_tag, '');
  if not found then select * into r from public.episode_scores where episode = p_episode and node = p_node and tag = ''; end if;
  if not found then return '{}'::jsonb; end if;
  if r.per_item is not null then
    n := case when a = '' then 0 else array_length(string_to_array(a, '; '), 1) end;
    return case when n = 0 then '{}'::jsonb else jsonb_build_object(r.per_item, least(40, n * 5)) end;
  end if;
  return r.deltas;
end;
$$;
revoke execute on function public.episode_points_for(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.episode_answer_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.deltas := public.hero_award(new.user_id, 'episode', 'ep:' || new.episode || ':' || new.node,
    public.episode_points_for(new.episode, new.node, new.answer, new.via, new.tag), new.question, new.lesson_id);
  return new;
end;
$$;

-- Серия 2 «Как придумали колесо»: верный ответ — больше Наблюдательности, любой ответ — немного
insert into public.episode_scores (episode, node, tag, deltas, per_item) values
  ('ep2', 'n01', 'n02c', '{"obs": 10}', null), ('ep2', 'n01', '', '{"cur": 5}', null),
  ('ep2', 'n03', 'n04a', '{"obs": 10}', null), ('ep2', 'n03', '', '{"obs": 5}', null),
  ('ep2', 'n05', 'n06a', '{"obs": 10}', null), ('ep2', 'n05', '', '{"cur": 5}', null),
  ('ep2', 'n07', '', '{}', 'fan'),
  ('ep2', 'n09', 'n10a', '{"obs": 10}', null), ('ep2', 'n09', '', '{"obs": 5}', null),
  ('ep2', 'n11', 'n12a', '{"res": 10}', null), ('ep2', 'n11', '', '{"res": 5}', null),
  ('ep2', 'n13', '', '{"res": 10}', null),
  ('ep2', 'n15', '', '{"cur": 5}', null)
on conflict (episode, node, tag) do update set deltas = excluded.deltas, per_item = excluded.per_item;

-- ---------- 2. Темы встреч и заметки преподавателя ----------
alter table public.lesson_content add column if not exists meet text;

create table if not exists public.lesson_notes (
  lesson_id  bigint primary key references public.lessons (id) on delete cascade,
  notes      text,
  updated_at timestamptz not null default now()
);
alter table public.lesson_notes enable row level security;
drop policy if exists lesson_notes_admin on public.lesson_notes;
create policy lesson_notes_admin on public.lesson_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- темы встреч курса «Колесо» (модули ищутся по началу названия «Модуль N.»)
drop table if exists _meet;
create temporary table _meet (n int, meet text, notes text);
insert into _meet values
(1, $t$Почему двигатель автомобиля не связан напрямую с колёсами?
Почему в велосипедах применяется цепь (между звёздочкой педалей и колесом), а в автомобиле — ремень для связи двигателя с генератором?
Почему толкать тачку с грузом легче, чем нести этот груз на себе?$t$, null),
(4, $t$Необычные идеи развития колеса$t$, $t$Необычные идеи — помимо практичных разработок, есть и довольно необычные концепции:
• Сферические колёса. Идея движения на сферических колёсах обсуждалась давно. Сейчас энтузиасты и инженеры пробуют реализовать такие решения, но сталкиваются с серьёзными вызовами: нужно разработать специальную подвеску и привод.
• «Колесо Илона» (шведское колесо). Это всенаправленное колесо, которое позволяет транспорту двигаться в любом направлении, включая диагональное. Его запатентовал Бенгт Илон. Такие колёса часто применяют в робототехнике.
• Колёса с «умным» протектором. Например, протектор с сенсорами, который может менять рисунок в зависимости от погодных условий.$t$),
(6, $t$Вопросы безопасности
Основы технического дизайна
Психология потребителя$t$, null),
(7, $t$Маркетинговые вопросы
Перспективы развития автомобилей$t$, $t$В автопроме хватает смелых идей — часть из них уже тестируется, другие пока остаются футуристичными концептами:
• Изменяемый кузов. Audi Skysphere — электрический концепт, у которого можно менять расстояние между осями. Для трансформации кузов открывает и закрывает специальную секцию между передними крыльями и дверьми. Так машина адаптируется под режим движения: в спортивном режиме часть элементов скрывается, а управление берёт на себя автопилот.
• Салон-трансформер. В концепте Geely Galaxy Starship передние сиденья могут поворачиваться на 270 градусов. Это меняет конфигурацию салона: можно организовать пространство для работы, отдыха или перевозки грузов.
• Автомобиль-амфибия. Geely Galaxy Battleship умеет не только преодолевать броды (до 80 см), но и держаться на воде до двух часов, развивая при плавании скорость около 9 км/ч. Для этого в конструкцию добавили гидролокатор, а селектор трансмиссии сделали похожим на яхтенный рычаг. Ещё одна фишка — «танковый разворот» на месте и движение «крабом» (диагонально).
• Мультимедиа с полным погружением. Mercedes-Benz Vision V: в полу спрятан выдвижной 65-дюймовый экран с 4K-разрешением, семь проекторов выводят картинку на боковые стёкла, создавая обзор 360 градусов. Аудиосистема из 42 динамиков поддерживает пространственный звук Dolby Atmos. Есть игровой контроллер и несколько иммерсивных режимов — от шопинга до караоке.
• Интерфейс «мозг-компьютер». В шоу-каре Mercedes AVTR использовали технологию BCI (Brain-Computer Interface). Автомобиль способен считывать, на какую из светящихся иконок на приборной панели направлено внимание водителя, и автоматически запускать связанную с ней функцию. Дизайнеров вдохновил фильм «Аватар».
• Солнечная энергия. Lightyear 2 — автомобиль, кузов которого покрыт солнечными панелями. Машина может сама вырабатывать энергию и проезжать десятки километров в день только за счёт солнца, меньше завися от зарядок.
• Быстрая замена батареи. Компания CATL представила систему Choco-SEB: разряженный аккумулятор заменяют на заряженный — быстрее, чем заправить бензобак. Планировалось развернуть сеть станций замены.
• Автономный салон-капсула. Cadillac InnerSpace — полностью автономная двухместная капсула. Нет руля и педалей: вместо них — огромный панорамный экран и диван, лаунж-зона в движении.
• Экологичный подход. BMW i Vision Circular: около 30% деталей созданы из переработанных материалов (включая алюминиевые панели кузова и пластик в салоне), а конструкцию спроектировали так, чтобы её было легко переработать.
• Гибридные решения. Есть проекты, где к наземному минивэну крепится отдельный летающий модуль (eVTOL) — транспорт работает и на земле, и в воздухе.
Многие из этих идей пока существуют только в виде концептов, но именно они подталкивают индустрию к поиску новых решений — от материалов и архитектуры до взаимодействия человека с машиной.$t$);

insert into public.lesson_content (lesson_id, meet)
select l.id, x.meet from _meet x
  join public.lessons l on l.title like 'Модуль ' || x.n || '.%'
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
on conflict (lesson_id) do update set meet = excluded.meet;

insert into public.lesson_notes (lesson_id, notes)
select l.id, x.notes from _meet x
  join public.lessons l on l.title like 'Модуль ' || x.n || '.%'
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where x.notes is not null
on conflict (lesson_id) do update set notes = excluded.notes, updated_at = now();
drop table if exists _meet;

-- ---------- 3. Серия 2 — к Модулю 1 курса «Колесо» ----------
insert into public.lesson_content (lesson_id, video_url)
select l.id, 'episode:ep2' from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id and c.slug = 'wheel'
where l.title like 'Модуль 1.%'
on conflict (lesson_id) do update set video_url = excluded.video_url;
