-- ЮKassa: статус заказа «refunded» (возврат прошёл — отмечает Edge Function yookassa по уведомлению refund.succeeded).
-- Доступ к курсу при возврате не снимается автоматически — это решает администратор.
-- Откат — supabase/rollback/20261107000044_yookassa_rollback.sql.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending', 'paid', 'canceled', 'refunded'));
