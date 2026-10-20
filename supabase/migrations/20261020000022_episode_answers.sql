-- Ответы учеников в интерактивных сериях (episode.js): каждый вопрос серии — строка.
-- run_id — один просмотр серии (ответы группируются по нему в админке «Ответы в сериях»).
-- via: как ответил — voice (голосом), text (написал), button (кнопкой), mixed (идеи и голосом, и текстом),
-- skip (пропустил), timeout (время вышло без ответа); heard — что дословно распознал микрофон.
-- seen_at — когда администратор увидел ответ (для счётчика новых). Повторный запуск безопасен.

create table if not exists public.episode_answers (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  lesson_id  bigint not null references public.lessons (id) on delete cascade,
  episode    text not null,
  run_id     uuid not null,
  node       text not null,
  question   text not null,
  answer     text not null default '',
  heard      text,
  via        text not null check (via in ('voice', 'text', 'button', 'mixed', 'skip', 'timeout')),
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists episode_answers_created_idx on public.episode_answers (created_at desc);
create index if not exists episode_answers_user_idx on public.episode_answers (user_id, lesson_id);
create index if not exists episode_answers_unseen_idx on public.episode_answers (run_id) where seen_at is null;

alter table public.episode_answers enable row level security;

drop policy if exists "Ученик сохраняет ответы в открытом занятии" on public.episode_answers;
create policy "Ученик сохраняет ответы в открытом занятии"
  on public.episode_answers for insert to authenticated
  with check (user_id = (select auth.uid()) and seen_at is null and public.is_lesson_unlocked(lesson_id));

drop policy if exists "Свои ответы или админ" on public.episode_answers;
create policy "Свои ответы или админ"
  on public.episode_answers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Ответы отмечает админ" on public.episode_answers;
create policy "Ответы отмечает админ"
  on public.episode_answers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Ответы удаляет админ" on public.episode_answers;
create policy "Ответы удаляет админ"
  on public.episode_answers for delete to authenticated
  using (public.is_admin());
