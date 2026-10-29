-- Откат миграции 20261029000032_city_brain.sql (и банка задачек 20261029000033). Шестерёнки, потраченные в городе, не возвращаются.
drop trigger if exists notify_admin on public.shop_orders;
drop function if exists public.brain_answer(bigint, text);
drop function if exists public.brain_today();
drop function if exists public.brain_pick(uuid, text, bigint[]);
drop table if exists public.brain_answers;
drop table if exists public.brain_days;
drop table if exists public.brain_puzzles;
drop function if exists public.city_collect();
drop function if exists public.city_sell(int, int);
drop function if exists public.city_move(int, int, int, int);
drop function if exists public.city_place(text, int, int);
drop function if exists public.city_cell_ok(jsonb, int, int, int);
drop function if exists public.city_state();
drop function if exists public.city_ready(uuid);
drop function if exists public.city_radius(int);
drop function if exists public.city_era(uuid);
drop table if exists public.city;
drop table if exists public.city_items;
-- hero_status без разминки и города — версия из 20261026000029_shop.sql: выполните её блок «hero_status» заново.
