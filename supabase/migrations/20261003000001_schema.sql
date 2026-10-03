-- Шаг 1. Схема базы: курсы, программа, ученики, прогресс, заявки.
-- RLS включён на всех таблицах без политик — до шага 2 всё закрыто для API.

-- Общая функция для полей updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Профиль пользователя, 1:1 с auth.users. Один аккаунт = один ученик.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'student' check (role in ('student', 'admin')),
  student_name text,
  parent_name  text,
  contact      text,
  created_at   timestamptz not null default now()
);

-- Профиль создаётся автоматически при создании пользователя в Auth.
-- Роль из метаданных не берётся — только 'student' по умолчанию.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Каталог программ
create table public.courses (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  title       text not null,
  subtitle    text,
  description text,
  price       integer not null default 20000,  -- рубли
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Модули курса
create table public.modules (
  id        bigint generated always as identity primary key,
  course_id bigint not null references public.courses (id) on delete cascade,
  sort      integer not null,
  title     text not null,
  unique (course_id, sort)
);

-- Темы. Порядок внутри курса: modules.sort, затем lessons.sort.
-- Названия тем видны всем (боковая панель), закрытая часть — в lesson_content.
create table public.lessons (
  id            bigint generated always as identity primary key,
  module_id     bigint not null references public.modules (id) on delete cascade,
  sort          integer not null,
  title         text not null,
  research_task text,  -- задание-исследование, если есть
  unique (module_id, sort)
);

-- Закрытая часть темы: видео и материалы (пути к файлам в Storage)
create table public.lesson_content (
  lesson_id  bigint primary key references public.lessons (id) on delete cascade,
  video_url  text,
  materials  jsonb not null default '[]'::jsonb,  -- [{"title": "...", "path": "..."}]
  updated_at timestamptz not null default now()
);

create trigger lesson_content_updated_at
  before update on public.lesson_content
  for each row execute function public.set_updated_at();

-- Запись ученика на курс
create table public.enrollments (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  course_id  bigint not null references public.courses (id) on delete restrict,
  status     text not null default 'active' check (status in ('active', 'paused', 'finished')),
  source     text not null default 'manual' check (source in ('manual', 'payment')),
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- Прохождение тем: ученик отправляет на проверку, администратор подтверждает.
-- Подтверждённая тема открывает свои материалы и следующую тему.
create table public.lesson_progress (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  lesson_id       bigint not null references public.lessons (id) on delete cascade,
  status          text not null check (status in ('submitted', 'approved')),
  submitted_at    timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references public.profiles (id) on delete set null,
  teacher_comment text,
  updated_at      timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create trigger lesson_progress_updated_at
  before update on public.lesson_progress
  for each row execute function public.set_updated_at();

-- Ответы ученика на исследование (раньше были в localStorage)
create table public.research_answers (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lesson_id  bigint not null references public.lessons (id) on delete cascade,
  hypothesis text not null default '',
  method     text not null default '',
  result     text not null default '',
  conclusion text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create trigger research_answers_updated_at
  before update on public.research_answers
  for each row execute function public.set_updated_at();

-- Заявки на консультацию с сайта
create table public.leads (
  id          bigint generated always as identity primary key,
  course_id   bigint references public.courses (id) on delete set null,
  parent_name text,
  contact     text not null,
  comment     text,
  status      text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  created_at  timestamptz not null default now()
);

-- Индексы под частые запросы
create index on public.modules (course_id);
create index on public.lessons (module_id);
create index on public.enrollments (course_id);
create index on public.lesson_progress (lesson_id);
create index on public.lesson_progress (status) where status = 'submitted';
create index on public.leads (created_at desc);

-- Всё закрыто, пока в шаге 2 не появятся политики
alter table public.profiles         enable row level security;
alter table public.courses          enable row level security;
alter table public.modules          enable row level security;
alter table public.lessons          enable row level security;
alter table public.lesson_content   enable row level security;
alter table public.enrollments      enable row level security;
alter table public.lesson_progress  enable row level security;
alter table public.research_answers enable row level security;
alter table public.leads            enable row level security;
