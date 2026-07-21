create extension if not exists pgcrypto with schema extensions;

create or replace function public.backfill_content_question_bank(
  p_manifest jsonb,
  p_admin_github_login text default 'tuanotuan'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson jsonb;
  v_item jsonb;
  v_question jsonb;
  v_override record;
  v_base_revision record;
  v_lesson_revision_id bigint;
  v_existing_lesson_id text;
  v_existing_checksum text;
  v_source_commit_sha text;
  v_lifecycle_status text;
  v_effective_version integer;
  v_taxonomy jsonb;
  v_tags jsonb;
  v_revision_document jsonb;
  v_checksum text;
  v_expected_lessons integer;
  v_expected_questions integer;
  v_imported_lessons integer;
  v_imported_questions integer;
  v_checksum_mismatches integer;
  v_missing_current_revisions integer;
  v_override_count integer;
  v_materialized_overrides integer;
begin
  if jsonb_typeof(p_manifest) <> 'object'
    or (p_manifest ->> 'schemaVersion')::integer <> 1
    or jsonb_typeof(p_manifest -> 'lessons') <> 'array'
    or jsonb_typeof(p_manifest -> 'questions') <> 'array' then
    raise exception 'Invalid content-bank backfill payload';
  end if;

  v_source_commit_sha := p_manifest ->> 'sourceCommitSha';
  if v_source_commit_sha is null
    or v_source_commit_sha !~ '^[a-f0-9]{40}([a-f0-9]{24})?$' then
    raise exception 'Invalid source Git commit SHA';
  end if;

  v_expected_lessons := (p_manifest #>> '{expected,lessons}')::integer;
  v_expected_questions := (p_manifest #>> '{expected,questions}')::integer;
  if v_expected_lessons is distinct from jsonb_array_length(p_manifest -> 'lessons')
    or v_expected_questions is distinct from jsonb_array_length(p_manifest -> 'questions')
    or (p_manifest #>> '{expected,payloadChecksum}')
      !~ '^[a-f0-9]{64}$' then
    raise exception 'Backfill payload count or checksum metadata is invalid';
  end if;

  insert into public.content_admins (user_id)
  select "user".id
  from auth.users as "user"
  where lower(coalesce("user".raw_user_meta_data ->> 'user_name', '')) =
    lower(btrim(p_admin_github_login))
  on conflict (user_id) do nothing;

  if not exists (
    select 1
    from public.content_admins as admin
    join auth.users as "user" on "user".id = admin.user_id
    where lower(coalesce("user".raw_user_meta_data ->> 'user_name', '')) =
      lower(btrim(p_admin_github_login))
  ) then
    raise exception 'No Supabase auth user found for GitHub login %', p_admin_github_login;
  end if;

  for v_lesson in
    select value
    from jsonb_array_elements(p_manifest -> 'lessons')
  loop
    if (v_lesson ->> 'id') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or (v_lesson ->> 'sourceHash') !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid lesson identity in backfill payload';
    end if;

    insert into public.content_lessons (
      id,
      lifecycle_status,
      archived_at
    ) values (
      v_lesson ->> 'id',
      'active',
      null
    )
    on conflict (id) do nothing;

    if exists (
      select 1
      from public.content_lessons as lesson
      where lesson.id = v_lesson ->> 'id'
        and lesson.current_source_hash is not null
        and lesson.current_source_hash <> v_lesson ->> 'sourceHash'
    ) then
      raise exception 'Lesson % already points at another source hash', v_lesson ->> 'id';
    end if;

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
      'legacy_import'
    )
    on conflict (lesson_id, source_hash) do nothing;

    if not exists (
      select 1
      from public.content_lesson_revisions as revision
      where revision.lesson_id = v_lesson ->> 'id'
        and revision.source_hash = v_lesson ->> 'sourceHash'
        and revision.source_path = v_lesson ->> 'sourcePath'
        and revision.standard = v_lesson ->> 'standard'
        and revision.lesson_order = (v_lesson ->> 'order')::integer
        and revision.title = v_lesson ->> 'title'
        and revision.tags = v_lesson -> 'tags'
        and revision.prerequisites = coalesce(v_lesson -> 'prerequisites', '[]'::jsonb)
        and revision.knowledge_markdown = v_lesson ->> 'knowledgeMarkdown'
        and revision.code is not distinct from (v_lesson ->> 'code')
        and revision.sections = v_lesson -> 'sections'
        and revision.checklist_items = coalesce(
          v_lesson -> 'checklistItems',
          '[]'::jsonb
        )
    ) then
      raise exception 'Lesson revision checksum conflict for %', v_lesson ->> 'id';
    end if;

    update public.content_lessons
    set current_source_hash = v_lesson ->> 'sourceHash',
        lifecycle_status = 'active',
        archived_at = null
    where id = v_lesson ->> 'id';
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(p_manifest -> 'questions')
  loop
    v_question := v_item -> 'base';
    v_lifecycle_status := v_item ->> 'lifecycleStatus';
    if v_lifecycle_status not in ('draft', 'verified', 'archived')
      or (v_question ->> 'id') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or (v_question ->> 'sourceHash') !~ '^[a-f0-9]{64}$'
      or (v_item ->> 'contentChecksum') !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid question identity in backfill payload';
    end if;

    insert into public.content_questions (
      id,
      lesson_id,
      lifecycle_status,
      origin,
      archived_at
    ) values (
      v_question ->> 'id',
      v_question ->> 'lessonId',
      v_lifecycle_status,
      v_item ->> 'origin',
      case when v_lifecycle_status = 'archived' then now() else null end
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
      v_item ->> 'contentChecksum'
    )
    on conflict (question_id, version) do nothing;

    select revision.content_checksum
    into v_existing_checksum
    from public.content_question_revisions as revision
    where revision.question_id = v_question ->> 'id'
      and revision.version = (v_question ->> 'version')::integer;
    if v_existing_checksum is distinct from (v_item ->> 'contentChecksum') then
      raise exception 'Question revision checksum conflict for % v%',
        v_question ->> 'id',
        v_question ->> 'version';
    end if;

    update public.content_questions
    set current_version = (v_question ->> 'version')::integer,
        lifecycle_status = v_lifecycle_status,
        archived_at = case when v_lifecycle_status = 'archived' then now() else null end
    where id = v_question ->> 'id'
      and current_version is null;

    insert into public.content_question_events (
      question_id,
      event_type,
      to_version,
      metadata
    )
    select
      v_question ->> 'id',
      'imported',
      (v_question ->> 'version')::integer,
      jsonb_build_object(
        'source', 'repository-backfill',
        'sourceCommitSha', v_source_commit_sha
      )
    where not exists (
      select 1
      from public.content_question_events as event
      where event.question_id = v_question ->> 'id'
        and event.event_type = 'imported'
        and event.to_version = (v_question ->> 'version')::integer
    );
  end loop;

  for v_override in
    select override.*
    from public.question_overrides as override
    join public.content_admins as admin on admin.user_id = override.user_id
    order by override.question_id
  loop
    select
      revision.*
    into v_base_revision
    from public.content_question_revisions as revision
    where revision.question_id = v_override.question_id
      and revision.version = v_override.base_question_version;
    if not found then
      raise exception 'Override for % has no imported base revision v%',
        v_override.question_id,
        v_override.base_question_version;
    end if;

    if v_override.is_edited then
      v_effective_version := greatest(
        v_override.question_version,
        v_override.base_question_version + 1
      );
      v_taxonomy := v_base_revision.taxonomy || jsonb_build_object(
        'skill', v_override.content ->> 'type',
        'difficulty', v_override.content ->> 'difficulty',
        'responseMode', coalesce(v_override.content ->> 'responseMode', 'text')
      );
      select coalesce(
        jsonb_agg(
          case
            when tag.value like 'skill::%' then
              'skill::' || (v_override.content ->> 'type')
            when tag.value like 'difficulty::%' then
              'difficulty::' || (v_override.content ->> 'difficulty')
            when tag.value like 'response::%' then
              'response::' || coalesce(v_override.content ->> 'responseMode', 'text')
            else tag.value
          end
          order by tag.ordinality
        ),
        '[]'::jsonb
      )
      into v_tags
      from jsonb_array_elements_text(v_base_revision.taxonomy -> 'tags')
        with ordinality as tag(value, ordinality);
      v_taxonomy := jsonb_set(v_taxonomy, '{tags}', v_tags, true);

      select revision.id
      into v_lesson_revision_id
      from public.content_lesson_revisions as revision
      where revision.lesson_id = v_base_revision.lesson_id
        and revision.source_hash = v_override.source_hash;

      v_revision_document := jsonb_build_object(
        'type', v_override.content ->> 'type',
        'responseMode', coalesce(v_override.content ->> 'responseMode', 'text'),
        'difficulty', v_override.content ->> 'difficulty',
        'estimatedMinutes', (v_override.content ->> 'estimatedMinutes')::integer,
        'prompt', v_override.content ->> 'prompt',
        'code', v_override.content -> 'code',
        'hint', v_override.content ->> 'hint',
        'answer', v_override.content -> 'answer',
        'rubric', v_override.content -> 'rubric',
        'sources', v_base_revision.sources,
        'taxonomy', v_taxonomy,
        'sourceHash', v_override.source_hash
      );
      v_checksum := encode(
        extensions.digest(convert_to(v_revision_document::text, 'UTF8'), 'sha256'),
        'hex'
      );

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
        content_checksum,
        created_by
      ) values (
        v_override.question_id,
        v_base_revision.lesson_id,
        v_effective_version,
        v_lesson_revision_id,
        v_override.source_hash,
        case when v_lesson_revision_id is null then null else v_source_commit_sha end,
        v_override.content ->> 'type',
        coalesce(v_override.content ->> 'responseMode', 'text'),
        v_override.content ->> 'difficulty',
        (v_override.content ->> 'estimatedMinutes')::integer,
        v_override.content ->> 'prompt',
        v_override.content ->> 'code',
        v_override.content ->> 'hint',
        v_override.content -> 'answer',
        v_override.content -> 'rubric',
        v_base_revision.sources,
        v_taxonomy,
        v_checksum,
        v_override.user_id
      )
      on conflict (question_id, version) do nothing;

      select revision.content_checksum
      into v_existing_checksum
      from public.content_question_revisions as revision
      where revision.question_id = v_override.question_id
        and revision.version = v_effective_version;
      if v_existing_checksum is distinct from v_checksum then
        raise exception 'Override revision checksum conflict for % v%',
          v_override.question_id,
          v_effective_version;
      end if;

      update public.content_questions
      set current_version = v_effective_version,
          lifecycle_status = case
            when v_override.is_archived then 'archived'
            else 'draft'
          end,
          archived_at = case
            when v_override.is_archived then coalesce(archived_at, now())
            else null
          end
      where id = v_override.question_id
        and (current_version is null or current_version <= v_effective_version);

      insert into public.content_question_events (
        question_id,
        event_type,
        from_version,
        to_version,
        actor_user_id,
        metadata
      )
      select
        v_override.question_id,
        'edited',
        v_override.base_question_version,
        v_effective_version,
        v_override.user_id,
        jsonb_build_object('source', 'question-overrides-backfill')
      where not exists (
        select 1
        from public.content_question_events as event
        where event.question_id = v_override.question_id
          and event.event_type = 'edited'
          and event.to_version = v_effective_version
      );
    elsif v_override.is_archived then
      update public.content_questions
      set lifecycle_status = 'archived',
          archived_at = coalesce(archived_at, now())
      where id = v_override.question_id;
    end if;

    if v_override.is_archived then
      insert into public.content_question_events (
        question_id,
        event_type,
        from_version,
        to_version,
        actor_user_id,
        metadata
      )
      select
        v_override.question_id,
        'archived',
        question.current_version,
        question.current_version,
        v_override.user_id,
        jsonb_build_object('source', 'question-overrides-backfill')
      from public.content_questions as question
      where question.id = v_override.question_id
        and not exists (
          select 1
          from public.content_question_events as event
          where event.question_id = v_override.question_id
            and event.event_type = 'archived'
            and event.to_version = question.current_version
        );
    end if;
  end loop;

  select count(*)::integer
  into v_imported_lessons
  from public.content_lessons as lesson
  where exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'lessons') as payload(item)
    where payload.item ->> 'id' = lesson.id
      and payload.item ->> 'sourceHash' = lesson.current_source_hash
  );

  select count(*)::integer
  into v_imported_questions
  from public.content_questions as question
  where exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'questions') as payload(item)
    where payload.item #>> '{base,id}' = question.id
  );

  select count(*)::integer
  into v_checksum_mismatches
  from jsonb_array_elements(p_manifest -> 'questions') as payload(item)
  left join public.content_question_revisions as revision
    on revision.question_id = payload.item #>> '{base,id}'
    and revision.version = (payload.item #>> '{base,version}')::integer
  where revision.content_checksum is distinct from
    (payload.item ->> 'contentChecksum');

  select count(*)::integer
  into v_missing_current_revisions
  from public.content_questions as question
  where exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'questions') as payload(item)
    where payload.item #>> '{base,id}' = question.id
  )
    and not exists (
      select 1
      from public.content_question_revisions as revision
      where revision.question_id = question.id
        and revision.version = question.current_version
    );

  select count(*)::integer
  into v_override_count
  from public.question_overrides as override
  join public.content_admins as admin on admin.user_id = override.user_id
  where exists (
    select 1
    from public.content_questions as question
    where question.id = override.question_id
  );

  select count(*)::integer
  into v_materialized_overrides
  from public.question_overrides as override
  join public.content_admins as admin on admin.user_id = override.user_id
  join public.content_questions as question on question.id = override.question_id
  where (
    override.is_edited
    and question.current_version >= override.question_version
    and exists (
      select 1
      from public.content_question_revisions as revision
      where revision.question_id = override.question_id
        and revision.version = greatest(
          override.question_version,
          override.base_question_version + 1
        )
    )
  ) or (
    not override.is_edited
    and (
      not override.is_archived
      or question.lifecycle_status = 'archived'
    )
  );

  return jsonb_build_object(
    'ok',
      v_imported_lessons = v_expected_lessons
      and v_imported_questions = v_expected_questions
      and v_checksum_mismatches = 0
      and v_missing_current_revisions = 0
      and v_materialized_overrides = v_override_count,
    'sourceCommitSha', v_source_commit_sha,
    'payloadChecksum', p_manifest #>> '{expected,payloadChecksum}',
    'lessons', jsonb_build_object(
      'expected', v_expected_lessons,
      'imported', v_imported_lessons
    ),
    'questions', jsonb_build_object(
      'expected', v_expected_questions,
      'imported', v_imported_questions,
      'checksumMismatches', v_checksum_mismatches,
      'missingCurrentRevisions', v_missing_current_revisions
    ),
    'overrides', jsonb_build_object(
      'expected', v_override_count,
      'materialized', v_materialized_overrides
    )
  );
end;
$$;

revoke all on function public.backfill_content_question_bank(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.backfill_content_question_bank(jsonb, text)
  to service_role;
