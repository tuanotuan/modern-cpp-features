alter table public.content_lessons
  add column if not exists manifest_order integer
  check (manifest_order is null or manifest_order > 0);

alter table public.content_lessons
  add column if not exists current_source_path text,
  add column if not exists current_standard text,
  add column if not exists current_lesson_order integer,
  add column if not exists current_tags jsonb,
  add column if not exists current_prerequisites jsonb;

alter table public.content_lessons
  drop constraint if exists content_lessons_current_source_path_check,
  add constraint content_lessons_current_source_path_check check (
    current_source_path is null or char_length(btrim(current_source_path)) > 0
  ),
  drop constraint if exists content_lessons_current_standard_check,
  add constraint content_lessons_current_standard_check check (
    current_standard is null or current_standard in ('cpp98', 'cpp11', 'cpp20')
  ),
  drop constraint if exists content_lessons_current_lesson_order_check,
  add constraint content_lessons_current_lesson_order_check check (
    current_lesson_order is null or current_lesson_order > 0
  ),
  drop constraint if exists content_lessons_current_tags_check,
  add constraint content_lessons_current_tags_check check (
    current_tags is null or jsonb_typeof(current_tags) = 'array'
  ),
  drop constraint if exists content_lessons_current_prerequisites_check,
  add constraint content_lessons_current_prerequisites_check check (
    current_prerequisites is null
    or jsonb_typeof(current_prerequisites) = 'array'
  );

alter table public.content_questions
  add column if not exists manifest_order integer
  check (manifest_order is null or manifest_order > 0);

create table if not exists public.content_store_state (
  singleton boolean primary key default true check (singleton),
  repository text not null check (char_length(btrim(repository)) > 0),
  source_commit_sha text not null check (
    source_commit_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'
  ),
  source_revision text not null check (source_revision ~ '^[a-f0-9]{64}$'),
  payload_checksum text not null check (payload_checksum ~ '^[a-f0-9]{64}$'),
  synced_at timestamptz not null default now(),
  sync_run_id bigint references public.content_sync_runs(id) on delete restrict
);

alter table public.content_store_state enable row level security;

drop policy if exists "Content admins read store state"
  on public.content_store_state;
create policy "Content admins read store state"
on public.content_store_state for select to authenticated
using ((select public.is_content_admin()));

revoke all on table public.content_store_state from public, anon, authenticated;
grant select on table public.content_store_state to authenticated;

create or replace view public.content_current_lessons
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
  lesson.manifest_order
from public.content_lessons as lesson
join public.content_lesson_revisions as revision
  on revision.lesson_id = lesson.id
  and revision.source_hash = lesson.current_source_hash;

revoke all on table public.content_current_lessons
  from public, anon, authenticated;
grant select on table public.content_current_lessons to authenticated;

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
  question.updated_at,
  question.manifest_order
from public.content_questions as question
join public.content_question_revisions as revision
  on revision.question_id = question.id
  and revision.version = question.current_version
join public.content_lessons as lesson
  on lesson.id = question.lesson_id;

revoke all on table public.content_current_questions
  from public, anon, authenticated;
grant select on table public.content_current_questions to authenticated;

