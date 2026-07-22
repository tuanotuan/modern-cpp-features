begin;

-- The language/track fields are derived from the immutable compatibility
-- standard. Rebuild only those generated columns so existing revision data and
-- checksums stay untouched.
drop view if exists public.content_current_lessons;

alter table public.content_lesson_revisions
  drop constraint if exists content_lesson_revisions_language_check,
  drop constraint if exists content_lesson_revisions_track_check,
  drop constraint if exists content_lesson_revisions_standard_check;

alter table public.content_lesson_revisions
  drop column if exists language,
  drop column if exists track;

alter table public.content_lesson_revisions
  add constraint content_lesson_revisions_standard_check check (
    standard in ('cpp98', 'cpp11', 'cpp20', 'python3', 'cmake')
  ),
  add column language text generated always as (
    case
      when standard = 'python3' then 'python'
      when standard = 'cmake' then 'cmake'
      else 'cpp'
    end
  ) stored,
  add column track text generated always as (standard) stored;

alter table public.content_lesson_revisions
  add constraint content_lesson_revisions_language_check check (
    language in ('cpp', 'python', 'cmake')
  ),
  add constraint content_lesson_revisions_track_check check (
    track in ('cpp98', 'cpp11', 'cpp20', 'python3', 'cmake')
  );

alter table public.content_lessons
  drop constraint if exists content_lessons_current_language_check,
  drop constraint if exists content_lessons_current_track_check,
  drop constraint if exists content_lessons_current_standard_check;

alter table public.content_lessons
  drop column if exists current_language,
  drop column if exists current_track;

alter table public.content_lessons
  add constraint content_lessons_current_standard_check check (
    current_standard is null
    or current_standard in ('cpp98', 'cpp11', 'cpp20', 'python3', 'cmake')
  ),
  add column current_language text generated always as (
    case
      when current_standard is null then null
      when current_standard = 'python3' then 'python'
      when current_standard = 'cmake' then 'cmake'
      else 'cpp'
    end
  ) stored,
  add column current_track text generated always as (current_standard) stored;

alter table public.content_lessons
  add constraint content_lessons_current_language_check check (
    current_language is null
    or current_language in ('cpp', 'python', 'cmake')
  ),
  add constraint content_lessons_current_track_check check (
    current_track is null
    or current_track in ('cpp98', 'cpp11', 'cpp20', 'python3', 'cmake')
  );

create view public.content_current_lessons
with (security_invoker = true)
as
select
  lesson.id,
  lesson.lifecycle_status,
  revision.source_hash,
  revision.source_commit_sha,
  coalesce(lesson.current_source_path, revision.source_path) as source_path,
  coalesce(lesson.current_standard, revision.standard) as standard,
  coalesce(lesson.current_lesson_order, revision.lesson_order) as lesson_order,
  revision.title,
  coalesce(lesson.current_tags, revision.tags) as tags,
  coalesce(lesson.current_prerequisites, revision.prerequisites) as prerequisites,
  revision.code,
  revision.sections,
  revision.checklist_items,
  lesson.created_at,
  lesson.updated_at,
  lesson.manifest_order,
  coalesce(lesson.current_language, revision.language) as language,
  coalesce(lesson.current_track, revision.track) as track
from public.content_lessons as lesson
join public.content_lesson_revisions as revision
  on revision.lesson_id = lesson.id
  and revision.source_hash = lesson.current_source_hash;

revoke all on table public.content_current_lessons
  from public, anon, authenticated;
grant select on table public.content_current_lessons to authenticated;

commit;
