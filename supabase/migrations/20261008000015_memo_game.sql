-- Игра «Мемо»: идеи детей для новых карточек и видео к историям карточек.

-- ---------- Идеи для новых карточек (QR на коробке → /igra/ideya/) ----------
create table public.memo_ideas (
  id          bigint generated always as identity primary key,
  child_name  text not null check (length(trim(child_name)) between 1 and 60),
  age         smallint check (age is null or age between 4 and 18),
  idea_title  text not null check (length(trim(idea_title)) between 2 and 120),
  idea_text   text not null check (length(trim(idea_text)) between 10 and 3000),
  contact     text not null check (length(trim(contact)) between 3 and 200), -- телефон или почта взрослого
  status      text not null default 'new' check (status in ('new', 'liked', 'gifted', 'rejected')),
  admin_note  text check (admin_note is null or length(admin_note) <= 1000),
  created_at  timestamptz not null default now()
);

alter table public.memo_ideas enable row level security;

create policy "Любой может предложить идею"
  on public.memo_ideas for insert to anon, authenticated
  with check (status = 'new' and admin_note is null);

create policy "Идеи видит админ"
  on public.memo_ideas for select to authenticated
  using (public.is_admin());

create policy "Идеи меняет админ"
  on public.memo_ideas for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Идеи удаляет админ"
  on public.memo_ideas for delete to authenticated
  using (public.is_admin());

-- ---------- Видео к историям карточек (ссылки Rutube / VK Видео) ----------
create table public.memo_videos (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  url         text not null check (url ~ '^https://'),
  updated_at  timestamptz not null default now()
);

alter table public.memo_videos enable row level security;

create policy "Видео карточек видны всем"
  on public.memo_videos for select to anon, authenticated
  using (true);

create policy "Видео карточек меняет админ"
  on public.memo_videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
