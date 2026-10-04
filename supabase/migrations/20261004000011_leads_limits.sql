-- Шаг 6. Заявки с сайта: ограничения длины полей (защита от мусора).
alter table public.leads
  add constraint leads_lengths check (
    coalesce(length(parent_name), 0) <= 100
    and length(contact) <= 200
    and coalesce(length(comment), 0) <= 2000
  );
