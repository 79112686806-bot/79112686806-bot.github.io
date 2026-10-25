-- Чат «Вопрос нам» как в мессенджере: свои сообщения можно изменить и удалить (удалённое показывается
-- как «Сообщение удалено»), админ может удалить любое. Админ отмечает переписку «Вопрос решён» —
-- непрочитанные в ней гаснут; новое сообщение посетителя снова открывает вопрос.
-- Выполнять после 20261025000025. Можно выполнять повторно.

alter table public.support_messages add column if not exists edited_at timestamptz;
alter table public.support_messages add column if not exists deleted_at timestamptz;
alter table public.support_messages drop constraint if exists support_messages_body_check;
alter table public.support_messages add constraint support_messages_body_check
  check (deleted_at is not null or length(trim(body)) between 1 and 2000);
alter table public.support_threads add column if not exists done_at timestamptz;

create or replace function public.support_message_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  adm boolean := public.is_admin();
begin
  if tg_op = 'UPDATE' then
    if new.author_id <> old.author_id or new.user_id <> old.user_id or new.from_admin <> old.from_admin
       or new.created_at <> old.created_at then
      raise exception 'Это сообщение менять нельзя';
    end if;
    if old.deleted_at is not null then                       -- удалённое не восстанавливается и не правится
      new.body := old.body; new.deleted_at := old.deleted_at; new.edited_at := old.edited_at;
    elsif new.deleted_at is not null then                    -- удалить: своё — автор, любое — админ
      if old.author_id <> me and not adm then raise exception 'Удалять можно только свои сообщения'; end if;
      new.deleted_at := now(); new.body := ''; new.edited_at := old.edited_at;
    elsif new.body is distinct from old.body then            -- изменить: только своё
      if old.author_id <> me then raise exception 'Изменять можно только свои сообщения'; end if;
      if length(trim(new.body)) not between 1 and 2000 then raise exception 'Пустое или слишком длинное сообщение'; end if;
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
    -- «прочитано» ставит собеседник (админ — у любых сообщений, в т. ч. при проверке своей переписки)
    if old.author_id = me and not adm then new.read_at := old.read_at; end if;
    return new;
  end if;
  -- ответ администратора — только в чужую переписку; в своей он такой же посетитель
  new.from_admin := adm and new.user_id <> me;
  new.created_at := now();
  new.read_at := null; new.edited_at := null; new.deleted_at := null;
  -- защита от спама: не больше 30 сообщений в час от одного посетителя
  if not new.from_admin and (select count(*) from public.support_messages
      where author_id = new.author_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Слишком много сообщений. Попробуйте чуть позже.';
  end if;
  -- новое сообщение посетителя снова открывает вопрос
  update public.support_threads set last_at = now(), done_at = case when new.from_admin then done_at end
    where user_id = new.user_id;
  return new;
end;
$$;

create or replace function public.support_thread_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- админ меняет переписку (из админки, в т. ч. «Вопрос решён» у своей проверочной) — без ограничений
  if public.is_admin() and (new.user_id <> (select auth.uid()) or tg_op = 'UPDATE') then return new; end if;
  -- обновление из триггера сообщений (last_at, done_at) — пропускаем как есть
  if pg_trigger_depth() > 1 then return new; end if;
  new.is_guest := coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.page := old.page; new.done_at := old.done_at;
  else new.done_at := null; end if;
  return new;
end;
$$;

-- «Вопрос решён» из админки: отметить переписку и погасить непрочитанные
create or replace function public.support_mark_done(p_user uuid, p_done boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  update public.support_threads set done_at = case when p_done then now() end where user_id = p_user;
  if p_done then
    update public.support_messages set read_at = now() where user_id = p_user and not from_admin and read_at is null;
  end if;
end;
$$;
revoke execute on function public.support_mark_done(uuid, boolean) from public, anon;
grant execute on function public.support_mark_done(uuid, boolean) to authenticated;
