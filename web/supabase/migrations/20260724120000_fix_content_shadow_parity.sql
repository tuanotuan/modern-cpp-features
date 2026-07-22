create or replace view public.content_current_questions
with (security_invoker = true)
as
select
  question.id,
  question.lesson_id,
  question.current_version as version,
  revision.type,
  revision.response_mode,
  revision.difficulty,
  revision.estimated_minutes,
  revision.prompt,
  revision.code,
  revision.hint,
  revision.answer,
  revision.rubric,
  revision.sources,
  revision.taxonomy,
  revision.source_hash,
  revision.source_commit_sha,
  revision.generator_provider,
  revision.generator_model,
  revision.generator_prompt_version,
  case
    when question.lifecycle_status = 'archived'
      or lesson.lifecycle_status = 'archived' then 'archived'
    when question.lifecycle_status = 'verified'
      and lesson.current_source_hash is distinct from revision.source_hash
      then 'needs_review'
    else question.lifecycle_status
  end as status,
  question.created_at,
  question.updated_at
from public.content_questions as question
join public.content_question_revisions as revision
  on revision.question_id = question.id
  and revision.version = question.current_version
join public.content_lessons as lesson
  on lesson.id = question.lesson_id;

revoke all on table public.content_current_questions
  from public, anon, authenticated;
grant select on table public.content_current_questions to authenticated;
