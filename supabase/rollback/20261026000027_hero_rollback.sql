-- Откат миграции 20261026000027_hero.sql (герой-инженер).
-- Выполнять в Supabase → SQL Editor, только если решили отказаться от героя.
-- Удаляет триггеры, функции, таблицы hero/hero_events и колонки tag/deltas в episode_answers.
-- Сами ответы детей в сериях, задания, исследования и чат не трогаются.

drop trigger if exists episode_answer_award on public.episode_answers;
drop trigger if exists lesson_progress_award on public.lesson_progress;
drop trigger if exists research_award on public.research_answers;
drop trigger if exists chat_award on public.lesson_messages;

drop function if exists public.episode_answer_award();
drop function if exists public.lesson_progress_award();
drop function if exists public.research_award();
drop function if exists public.chat_award();
drop function if exists public.episode_points(text, text, text, text);
drop function if exists public.hero_grade(uuid, jsonb, text, bigint);
drop function if exists public.hero_seen();
drop function if exists public.hero_onboard(jsonb);
drop function if exists public.hero_award(uuid, text, text, jsonb, text, bigint, uuid);

drop table if exists public.hero_events;
drop table if exists public.hero;

alter table public.episode_answers drop column if exists deltas;
alter table public.episode_answers drop column if exists tag;
