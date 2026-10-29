-- Откат миграции 20261029000035_city_merge_prizes.sql: бонусы за соседей, особые здания и условия призов убираются,
-- цены возвращаются к прежним (если их не правили вручную).
-- После отката выполните заново: city_ready из 20261029000032_city_brain.sql, city_place и city_state из 20261029000034_city_land.sql,
-- shop_buy из 20261026000029_shop.sql (иначе они будут обращаться к удалённым столбцам).
drop function if exists public.shop_prize_info();
update public.shop_items s set price = t.old from (values
  ('prize-stickers', 150, 600), ('prize-cert', 250, 1000), ('prize-badge', 300, 1500),
  ('prize-notebook', 500, 2000), ('prize-call', 600, 3000), ('prize-kit', 1000, 6000)) t(code, old, price)
 where s.code = t.code and s.price = t.price;
alter table public.shop_items drop column if exists need_streak;
alter table public.shop_items drop column if exists need_blocks;
update public.city_items set price = 3 where code = 'water' and price = 10;
update public.city_items set price = 8 where code = 'forest' and price = 12;
alter table public.city_items drop column if exists merge;
alter table public.city_items drop column if exists once;
