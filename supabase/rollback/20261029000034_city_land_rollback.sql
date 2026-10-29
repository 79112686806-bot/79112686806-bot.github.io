-- Откат миграции 20261029000034_city_land.sql: реки, мосты и леса убираются из городов, докупленная земля сбрасывается.
-- После отката выполните заново блоки city_place, city_move, city_sell и city_state из 20261029000032_city_brain.sql.
update public.city set tiles = coalesce((select jsonb_agg(t) from jsonb_array_elements(tiles) t where t->>'c' not in ('water', 'bridge', 'forest')), '[]'::jsonb);
delete from public.city_items where code in ('water', 'bridge', 'forest');
drop function if exists public.city_expand();
drop function if exists public.city_expand_price(int);
drop function if exists public.city_at(jsonb, int, int);
drop function if exists public.city_r(uuid);
alter table public.city_items drop column if exists need;
alter table public.city drop column if exists extra;
