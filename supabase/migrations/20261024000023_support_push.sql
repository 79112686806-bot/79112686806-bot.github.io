-- Вопросы с сайта (чат для всех) и пуш-уведомления администратору.
--
-- 1. Гость пишет без регистрации: сайт входит анонимно (Authentication → Sign In / Providers →
--    «Allow anonymous sign-ins» — включить). Анонимному пользователю профиль ученика не создаётся.
-- 2. Переписка «Вопросы»: одна на посетителя (гость или ученик) — support_threads + support_messages.
-- 3. Пуш-подписки устройств администратора — push_subscriptions.
-- 4. События (сообщения, темы на проверке, заявки, оплаты, отзывы, серии, идеи) → Edge Function notify
--    через pg_net. Функция сама перечитывает запись из базы и шлёт пуш, поэтому подделать текст снаружи нельзя,
--    а notify_log не даёт отправить одно и то же дважды.

-- ---------- 1. Анонимным пользователям профиль не нужен ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous then return new; end if;
  insert into public.profiles (id, student_name, parent_name, contact)
  values (
    new.id,
    new.raw_user_meta_data ->> 'student_name',
    new.raw_user_meta_data ->> 'parent_name',
    new.raw_user_meta_data ->> 'contact'
  );
  return new;
end;
$$;

-- ---------- 2. Вопросы с сайта ----------
create table public.support_threads (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text check (name is null or length(name) <= 80),
  contact    text check (contact is null or length(contact) <= 200),
  page       text check (page is null or length(page) <= 200),   -- откуда написали впервые
  is_guest   boolean not null default true,
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);

create table public.support_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.support_threads (user_id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_admin boolean not null default false,
  body       text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.support_messages (user_id, created_at);
create index on public.support_threads (last_at desc);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

create policy "Своя переписка или админ" on public.support_threads for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "Начать свою переписку" on public.support_threads for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Изменить имя и контакт в своей переписке или админ" on public.support_threads for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "Админ удаляет переписку" on public.support_threads for delete to authenticated
  using (public.is_admin());

create policy "Сообщения своей переписки или админ" on public.support_messages for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "Писать в свою переписку или админ" on public.support_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and (user_id = (select auth.uid()) or public.is_admin()));
create policy "Отметка о прочтении" on public.support_messages for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- гость/ученик, админ ли автор, время — проставляет база, а не браузер
create or replace function public.support_thread_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() then return new; end if;
  new.is_guest := coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.page := old.page; end if;
  return new;
end;
$$;
create trigger support_thread_guard before insert or update on public.support_threads
  for each row execute function public.support_thread_guard();

create or replace function public.support_message_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- менять можно только отметку о прочтении, и только у сообщений собеседника
    if new.body is distinct from old.body or new.author_id <> old.author_id or new.user_id <> old.user_id or new.from_admin <> old.from_admin then
      raise exception 'Можно только отметить сообщение прочитанным';
    end if;
    if old.author_id = (select auth.uid()) then new.read_at := old.read_at; end if;
    return new;
  end if;
  new.from_admin := public.is_admin();
  new.created_at := now();
  new.read_at := null;
  -- защита от спама: не больше 30 сообщений в час от одного посетителя
  if not new.from_admin and (select count(*) from public.support_messages
      where author_id = new.author_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Слишком много сообщений. Попробуйте чуть позже.';
  end if;
  update public.support_threads set last_at = now() where user_id = new.user_id;
  return new;
end;
$$;
create trigger support_message_guard before insert or update on public.support_messages
  for each row execute function public.support_message_guard();

alter publication supabase_realtime add table public.support_messages;

-- ---------- 3. Пуш-подписки устройств администратора ----------
create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  ua         text check (ua is null or length(ua) <= 300),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "Админ управляет своими подписками" on public.push_subscriptions for all to authenticated
  using (public.is_admin() and user_id = (select auth.uid()))
  with check (public.is_admin() and user_id = (select auth.uid()));

-- ---------- 4. События → Edge Function notify ----------
create extension if not exists pg_net with schema extensions;

-- служебные таблицы: читает и пишет только сервер (политик нет)
create table public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
create table public.notify_log (key text primary key, created_at timestamptz not null default now());
alter table public.notify_log enable row level security;

-- адрес функции notify (адрес проекта и так публичный — он есть в config.js сайта)
insert into public.app_config (key, value) values ('notify_url', 'https://lvidjigqmqbyygbkqbyv.supabase.co/functions/v1/notify')
  on conflict (key) do nothing;

create or replace function public.notify_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  url text;
  k jsonb;
begin
  -- свои действия администратору не присылаем
  if public.is_admin() then return new; end if;
  if tg_table_name = 'lesson_progress' then
    if new.status <> 'submitted' or (tg_op = 'UPDATE' and old.status = 'submitted') then return new; end if;
    k := jsonb_build_object('user_id', new.user_id, 'lesson_id', new.lesson_id);
  elsif tg_table_name = 'orders' then
    if new.status <> 'paid' or (tg_op = 'UPDATE' and old.status = 'paid') then return new; end if;
    k := jsonb_build_object('id', new.id);
  elsif tg_table_name = 'reviews' then
    if new.status <> 'pending' then return new; end if;
    k := jsonb_build_object('id', new.id);
  else
    k := jsonb_build_object('id', to_jsonb(new) -> 'id');
  end if;
  select value into url from public.app_config where key = 'notify_url';
  if url is null then return new; end if;
  perform net.http_post(url := url, body := jsonb_build_object('table', tg_table_name, 'key', k),
    headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
exception when others then
  return new;   -- оповещение никогда не мешает основному действию
end;
$$;

create trigger notify_admin after insert on public.lesson_messages for each row execute function public.notify_admin();
create trigger notify_admin after insert on public.support_messages for each row execute function public.notify_admin();
create trigger notify_admin after insert or update of status on public.lesson_progress for each row execute function public.notify_admin();
create trigger notify_admin after insert on public.leads for each row execute function public.notify_admin();
create trigger notify_admin after insert or update of status on public.orders for each row execute function public.notify_admin();
create trigger notify_admin after insert on public.reviews for each row execute function public.notify_admin();
create trigger notify_admin after insert on public.episode_answers for each row execute function public.notify_admin();
create trigger notify_admin after insert on public.memo_ideas for each row execute function public.notify_admin();
