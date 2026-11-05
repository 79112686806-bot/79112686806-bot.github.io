-- Счета, выставленные вручную (админка → «Счета»): своя цена (скидка) за курс, пробное занятие или выбранные модули.
-- Человек платит по ссылке /?invoice=<id> через ЮKassa (чек — «Чеки от ЮKassa»), после оплаты доступ открывается сам
-- (mark_order_paid), письмо с логином и ссылкой «придумать пароль» уходит на почту. Оплату создаёт Edge Function yookassa.
-- Откат — supabase/rollback/20261107000045_invoices_rollback.sql.

create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  name        text,                                   -- кому (для себя, в письмо не идёт)
  course_id   bigint not null references public.courses (id) on delete restrict,
  kind        text not null check (kind in ('trial', 'custom', 'full')),
  items       jsonb not null default '{}'::jsonb,     -- {module_ids, lesson_ids} для kind = custom
  title       text not null check (length(title) between 1 and 128),  -- назначение платежа (и строка чека)
  amount      integer not null check (amount > 0 and amount <= 1000000),  -- рубли
  status      text not null default 'open' check (status in ('open', 'paid', 'canceled')),
  order_id    uuid references public.orders (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index on public.invoices (created_at desc);

alter table public.invoices enable row level security;
create policy "Счета — только админ" on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.orders add column if not exists invoice_id uuid references public.invoices (id) on delete set null;

-- id аккаунта по почте — нужен функции yookassa, чтобы оплата по счёту ушла на уже существующий аккаунт
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
