-- Документы и согласия, отзывы, видео на главной.

-- ---------- Согласия ----------
-- Когда человек отметил согласие на обработку персональных данных (форма заявки)
alter table public.leads add column consent_at timestamptz not null default now();
-- Когда покупатель принял оферту (ставит функция checkout при оформлении)
alter table public.orders add column offer_accepted_at timestamptz;

-- ---------- Отзывы ----------
-- Пишет ученик/родитель в кабинете (ждёт проверки) или добавляет админ.
-- На сайте видны только одобренные.
create table public.reviews (
  id              bigint generated always as identity primary key,
  user_id         uuid references public.profiles (id) on delete set null,
  author_name     text not null check (length(trim(author_name)) between 1 and 80),
  author_role     text not null default 'parent' check (author_role in ('parent', 'student')),
  course_id       bigint references public.courses (id) on delete set null,
  text            text not null check (length(trim(text)) between 10 and 2000),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source          text not null default 'cabinet' check (source in ('cabinet', 'admin')),
  publish_consent boolean not null default false,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz
);

create index on public.reviews (status, approved_at desc);

alter table public.reviews enable row level security;

create policy "Одобренные отзывы видны всем, свои — автору"
  on public.reviews for select to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or public.is_admin());

-- Ученик (записанный на курс) отправляет отзыв на проверку, только с согласием на публикацию
create policy "Ученик отправляет отзыв на проверку"
  on public.reviews for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending' and source = 'cabinet' and publish_consent
    and approved_at is null
    and exists (select 1 from public.enrollments e where e.user_id = (select auth.uid()))
  );

create policy "Отзывы проверяет и добавляет админ"
  on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Видео на главной ----------
create table public.site_videos (
  id            bigint generated always as identity primary key,
  title         text not null check (length(trim(title)) between 1 and 150),
  description   text check (description is null or length(description) <= 1000),
  url           text not null check (url ~ '^https://'),
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~ '^https://'),
  sort          integer not null default 0,
  published     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.site_videos enable row level security;

create policy "Опубликованные видео видны всем"
  on public.site_videos for select to anon, authenticated
  using (published or public.is_admin());

create policy "Видео меняет админ"
  on public.site_videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
