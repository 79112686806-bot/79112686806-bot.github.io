-- Откат 20261107000044_yookassa.sql: заказы с возвратом становятся «canceled», статус «refunded» убирается.
update public.orders set status = 'canceled' where status = 'refunded';
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending', 'paid', 'canceled'));
