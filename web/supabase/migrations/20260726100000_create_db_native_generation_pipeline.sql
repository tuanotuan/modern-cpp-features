alter table public.content_questions
  add column if not exists storage_owner text not null default 'repository'
  check (storage_owner in ('repository', 'database'));

create index if not exists content_questions_owner_lesson_idx
  on public.content_questions (storage_owner, lesson_id, lifecycle_status);

create or replace function public.protect_database_question_from_repo_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.storage_owner is distinct from new.storage_owner then
    raise exception 'Question storage ownership is immutable';
  end if;
  if old.storage_owner = 'database'
    and old.lifecycle_status <> 'archived'
    and new.lifecycle_status = 'archived'
    and new.manifest_order is null then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists content_questions_protect_database_owner
  on public.content_questions;
create trigger content_questions_protect_database_owner
before update of lifecycle_status, manifest_order, storage_owner on public.content_questions
for each row execute function public.protect_database_question_from_repo_archive();

create or replace function public.suppress_database_question_repo_archive_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type = 'archived'
    and new.metadata ->> 'source' = 'repository-sync'
    and new.metadata ->> 'reason' = 'missing-from-manifest'
    and exists (
      select 1
      from public.content_questions as question
      where question.id = new.question_id
        and question.storage_owner = 'database'
    ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists content_question_events_suppress_database_archive
  on public.content_question_events;
create trigger content_question_events_suppress_database_archive
before insert on public.content_question_events
for each row execute function public.suppress_database_question_repo_archive_event();

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
  question.manifest_order,
  question.storage_owner
from public.content_questions as question
join public.content_question_revisions as revision
  on revision.question_id = question.id
  and revision.version = question.current_version
join public.content_lessons as lesson
  on lesson.id = question.lesson_id;

revoke all on table public.content_current_questions
  from public, anon, authenticated;
grant select on table public.content_current_questions to authenticated;

create or replace view public.content_current_repository_questions
with (security_invoker = true)
as
select *
from public.content_current_questions
where storage_owner = 'repository';

revoke all on table public.content_current_repository_questions
  from public, anon, authenticated;
grant select on table public.content_current_repository_questions to authenticated;

create or replace function public.enqueue_content_generation_jobs(
  p_generator_version text,
  p_provider text,
  p_model text,
  p_requested_count integer default 2,
  p_github_run_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enqueued integer;
begin
  if char_length(btrim(p_generator_version)) = 0
    or char_length(btrim(p_provider)) = 0
    or char_length(btrim(p_model)) = 0
    or p_requested_count not between 1 and 5 then
    raise exception 'Invalid generation job configuration';
  end if;

  insert into public.content_generation_jobs (
    lesson_revision_id,
    lesson_id,
    source_hash,
    generator_version,
    provider,
    model,
    requested_count,
    status,
    next_attempt_at,
    github_run_id
  )
  select
    revision.id,
    lesson.id,
    lesson.current_source_hash,
    p_generator_version,
    p_provider,
    p_model,
    p_requested_count,
    'pending',
    now(),
    p_github_run_id
  from public.content_lessons as lesson
  join public.content_lesson_revisions as revision
    on revision.lesson_id = lesson.id
    and revision.source_hash = lesson.current_source_hash
  where lesson.lifecycle_status = 'active'
    and lesson.current_source_hash is not null
    and not exists (
      select 1
      from public.content_questions as question
      join public.content_question_revisions as question_revision
        on question_revision.question_id = question.id
        and question_revision.version = question.current_version
      where question.lesson_id = lesson.id
        and question.lifecycle_status <> 'archived'
        and question_revision.source_hash = lesson.current_source_hash
    )
  on conflict (lesson_id, source_hash, generator_version) do nothing;

  get diagnostics v_enqueued = row_count;
  return jsonb_build_object('ok', true, 'enqueued', v_enqueued);
end;
$$;

create or replace function public.claim_content_generation_job(
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.content_generation_jobs%rowtype;
begin
  if p_lease_seconds not between 60 and 1800 then
    raise exception 'Lease must be between 60 and 1800 seconds';
  end if;

  update public.content_generation_jobs as job
  set status = 'completed',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = jsonb_build_object('code', 'stale_source')
  where job.status in ('pending', 'deferred')
    and exists (
      select 1
      from public.content_lessons as lesson
      where lesson.id = job.lesson_id
        and (
          lesson.lifecycle_status <> 'active'
          or lesson.current_source_hash is distinct from job.source_hash
        )
    );

  update public.content_generation_jobs
  set status = case
        when attempt_count >= 5 then 'dead_letter'
        else 'deferred'
      end,
      next_attempt_at = case
        when attempt_count >= 5 then next_attempt_at
        else now()
      end,
      lease_token = null,
      lease_expires_at = null,
      last_error = coalesce(last_error, '{}'::jsonb) || jsonb_build_object(
        'code', 'lease_expired',
        'at', now()
      )
  where status = 'running'
    and lease_expires_at <= now();

  with candidate as (
    select job.id
    from public.content_generation_jobs as job
    where job.status in ('pending', 'deferred')
      and job.next_attempt_at <= now()
      and job.attempt_count < 5
    order by job.next_attempt_at, job.id
    for update skip locked
    limit 1
  )
  update public.content_generation_jobs as job
  set status = 'running',
      attempt_count = job.attempt_count + 1,
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error = null
  from candidate
  where job.id = candidate.id
  returning job.* into v_job;

  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_job.id,
    'lessonId', v_job.lesson_id,
    'sourceHash', v_job.source_hash,
    'requestedCount', v_job.requested_count,
    'attemptCount', v_job.attempt_count,
    'leaseToken', v_job.lease_token,
    'leaseExpiresAt', v_job.lease_expires_at
  );
end;
$$;

create or replace function public.complete_content_generation_job(
  p_job_id bigint,
  p_lease_token uuid,
  p_drafts jsonb,
  p_provider text,
  p_model text,
  p_prompt_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.content_generation_jobs%rowtype;
  v_lesson public.content_lessons%rowtype;
  v_draft jsonb;
  v_position bigint;
  v_next_suffix integer;
  v_manifest_order integer;
  v_question_id text;
  v_ids jsonb := '[]'::jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('cpp-recall-db-question-generation')
  );

  select * into v_job
  from public.content_generation_jobs
  where id = p_job_id
  for update;
  if not found
    or v_job.status <> 'running'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= now() then
    raise exception 'Generation job lease is invalid or expired';
  end if;
  if jsonb_typeof(p_drafts) <> 'array'
    or jsonb_array_length(p_drafts) <> v_job.requested_count then
    raise exception 'Generation result count does not match the job';
  end if;

  select * into v_lesson
  from public.content_lessons
  where id = v_job.lesson_id
  for update;
  if not found or v_lesson.lifecycle_status <> 'active'
    or v_lesson.current_source_hash is distinct from v_job.source_hash then
    update public.content_generation_jobs
    set status = 'completed',
        completed_at = now(),
        lease_token = null,
        lease_expires_at = null,
        last_error = jsonb_build_object('code', 'stale_source')
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'stale', true, 'questionIds', v_ids);
  end if;

  select coalesce(max(
    (substring(question.id from ('^' || v_job.lesson_id || '-ai-([0-9]+)$')))::integer
  ), 0)
  into v_next_suffix
  from public.content_questions as question
  where question.id ~ ('^' || v_job.lesson_id || '-ai-[0-9]+$');

  select greatest(1000000, coalesce(max(question.manifest_order), 0))
  into v_manifest_order
  from public.content_questions as question;

  for v_draft, v_position in
    select item.value, item.ordinality
    from jsonb_array_elements(p_drafts)
      with ordinality as item(value, ordinality)
  loop
    if (v_draft ->> 'contentChecksum') !~ '^[a-f0-9]{64}$'
      or (v_draft ->> 'type') not in ('recall', 'code_reasoning', 'pitfall', 'scenario')
      or coalesce(v_draft ->> 'responseMode', 'text') not in ('text', 'code')
      or (v_draft ->> 'difficulty') not in ('beginner', 'intermediate', 'advanced')
      or jsonb_typeof(v_draft -> 'sources') <> 'array'
      or jsonb_typeof(v_draft -> 'taxonomy') <> 'object' then
      raise exception 'Invalid generated question document';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_draft -> 'sources') as source(item)
      where not exists (
        select 1
        from public.content_lesson_revisions as revision,
          jsonb_array_elements(revision.sections) as section(item)
        where revision.id = v_job.lesson_revision_id
          and section.item ->> 'id' = source.item ->> 'sectionId'
      )
    ) then
      raise exception 'Generated question cites an unknown lesson section';
    end if;

    v_question_id := v_job.lesson_id || '-ai-' ||
      lpad((v_next_suffix + v_position)::text, 3, '0');

    insert into public.content_questions (
      id,
      lesson_id,
      lifecycle_status,
      origin,
      archived_at,
      manifest_order,
      storage_owner
    ) values (
      v_question_id,
      v_job.lesson_id,
      'draft',
      'generated',
      null,
      v_manifest_order + v_position::integer,
      'database'
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
      generator_provider,
      generator_model,
      generator_prompt_version
    ) values (
      v_question_id,
      v_job.lesson_id,
      1,
      v_job.lesson_revision_id,
      v_job.source_hash,
      (
        select revision.source_commit_sha
        from public.content_lesson_revisions as revision
        where revision.id = v_job.lesson_revision_id
      ),
      v_draft ->> 'type',
      coalesce(v_draft ->> 'responseMode', 'text'),
      v_draft ->> 'difficulty',
      (v_draft ->> 'estimatedMinutes')::integer,
      v_draft ->> 'prompt',
      v_draft ->> 'code',
      v_draft ->> 'hint',
      v_draft -> 'answer',
      v_draft -> 'rubric',
      v_draft -> 'sources',
      v_draft -> 'taxonomy',
      v_draft ->> 'contentChecksum',
      p_provider,
      p_model,
      p_prompt_version
    );

    update public.content_questions
    set current_version = 1
    where id = v_question_id;

    insert into public.content_question_events (
      question_id,
      event_type,
      to_version,
      sync_run_id,
      metadata
    ) values (
      v_question_id,
      'generated',
      1,
      null,
      jsonb_build_object(
        'generationJobId', v_job.id,
        'provider', p_provider,
        'model', p_model,
        'promptVersion', p_prompt_version
      )
    );
    v_ids := v_ids || jsonb_build_array(v_question_id);
  end loop;

  update public.content_generation_jobs
  set status = 'completed',
      provider = p_provider,
      model = p_model,
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null
  where id = v_job.id;

  return jsonb_build_object(
    'ok', true,
    'stale', false,
    'questionIds', v_ids
  );
