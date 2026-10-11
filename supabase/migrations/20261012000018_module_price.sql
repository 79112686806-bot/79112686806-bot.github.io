-- Цена модуля — 4 500 ₽ (блок = модули × цена модуля). Пробное и весь курс + набор не меняются.
alter table public.courses alter column price_lesson set default 4500;
alter table public.courses alter column price_block  set default 4500;  -- не используется: блок = модули × price_lesson
update public.courses set price_lesson = 4500, price_block = 4500;
