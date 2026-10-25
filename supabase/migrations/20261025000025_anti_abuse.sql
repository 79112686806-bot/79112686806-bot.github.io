-- Защита от ботов и злоупотреблений (выполнять после 20261025000024).
-- Что открыто без входа: заявки (leads), идеи для «Мемо» (memo_ideas) и чат «Вопрос нам» (анонимный вход).
-- Боту ничего не стоит слать их тысячами, поэтому база сама ограничивает поток:
--   1) лимиты на число записей — с одного контакта и всего по сайту за час;
--   2) уведомления администратору не превращаются в лавину (не больше 40 за 10 минут, по одному вопросу — раз в 3 минуты);
--   3) анонимные «гости», которые так ничего и не написали, удаляются раз в сутки.

-- ---------- 1. Лимиты на заявки и идеи ----------
create or replace function public.public_form_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  total int;
  same int;
  lim int := case tg_table_name when 'leads' then 30 else 60 end;   -- всего по сайту за час
begin
  if public.is_admin() then return new; end if;
  execute format('select count(*), count(*) filter (where lower(trim(contact)) = lower(trim($1)))
                    from public.%I where created_at > now() - interval ''1 hour''', tg_table_name)
    into total, same using new.contact;
  if same >= 3 then raise exception 'Слишком много заявок подряд. Попробуйте позже или напишите нам на почту.'; end if;
  if total >= lim then raise exception 'Сейчас слишком много заявок. Попробуйте через час или напишите нам на почту.'; end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists public_form_guard on public.leads;
create trigger public_form_guard before insert on public.leads for each row execute function public.public_form_guard();
drop trigger if exists public_form_guard on public.memo_ideas;
create trigger public_form_guard before insert on public.memo_ideas for each row execute function public.public_form_guard();

-- длина полей заявки (в форме уже ограничена, теперь и в базе; старые записи не проверяются)
alter table public.leads drop constraint if exists leads_lengths;   -- можно выполнять повторно
alter table public.leads add constraint leads_lengths
  check (length(coalesce(parent_name, '')) <= 100 and length(coalesce(comment, '')) <= 2000) not valid;

create index if not exists leads_created_idx on public.leads (created_at);
create index if not exists memo_ideas_created_idx on public.memo_ideas (created_at);

-- ---------- 2. Чат «Вопрос нам»: общий лимит на гостей ----------
-- лимит «30 сообщений в час от одного автора» уже есть; бот может каждый раз входить новым гостем,
-- поэтому добавляем общий: все гости вместе — не больше 120 сообщений в час и не больше 40 новых переписок в час.
create or replace function public.support_guest_flood_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is not true then return new; end if;
  if tg_table_name = 'support_messages' then
    if (select count(*) from public.support_messages m join public.support_threads t on t.user_id = m.user_id
        where t.is_guest and not m.from_admin and m.created_at > now() - interval '1 hour') >= 120 then
      raise exception 'Слишком много сообщений. Попробуйте чуть позже.';
    end if;
  elsif not exists (select 1 from public.support_threads where user_id = new.user_id)   -- новая переписка (upsert старой не считаем)
    and (select count(*) from public.support_threads where is_guest and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Слишком много сообщений. Попробуйте чуть позже.';
  end if;
  return new;
end;
$$;
drop trigger if exists support_guest_flood_guard on public.support_messages;
create trigger support_guest_flood_guard before insert on public.support_messages for each row execute function public.support_guest_flood_guard();
drop trigger if exists support_guest_flood_guard on public.support_threads;
create trigger support_guest_flood_guard before insert on public.support_threads for each row execute function public.support_guest_flood_guard();
create index if not exists support_messages_created_idx on public.support_messages (created_at);

-- ---------- 3. Уведомления без лавины ----------
create or replace function public.notify_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  url text;
  k jsonb;
begin
  -- свои действия администратору не присылаем (вопрос с сайта — по признаку from_admin: проверка чата админом тоже придёт)
  if tg_table_name = 'support_messages' then
    if new.from_admin then return new; end if;
    -- один человек пишет несколько сообщений подряд — одно уведомление раз в 3 минуты
    if exists (select 1 from public.support_messages where user_id = new.user_id and id <> new.id and not from_admin
               and created_at > now() - interval '3 minutes') then return new; end if;
  elsif public.is_admin() then return new;
  end if;
  -- если что-то пошло лавиной — не больше 40 уведомлений за 10 минут (всё равно видно в админке)
  if (select count(*) from public.notify_log where created_at > now() - interval '10 minutes') >= 40 then return new; end if;
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
create index if not exists notify_log_created_idx on public.notify_log (created_at);

-- ---------- 4. Уборка: пустые анонимные гости и старый журнал уведомлений ----------
create or replace function public.cleanup_guests()
returns void language sql security definer set search_path = '' as $$
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '1 day'
    and not exists (select 1 from public.support_threads t where t.user_id = u.id);
  delete from public.notify_log where created_at < now() - interval '30 days';
$$;
revoke execute on function public.cleanup_guests() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('cleanup-guests', '17 3 * * *', 'select public.cleanup_guests()');