end;
$$;

create or replace function public.fail_content_generation_job(
  p_job_id bigint,
  p_lease_token uuid,
  p_error jsonb,
  p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.content_generation_jobs%rowtype;
  v_status text;
  v_next_attempt_at timestamptz;
begin
  if jsonb_typeof(p_error) <> 'object' then
    raise exception 'Generation error must be a JSON object';
  end if;
  select * into v_job
  from public.content_generation_jobs
  where id = p_job_id
  for update;
  if not found or v_job.status <> 'running'
    or v_job.lease_token is distinct from p_lease_token then
    raise exception 'Generation job lease is invalid';
  end if;

  if p_retryable and v_job.attempt_count < 5 then
    v_status := 'deferred';
    v_next_attempt_at := now() + make_interval(
      mins => least(360, (5 * power(2, greatest(0, v_job.attempt_count - 1)))::integer)
    );
  elsif p_retryable then
    v_status := 'dead_letter';
    v_next_attempt_at := v_job.next_attempt_at;
  else
    v_status := 'failed';
    v_next_attempt_at := v_job.next_attempt_at;
  end if;

  update public.content_generation_jobs
  set status = v_status,
      next_attempt_at = v_next_attempt_at,
      lease_token = null,
      lease_expires_at = null,
      last_error = p_error
  where id = v_job.id;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'nextAttemptAt', v_next_attempt_at
  );
