-- Завершение занятия: автоматически через duration_min минут после начала
-- или вручную (ended_at). Повторное занятие — новая дата и ended_at = null.

alter table public.lesson_calls
  add column duration_min integer not null default 90 check (duration_min between 10 and 600),
  add column ended_at     timestamptz,
  add constraint lesson_calls_note_length check (note is null or length(note) <= 2000);
