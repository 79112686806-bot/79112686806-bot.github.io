-- Откат миграции 20261029000036_gears_games.sql: убираются «Мемо» за шестерёнки и «Ещё задачки».
-- Начисленные шестерёнки остаются у учеников; события героя с источником 'game' удаляются вместе с ограничением.
drop function if exists public.brain_extra_answer(bigint, text);
drop function if exists public.brain_more();
drop function if exists public.memo_finish(uuid);
drop function if exists public.memo_start(text);
drop table if exists public.brain_extra;
drop table if exists public.memo_rounds;
delete from public.hero_events where source = 'game';
alter table public.hero_events drop constraint if exists hero_events_source_check;
alter table public.hero_events add constraint hero_events_source_check
  check (source in ('onboarding', 'episode', 'lesson', 'research', 'chat', 'teacher', 'bonus', 'quiz', 'streak', 'chest', 'city'));