end;
$$;

create or replace function public.retry_content_generation_job(p_job_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select public.is_content_admin()) then
    raise exception 'Content admin access required';
  end if;
  update public.content_generation_jobs
  set status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      completed_at = null
  where id = p_job_id
    and status in ('deferred', 'failed', 'dead_letter')
  returning status into v_status;
  if not found then
    raise exception 'Generation job is not retryable';
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

revoke all on function public.protect_database_question_from_repo_archive()
  from public, anon, authenticated;
revoke all on function public.suppress_database_question_repo_archive_event()
  from public, anon, authenticated;
revoke all on function public.enqueue_content_generation_jobs(text, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.claim_content_generation_job(integer)
  from public, anon, authenticated;
revoke all on function public.complete_content_generation_job(bigint, uuid, jsonb, text, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_content_generation_job(bigint, uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.retry_content_generation_job(bigint)
  from public, anon;

grant execute on function public.enqueue_content_generation_jobs(text, text, text, integer, text)
  to service_role;
grant execute on function public.claim_content_generation_job(integer)
  to service_role;
grant execute on function public.complete_content_generation_job(bigint, uuid, jsonb, text, text, text)
  to service_role;
grant execute on function public.fail_content_generation_job(bigint, uuid, jsonb, boolean)
  to service_role;
grant execute on function public.retry_content_generation_job(bigint)
  to authenticated;
