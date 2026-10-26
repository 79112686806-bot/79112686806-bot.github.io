-- Откат миграции 20261026000028_hero_path.sql (серия дней, шестерёнки, задания дня, сундуки).
-- Выполнять в Supabase → SQL Editor. Если откатываете и героя целиком — сначала этот файл, потом 20261026000027_hero_rollback.sql.

drop trigger if exists hero_streak_tick on public.hero_events;
drop function if exists public.hero_streak_tick();
drop function if exists public.hero_claim(text, bigint);
drop function if exists public.hero_status();
drop function if exists public.hero_quests(uuid, date);
drop function if exists public.hero_bonus(uuid, text, text, jsonb, int, text, boolean);
drop function if exists public.hero_is_kid(text, text);
drop function if exists public.hero_today();

delete from public.hero_events where source in ('quiz', 'streak', 'chest');
alter table public.hero_events drop constraint if exists hero_events_source_check;
alter table public.hero_events add constraint hero_events_source_check
  check (source in ('onboarding', 'episode', 'lesson', 'research', 'chat', 'teacher', 'bonus'));
alter table public.hero_events drop column if exists gears;
update public.hero set gears = 0, streak = 0, best_streak = 0, last_day = null, freezes = 0;
