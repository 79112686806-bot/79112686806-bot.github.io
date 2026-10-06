-- Варианты оплаты курса: пробное занятие, блоки (модули) и отдельные темы, весь курс.
-- Покупатель получает доступ только к купленным темам; темы открываются по порядку
-- после подтверждения преподавателем. При покупке всего курса засчитывается
-- всё, что уже оплачено за этот курс.

-- ---------- Цены курса (в рублях) ----------
alter table public.courses
  add column price_trial_base integer not null default 2500,   -- пробное занятие без скидки (для зачёркнутой цены)
  add column price_trial      integer not null default 1250,   -- пробное занятие со скидкой 50%
  add column price_block      integer not null default 10000,  -- блок = модуль курса
  add column price_lesson     integer not null default 3500;   -- одна тема (занятие)
alter table public.courses alter column price set default 37500; -- весь курс
update public.courses set price = 37500;

-- ---------- Доступ: весь курс или отдельные темы ----------
alter table public.enrollments
  add column scope text not null default 'full' check (scope in ('full', 'partial'));

create table public.lesson_access (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lesson_id  bigint not null references public.lessons (id) on delete cascade,
  order_id   uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_access enable row level security;

create policy "Свои купленные темы или админ"
  on public.lesson_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "Доступ к темам выдаёт админ"
  on public.lesson_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Заказ: что именно куплено ----------
alter table public.orders
  add column kind  text not null default 'full' check (kind in ('trial', 'custom', 'full')),
  add column items jsonb not null default '{}'::jsonb;  -- {"module_ids":[…], "lesson_ids":[…]}

-- ---------- Тема открыта: куплена и все предыдущие купленные темы подтверждены ----------
create or replace function public.is_lesson_unlocked(p_lesson_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select l.id, m.course_id, m.sort as module_sort, l.sort as lesson_sort
    from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = p_lesson_id
  ),
  enr as (
    select e.scope
    from public.enrollments e, cur
    where e.user_id = (select auth.uid())
      and e.course_id = cur.course_id
      and e.status in ('active', 'finished')
  )
  select
    exists (select 1 from enr)
    -- эта тема куплена (весь курс или отдельно)
    and (
      exists (select 1 from enr where scope = 'full')
      or exists (select 1 from public.lesson_access a where a.user_id = (select auth.uid()) and a.lesson_id = p_lesson_id)
    )
    -- нет ни одной предыдущей купленной темы без подтверждения
    and not exists (
      select 1
      from cur
      join public.modules m2 on m2.course_id = cur.course_id
      join public.lessons l2 on l2.module_id = m2.id
      where (m2.sort, l2.sort) < (cur.module_sort, cur.lesson_sort)
        and (
          exists (select 1 from enr where scope = 'full')
          or exists (select 1 from public.lesson_access a where a.user_id = (select auth.uid()) and a.lesson_id = l2.id)
        )
        and not exists (
          select 1 from public.lesson_progress p
          where p.user_id = (select auth.uid()) and p.lesson_id = l2.id and p.status = 'approved'
        )
    );
$$;

-- ---------- Расчёт стоимости заказа (только на сервере — цену из браузера не берём) ----------
-- p_kind: 'trial' | 'custom' (блоки и темы) | 'full'. p_user_id может быть null (новый покупатель).
create or replace function public.quote_order(
  p_user_id uuid, p_course_id bigint, p_kind text,
  p_module_ids bigint[] default '{}', p_lesson_ids bigint[] default '{}'
)
returns table (amount integer, lesson_ids bigint[], error text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c         public.courses;
  v_scope   text;
  v_paid    integer;
  v_owned   bigint[];
  v_first   bigint;
  v_mod     bigint;
  v_mod_ls  bigint[];
  v_all     bigint[] := '{}';
  v_extra   bigint[];
  v_amount  integer := 0;
begin
  select * into c from public.courses where id = p_course_id;
  if not found or c.status <> 'available' then
    return query select 0, null::bigint[], 'course_unavailable'; return;
  end if;

  select e.scope into v_scope from public.enrollments e where e.user_id = p_user_id and e.course_id = p_course_id;
  if v_scope = 'full' then
    return query select 0, null::bigint[], 'already_full'; return;
  end if;

  select coalesce(sum(o.amount), 0)::integer into v_paid
  from public.orders o where o.user_id = p_user_id and o.course_id = p_course_id and o.status = 'paid';

  select coalesce(array_agg(a.lesson_id), '{}') into v_owned
  from public.lesson_access a
  join public.lessons l on l.id = a.lesson_id
  join public.modules m on m.id = l.module_id
  where a.user_id = p_user_id and m.course_id = p_course_id;

  if p_kind = 'full' then
    -- весь курс за вычетом уже оплаченного за этот курс
    return query select greatest(c.price - v_paid, 0), null::bigint[], null::text; return;

  elsif p_kind = 'trial' then
    -- пробное — один раз и только для тех, кто ещё ничего не покупал в этом курсе
    if v_scope is not null or v_paid > 0 then
      return query select 0, null::bigint[], 'trial_used'; return;
    end if;
    select l.id into v_first
    from public.lessons l join public.modules m on m.id = l.module_id
    where m.course_id = p_course_id
    order by m.sort, l.sort limit 1;
    if v_first is null then
      return query select 0, null::bigint[], 'no_lessons'; return;
    end if;
    return query select c.price_trial, array[v_first], null::text; return;

  elsif p_kind = 'custom' then
    -- блоки (модули целиком)
    for v_mod in select distinct x from unnest(coalesce(p_module_ids, '{}')) as x loop
      select coalesce(array_agg(l.id), '{}') into v_mod_ls
      from public.lessons l join public.modules m on m.id = l.module_id
      where m.id = v_mod and m.course_id = p_course_id;
      if cardinality(v_mod_ls) = 0 then
        return query select 0, null::bigint[], 'bad_module'; return;
      end if;
      if v_mod_ls && v_owned then
        return query select 0, null::bigint[], 'module_partially_owned'; return;
      end if;
      v_all := v_all || v_mod_ls;
      v_amount := v_amount + c.price_block;
    end loop;
    -- отдельные темы, не вошедшие в выбранные блоки и ещё не купленные
    select coalesce(array_agg(distinct l.id), '{}') into v_extra
    from public.lessons l join public.modules m on m.id = l.module_id
    where l.id = any (coalesce(p_lesson_ids, '{}')) and m.course_id = p_course_id
      and not (l.id = any (v_all)) and not (l.id = any (v_owned));
    v_all := v_all || v_extra;
    v_amount := v_amount + cardinality(v_extra) * c.price_lesson;
    if cardinality(v_all) = 0 then
      return query select 0, null::bigint[], 'nothing_selected'; return;
    end if;
    return query select v_amount, v_all, null::text; return;
  end if;

  return query select 0, null::bigint[], 'bad_kind';
end;
$$;

revoke execute on function public.quote_order(uuid, bigint, text, bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.quote_order(uuid, bigint, text, bigint[], bigint[]) to service_role;

-- ---------- Оплата прошла: открыть весь курс или купленные темы ----------
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

  if o.kind = 'full' then
    insert into public.enrollments (user_id, course_id, source, scope)
    values (o.user_id, o.course_id, 'payment', 'full')
    on conflict (user_id, course_id) do update set status = 'active', scope = 'full';
  else
    insert into public.enrollments (user_id, course_id, source, scope)
    values (o.user_id, o.course_id, 'payment', 'partial')
    on conflict (user_id, course_id) do update set status = 'active';
    insert into public.lesson_access (user_id, lesson_id, order_id)
    select o.user_id, x::bigint, o.id
    from jsonb_array_elements_text(coalesce(o.items -> 'lesson_ids', '[]'::jsonb)) as x
    on conflict (user_id, lesson_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid) to service_role;