create or replace function public.sync_content_question_bank(
  p_manifest jsonb,
  p_repository text,
  p_github_run_id text default null,
  p_delivery_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_commit_sha text;
  v_source_revision text;
  v_payload_checksum text;
  v_expected_lessons integer;
  v_expected_questions integer;
  v_sync_run_id bigint;
  v_existing_status text;
  v_existing_summary jsonb;
  v_lesson jsonb;
  v_question_item jsonb;
  v_question jsonb;
  v_position bigint;
  v_lifecycle_status text;
  v_existing_lesson_id text;
  v_existing_checksum text;
  v_lesson_revision_id bigint;
  v_previous_version integer;
  v_previous_status text;
  v_summary jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('cpp-recall-content-question-bank-sync')
  );

  if jsonb_typeof(p_manifest) <> 'object'
    or (p_manifest ->> 'schemaVersion')::integer <> 1
    or jsonb_typeof(p_manifest -> 'lessons') <> 'array'
    or jsonb_typeof(p_manifest -> 'questions') <> 'array' then
    raise exception 'Invalid content sync payload';
  end if;
  if char_length(btrim(p_repository)) = 0 then
    raise exception 'Repository is required';
  end if;

  v_source_commit_sha := p_manifest ->> 'sourceCommitSha';
  v_source_revision := p_manifest ->> 'manifestSourceRevision';
  v_payload_checksum := p_manifest #>> '{expected,payloadChecksum}';
  v_expected_lessons := (p_manifest #>> '{expected,lessons}')::integer;
  v_expected_questions := (p_manifest #>> '{expected,questions}')::integer;

  if v_source_commit_sha !~ '^[a-f0-9]{40}([a-f0-9]{24})?$'
    or v_source_revision !~ '^[a-f0-9]{64}$'
    or v_payload_checksum !~ '^[a-f0-9]{64}$'
    or v_expected_lessons is distinct from jsonb_array_length(p_manifest -> 'lessons')
    or v_expected_questions is distinct from jsonb_array_length(p_manifest -> 'questions') then
    raise exception 'Content sync payload metadata does not match its contents';
  end if;

  select run.status, run.summary
  into v_existing_status, v_existing_summary
  from public.content_sync_runs as run
  where run.repository = p_repository
    and run.source_commit_sha = v_source_commit_sha;
  if found and v_existing_status = 'completed' then
    return coalesce(v_existing_summary, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'idempotent', true
    );
  end if;

  insert into public.content_sync_runs (
    repository,
    source_commit_sha,
    github_run_id,
    delivery_id,
    status
  ) values (
    p_repository,
    v_source_commit_sha,
    p_github_run_id,
    p_delivery_id,
    'running'
  )
  on conflict (repository, source_commit_sha) do update
  set github_run_id = excluded.github_run_id,
      delivery_id = coalesce(excluded.delivery_id, public.content_sync_runs.delivery_id),
      status = 'running',
      last_error = null,
      completed_at = null
  returning id into v_sync_run_id;

  for v_lesson, v_position in
    select item.value, item.ordinality
    from jsonb_array_elements(p_manifest -> 'lessons')
      with ordinality as item(value, ordinality)
  loop
    if (v_lesson ->> 'id') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or (v_lesson ->> 'sourceHash') !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid lesson identity in sync payload';
    end if;

    insert into public.content_lessons (
      id,
      lifecycle_status,
      archived_at,
      manifest_order,
      current_source_path,
      current_standard,
      current_lesson_order,
      current_tags,
      current_prerequisites
    ) values (
      v_lesson ->> 'id',
      'active',
      null,
      v_position::integer,
      v_lesson ->> 'sourcePath',
      v_lesson ->> 'standard',
      (v_lesson ->> 'order')::integer,
      v_lesson -> 'tags',
      coalesce(v_lesson -> 'prerequisites', '[]'::jsonb)
    )
    on conflict (id) do update
    set manifest_order = excluded.manifest_order,
        current_source_path = excluded.current_source_path,
        current_standard = excluded.current_standard,
        current_lesson_order = excluded.current_lesson_order,
        current_tags = excluded.current_tags,
        current_prerequisites = excluded.current_prerequisites;

    insert into public.content_lesson_revisions (
      lesson_id,
      source_hash,
      source_commit_sha,
      source_path,
      standard,
      lesson_order,
      title,
      tags,
      prerequisites,
      knowledge_markdown,
      code,
      sections,
      checklist_items,
      imported_from
    ) values (
      v_lesson ->> 'id',
      v_lesson ->> 'sourceHash',
      v_source_commit_sha,
      v_lesson ->> 'sourcePath',
      v_lesson ->> 'standard',
      (v_lesson ->> 'order')::integer,
      v_lesson ->> 'title',
      v_lesson -> 'tags',
      coalesce(v_lesson -> 'prerequisites', '[]'::jsonb),
      v_lesson ->> 'knowledgeMarkdown',
      v_lesson ->> 'code',
      v_lesson -> 'sections',
      coalesce(v_lesson -> 'checklistItems', '[]'::jsonb),
      'git'
    )
    on conflict (lesson_id, source_hash) do nothing;

    if not exists (
      select 1
      from public.content_lesson_revisions as revision
      where revision.lesson_id = v_lesson ->> 'id'
        and revision.source_hash = v_lesson ->> 'sourceHash'
        and revision.title = v_lesson ->> 'title'
        and replace(
          replace(revision.knowledge_markdown, E'\r\n', E'\n'),
          E'\r',
          E'\n'
        ) = replace(
          replace(v_lesson ->> 'knowledgeMarkdown', E'\r\n', E'\n'),
          E'\r',
          E'\n'
        )
        and revision.code is not distinct from (v_lesson ->> 'code')
        and revision.sections = v_lesson -> 'sections'
        and revision.checklist_items = coalesce(
          v_lesson -> 'checklistItems',
          '[]'::jsonb
        )
    ) then
      raise exception 'Lesson revision conflict for %', v_lesson ->> 'id';
    end if;

    update public.content_lessons
    set current_source_hash = v_lesson ->> 'sourceHash',
        lifecycle_status = 'active',
        archived_at = null,
        manifest_order = v_position::integer,
        current_source_path = v_lesson ->> 'sourcePath',
        current_standard = v_lesson ->> 'standard',
        current_lesson_order = (v_lesson ->> 'order')::integer,
        current_tags = v_lesson -> 'tags',
        current_prerequisites = coalesce(
          v_lesson -> 'prerequisites',
          '[]'::jsonb
        )
    where id = v_lesson ->> 'id';
  end loop;

  update public.content_lessons as lesson
  set lifecycle_status = 'archived',
      archived_at = coalesce(lesson.archived_at, now()),
      manifest_order = null
  where lesson.lifecycle_status <> 'archived'
    and not exists (
      select 1
      from jsonb_array_elements(p_manifest -> 'lessons') as payload(item)
      where payload.item ->> 'id' = lesson.id
    );

  for v_question_item, v_position in
    select item.value, item.ordinality
    from jsonb_array_elements(p_manifest -> 'questions')
      with ordinality as item(value, ordinality)
  loop
    v_question := v_question_item -> 'base';
    v_lifecycle_status := v_question_item ->> 'lifecycleStatus';
    if v_lifecycle_status not in ('draft', 'verified', 'archived')
      or (v_question ->> 'id') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or (v_question ->> 'sourceHash') !~ '^[a-f0-9]{64}$'
      or (v_question_item ->> 'contentChecksum') !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid question identity in sync payload';
    end if;

    select question.lesson_id, question.current_version, question.lifecycle_status
    into v_existing_lesson_id, v_previous_version, v_previous_status
    from public.content_questions as question
    where question.id = v_question ->> 'id';

    insert into public.content_questions (
      id,
      lesson_id,
      lifecycle_status,
      origin,
      archived_at,
      manifest_order
    ) values (
      v_question ->> 'id',
      v_question ->> 'lessonId',
      v_lifecycle_status,
      v_question_item ->> 'origin',
      case when v_lifecycle_status = 'archived' then now() else null end,
      v_position::integer
    )
    on conflict (id) do nothing;

    select question.lesson_id
    into v_existing_lesson_id
    from public.content_questions as question
    where question.id = v_question ->> 'id';
    if v_existing_lesson_id is distinct from (v_question ->> 'lessonId') then
      raise exception 'Question % belongs to another lesson', v_question ->> 'id';
    end if;

    select revision.id
    into v_lesson_revision_id
    from public.content_lesson_revisions as revision
    where revision.lesson_id = v_question ->> 'lessonId'
      and revision.source_hash = v_question ->> 'sourceHash';

    insert into public.content_question_revisions (
      question_id,
      lesson_id,
      version,
      lesson_revision_id,
      source_hash,
      source_commit_sha,
      type,
      response_mode,
      difficulty,
      estimated_minutes,
      prompt,
      code,
      hint,
      answer,
      rubric,
      sources,
      taxonomy,
      content_checksum
    ) values (
      v_question ->> 'id',
      v_question ->> 'lessonId',
      (v_question ->> 'version')::integer,
      v_lesson_revision_id,
      v_question ->> 'sourceHash',
      case when v_lesson_revision_id is null then null else v_source_commit_sha end,
      v_question ->> 'type',
      coalesce(v_question ->> 'responseMode', 'text'),
      v_question ->> 'difficulty',
      (v_question ->> 'estimatedMinutes')::integer,
      v_question ->> 'prompt',
      v_question ->> 'code',
      v_question ->> 'hint',
      v_question -> 'answer',
      v_question -> 'rubric',
      v_question -> 'sources',
      v_question -> 'taxonomy',
      v_question_item ->> 'contentChecksum'
    )
    on conflict (question_id, version) do nothing;

    select revision.content_checksum
    into v_existing_checksum
    from public.content_question_revisions as revision
    where revision.question_id = v_question ->> 'id'
      and revision.version = (v_question ->> 'version')::integer;
    if v_existing_checksum is distinct from (v_question_item ->> 'contentChecksum') then
      raise exception 'Question revision conflict for % v%',
        v_question ->> 'id',
        v_question ->> 'version';
    end if;

    update public.content_questions
    set current_version = (v_question ->> 'version')::integer,
        lifecycle_status = v_lifecycle_status,
        archived_at = case
          when v_lifecycle_status = 'archived' then coalesce(archived_at, now())
          else null
        end,
        manifest_order = v_position::integer
    where id = v_question ->> 'id';

    if v_previous_version is null
      or v_previous_version is distinct from (v_question ->> 'version')::integer then
      insert into public.content_question_events (
        question_id,
        event_type,
        from_version,
        to_version,
        sync_run_id,
        metadata
      ) values (
        v_question ->> 'id',
        'imported',
        v_previous_version,
        (v_question ->> 'version')::integer,
        v_sync_run_id,
        jsonb_build_object(
          'source', 'repository-sync',
          'sourceCommitSha', v_source_commit_sha
        )
      );
    elsif v_previous_status is distinct from v_lifecycle_status then
      insert into public.content_question_events (
        question_id,
        event_type,
        from_version,
        to_version,
        sync_run_id,
        metadata
      ) values (
        v_question ->> 'id',
        case
          when v_lifecycle_status = 'archived' then 'archived'
          when v_lifecycle_status = 'verified' then 'approved'
          else 'restored'
        end,
        v_previous_version,
        (v_question ->> 'version')::integer,
        v_sync_run_id,
        jsonb_build_object('source', 'repository-sync')
      );
    end if;
  end loop;

  insert into public.content_question_events (
    question_id,
    event_type,
    from_version,
    to_version,
    sync_run_id,
    metadata
  )
  select
    question.id,
    'archived',
    question.current_version,
    question.current_version,
    v_sync_run_id,
    jsonb_build_object('source', 'repository-sync', 'reason', 'missing-from-manifest')
  from public.content_questions as question
  where question.lifecycle_status <> 'archived'
    and not exists (
      select 1
      from jsonb_array_elements(p_manifest -> 'questions') as payload(item)
      where payload.item #>> '{base,id}' = question.id
    );

  update public.content_questions as question
  set lifecycle_status = 'archived',
      archived_at = coalesce(question.archived_at, now()),
      manifest_order = null
  where question.lifecycle_status <> 'archived'
    and not exists (
      select 1
      from jsonb_array_elements(p_manifest -> 'questions') as payload(item)
      where payload.item #>> '{base,id}' = question.id
    );

  insert into public.content_store_state (
    singleton,
    repository,
    source_commit_sha,
    source_revision,
    payload_checksum,
    synced_at,
    sync_run_id
  ) values (
    true,
    p_repository,
    v_source_commit_sha,
    v_source_revision,
    v_payload_checksum,
    now(),
    v_sync_run_id
  )
  on conflict (singleton) do update
  set repository = excluded.repository,
      source_commit_sha = excluded.source_commit_sha,
      source_revision = excluded.source_revision,
      payload_checksum = excluded.payload_checksum,
      synced_at = excluded.synced_at,
      sync_run_id = excluded.sync_run_id;

  v_summary := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'lessons', v_expected_lessons,
    'questions', v_expected_questions,
    'sourceCommitSha', v_source_commit_sha,
    'sourceRevision', v_source_revision,
    'payloadChecksum', v_payload_checksum
  );

  update public.content_sync_runs
  set status = 'completed',
      summary = v_summary,
      completed_at = now()
  where id = v_sync_run_id;

  return v_summary;
end;
$$;

revoke all on function public.sync_content_question_bank(jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.sync_content_question_bank(jsonb, text, text, text)
  to service_role;
