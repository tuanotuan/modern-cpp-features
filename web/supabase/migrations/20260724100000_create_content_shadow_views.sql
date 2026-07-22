create or replace view public.content_current_lessons
with (security_invoker = true)
as
select
  lesson.id,
  lesson.lifecycle_status,
  revision.source_hash,
  revision.source_commit_sha,
  revision.source_path,
  revision.standard,
  revision.lesson_order,
  revision.title,
  revision.tags,
  revision.prerequisites,
  revision.code,
  revision.sections,
  revision.checklist_items,
  lesson.created_at,
  lesson.updated_at
from public.content_lessons as lesson
join public.content_lesson_revisions as revision
  on revision.lesson_id = lesson.id
  and revision.source_hash = lesson.current_source_hash;

revoke all on table public.content_current_lessons
  from public, anon, authenticated;
grant select on table public.content_current_lessons to authenticated;
