-- Откат 20261026000030_episodes_meet.sql: очки за серии — снова только по серии 1; темы встреч и заметки удаляются.
create or replace function public.episode_answer_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.deltas := public.hero_award(new.user_id, 'episode', 'ep:' || new.episode || ':' || new.node,
    public.episode_points(new.node, new.answer, new.via, new.tag), new.question, new.lesson_id);
  return new;
end;
$$;
update public.lesson_content set video_url = null where video_url = 'episode:ep2';
drop function if exists public.episode_points_for(text, text, text, text, text);
drop table if exists public.episode_scores;
drop table if exists public.lesson_notes;
alter table public.lesson_content drop column if exists meet;
