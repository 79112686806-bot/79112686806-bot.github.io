-- Откат 20261107000045_invoices.sql: счета, вручную выставленные из админки, удаляются (заказы и оплаты остаются).
drop function if exists public.user_id_by_email(text);
alter table public.orders drop column if exists invoice_id;
drop table if exists public.invoices;
