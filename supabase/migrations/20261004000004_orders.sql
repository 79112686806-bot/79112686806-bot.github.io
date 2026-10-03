-- Шаг 3б. Заказы: покупка курса.
-- Аккаунт создаётся при оформлении (пароль придумывает покупатель),
-- курс открывается, когда заказ оплачен (mark_order_paid).
-- Пока ЮKassa не подключена — демо-оплата (provider = 'demo').

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  course_id           bigint not null references public.courses (id) on delete restrict,
  amount              integer not null,  -- рубли
  status              text not null default 'pending' check (status in ('pending', 'paid', 'canceled')),
  provider            text not null check (provider in ('demo', 'yookassa')),
  provider_payment_id text unique,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);

create index on public.orders (user_id);

alter table public.orders enable row level security;

-- Ученик видит свои заказы, админ — все. Создаёт и меняет заказы только сервер.
create policy "Свои заказы или админ"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Заказ оплачен: отмечаем и записываем ученика на курс.
-- Повторный вызов безопасен. Вызывает только сервер (Edge Function / webhook оплаты).
create or replace function public.mark_order_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Заказ не найден';
  end if;
  if o.status = 'paid' then
    return;
  end if;

  update public.orders set status = 'paid', paid_at = now() where id = o.id;

  insert into public.enrollments (user_id, course_id, source)
  values (o.user_id, o.course_id, 'payment')
  on conflict (user_id, course_id) do update set status = 'active';
end;
$$;

revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid) to service_role;
