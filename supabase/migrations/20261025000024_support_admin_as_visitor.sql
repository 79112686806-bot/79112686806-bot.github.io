-- Чат «Вопрос нам»: администратор, который пишет с сайта в СВОЮ переписку (проверяет чат), — обычный посетитель.
-- Раньше такое сообщение считалось ответом администратора: не попадало во «Вопросы с сайта» и не присылало уведомление.

create or replace function public.support_thread_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- админ меняет чужую переписку (из админки) — без ограничений
  if public.is_admin() and new.user_id <> (select auth.uid()) then return new; end if;
  new.is_guest := coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.page := old.page; end if;
  return new;
end;
$$;

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
  -- ответ администратора — только в чужую переписку; в своей он такой же посетитель
  new.from_admin := public.is_admin() and new.user_id <> (select auth.uid());
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

create or replace function public.notify_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  url text;
  k jsonb;
begin
  -- свои действия администратору не присылаем (вопрос с сайта — по признаку from_admin: проверка чата админом тоже придёт)
  if tg_table_name = 'support_messages' then
    if new.from_admin then return new; end if;
  elsif public.is_admin() then return new;
  end if;
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

-- уже записанные «ответы самому себе» — это вопросы
alter table public.support_messages disable trigger support_message_guard;
update public.support_messages set from_admin = false where from_admin and author_id = user_id;
alter table public.support_messages enable trigger support_message_guard;
update public.support_threads t set is_guest = false
  where exists (select 1 from public.profiles p where p.id = t.user_id);
