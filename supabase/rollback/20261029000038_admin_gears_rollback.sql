-- Откат 20261029000038_admin_gears.sql. Уже сделанные изменения шестерёнок остаются (и в hero, и в истории).
drop function if exists public.admin_gears(uuid, int, text);
