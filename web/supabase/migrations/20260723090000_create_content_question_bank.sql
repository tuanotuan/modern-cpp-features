create table if not exists public.content_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.content_lessons (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  current_source_hash text check (
    current_source_hash is null or current_source_hash ~ '^[a-f0-9]{64}$'
  ),
  lifecycle_status text not null default 'active' check (
    lifecycle_status in ('active', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (lifecycle_status = 'archived' and archived_at is not null)
    or (lifecycle_status = 'active' and archived_at is null)
  )
);

create table if not exists public.content_lesson_revisions (
  id bigint generated always as identity primary key,
  lesson_id text not null references public.content_lessons(id) on delete restrict,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_commit_sha text check (
    source_commit_sha is null
    or source_commit_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'
  ),
  source_path text not null check (char_length(btrim(source_path)) > 0),
  standard text not null check (standard in ('cpp98', 'cpp11', 'cpp20')),
  lesson_order integer not null check (lesson_order > 0),
  title text not null check (char_length(btrim(title)) > 0),
  tags jsonb not null check (jsonb_typeof(tags) = 'array'),
  prerequisites jsonb not null default '[]'::jsonb check (
    jsonb_typeof(prerequisites) = 'array'
  ),
  knowledge_markdown text not null,
  code text,
  sections jsonb not null check (jsonb_typeof(sections) = 'array'),
  checklist_items jsonb not null default '[]'::jsonb check (
    jsonb_typeof(checklist_items) = 'array'
  ),
  imported_from text not null default 'git' check (
    imported_from in ('git', 'legacy_import')
  ),
  created_at timestamptz not null default now(),
  unique (lesson_id, source_hash),
  unique (id, lesson_id, source_hash)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_lessons_current_revision_fk'
      and conrelid = 'public.content_lessons'::regclass
  ) then
    alter table public.content_lessons
      add constraint content_lessons_current_revision_fk
      foreign key (id, current_source_hash)
      references public.content_lesson_revisions (lesson_id, source_hash)
      deferrable initially deferred;
  end if;
end;
$$;

create table if not exists public.content_questions (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  lesson_id text not null references public.content_lessons(id) on delete restrict,
  current_version integer check (current_version is null or current_version > 0),
  lifecycle_status text not null default 'draft' check (
    lifecycle_status in ('draft', 'verified', 'archived')
  ),
  origin text not null default 'generated' check (
    origin in ('pilot', 'generated', 'admin', 'legacy_import')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (lifecycle_status = 'archived' and archived_at is not null)
    or (lifecycle_status <> 'archived' and archived_at is null)
  ),
  unique (id, lesson_id)
);

create table if not exists public.content_question_revisions (
  question_id text not null,
  lesson_id text not null,
  version integer not null check (version > 0),
  lesson_revision_id bigint,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_commit_sha text check (
    source_commit_sha is null
    or source_commit_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'
  ),
  type text not null check (type in ('recall', 'code_reasoning', 'pitfall', 'scenario')),
  response_mode text not null check (response_mode in ('text', 'code')),
  difficulty text not null check (
    difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  estimated_minutes integer not null check (estimated_minutes between 1 and 15),
  prompt text not null check (char_length(btrim(prompt)) >= 10),
  code text,
  hint text not null check (char_length(btrim(hint)) >= 5),
  answer jsonb not null check (jsonb_typeof(answer) = 'object'),
  rubric jsonb not null check (jsonb_typeof(rubric) = 'object'),
  sources jsonb not null check (jsonb_typeof(sources) = 'array'),
  taxonomy jsonb not null check (jsonb_typeof(taxonomy) = 'object'),
  content_checksum text not null check (content_checksum ~ '^[a-f0-9]{64}$'),
  generator_provider text,
  generator_model text,
  generator_prompt_version text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (question_id, version),
  foreign key (question_id, lesson_id)
    references public.content_questions (id, lesson_id) on delete restrict,
  foreign key (lesson_revision_id, lesson_id, source_hash)
    references public.content_lesson_revisions (id, lesson_id, source_hash)
    on delete restrict
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_questions_current_revision_fk'
      and conrelid = 'public.content_questions'::regclass
  ) then
    alter table public.content_questions
      add constraint content_questions_current_revision_fk
      foreign key (id, current_version)
      references public.content_question_revisions (question_id, version)
      deferrable initially deferred;
  end if;
end;
$$;

create table if not exists public.content_sync_runs (
  id bigint generated always as identity primary key,
  repository text not null check (char_length(btrim(repository)) > 0),
  source_commit_sha text not null check (
    source_commit_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'
  ),
  github_run_id text,
  delivery_id text unique,
  status text not null default 'running' check (
    status in ('running', 'completed', 'failed')
  ),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (repository, source_commit_sha)
);

create table if not exists public.content_generation_jobs (
  id bigint generated always as identity primary key,
  lesson_revision_id bigint not null,
  lesson_id text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  generator_version text not null check (char_length(btrim(generator_version)) > 0),
  provider text not null check (char_length(btrim(provider)) > 0),
  model text not null check (char_length(btrim(model)) > 0),
  requested_count integer not null default 2 check (requested_count between 1 and 5),
  status text not null default 'pending' check (
    status in ('pending', 'running', 'deferred', 'completed', 'failed', 'dead_letter')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  github_run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (lesson_id, source_hash, generator_version),
  foreign key (lesson_revision_id, lesson_id, source_hash)
    references public.content_lesson_revisions (id, lesson_id, source_hash)
    on delete restrict,
  check (
    (lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null)
  )
);

create table if not exists public.content_question_events (
  id bigint generated always as identity primary key,
  question_id text not null references public.content_questions(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'imported',
      'generated',
      'approved',
      'edited',
      'archived',
      'restored',
      'marked_needs_review'
    )
  ),
  from_version integer check (from_version is null or from_version > 0),
  to_version integer check (to_version is null or to_version > 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  sync_run_id bigint references public.content_sync_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists content_lessons_status_idx
  on public.content_lessons (lifecycle_status, updated_at desc);
create index if not exists content_lesson_revisions_commit_idx
  on public.content_lesson_revisions (source_commit_sha, lesson_id);
create index if not exists content_questions_lesson_status_idx
  on public.content_questions (lesson_id, lifecycle_status, updated_at desc);
create index if not exists content_question_revisions_source_idx
  on public.content_question_revisions (source_hash, question_id, version desc);
create index if not exists content_sync_runs_status_idx
  on public.content_sync_runs (status, started_at desc);
create index if not exists content_generation_jobs_claim_idx
  on public.content_generation_jobs (status, next_attempt_at, id)
  where status in ('pending', 'deferred');
create index if not exists content_question_events_question_idx
  on public.content_question_events (question_id, created_at desc);

drop trigger if exists content_lessons_set_updated_at on public.content_lessons;
create trigger content_lessons_set_updated_at
before update on public.content_lessons
for each row execute function public.set_updated_at();

drop trigger if exists content_questions_set_updated_at on public.content_questions;
create trigger content_questions_set_updated_at
before update on public.content_questions
for each row execute function public.set_updated_at();

drop trigger if exists content_sync_runs_set_updated_at on public.content_sync_runs;
create trigger content_sync_runs_set_updated_at
before update on public.content_sync_runs
for each row execute function public.set_updated_at();

drop trigger if exists content_generation_jobs_set_updated_at
  on public.content_generation_jobs;
create trigger content_generation_jobs_set_updated_at
before update on public.content_generation_jobs
for each row execute function public.set_updated_at();

create or replace function public.reject_content_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; create a new revision instead', tg_table_name;
end;
$$;

drop trigger if exists content_lesson_revisions_are_immutable
  on public.content_lesson_revisions;
create trigger content_lesson_revisions_are_immutable
before update or delete on public.content_lesson_revisions
for each row execute function public.reject_content_revision_mutation();

drop trigger if exists content_question_revisions_are_immutable
  on public.content_question_revisions;
create trigger content_question_revisions_are_immutable
before update or delete on public.content_question_revisions
for each row execute function public.reject_content_revision_mutation();

drop trigger if exists content_question_events_are_immutable
  on public.content_question_events;
create trigger content_question_events_are_immutable
before update or delete on public.content_question_events
for each row execute function public.reject_content_revision_mutation();

alter table public.content_admins enable row level security;
alter table public.content_lessons enable row level security;
alter table public.content_lesson_revisions enable row level security;
alter table public.content_questions enable row level security;
alter table public.content_question_revisions enable row level security;
alter table public.content_sync_runs enable row level security;
alter table public.content_generation_jobs enable row level security;
alter table public.content_question_events enable row level security;

create or replace function public.is_content_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_admins as admin
    where admin.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_content_admin() from public, anon;
grant execute on function public.is_content_admin() to authenticated;

drop policy if exists "Users read their own content admin membership"
  on public.content_admins;
create policy "Users read their own content admin membership"
on public.content_admins for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Authenticated users read content lessons"
  on public.content_lessons;
create policy "Authenticated users read content lessons"
on public.content_lessons for select to authenticated
using (lifecycle_status = 'active' or (select public.is_content_admin()));

drop policy if exists "Authenticated users read lesson revisions"
  on public.content_lesson_revisions;
create policy "Authenticated users read lesson revisions"
on public.content_lesson_revisions for select to authenticated
using (
  (select public.is_content_admin())
  or exists (
    select 1
    from public.content_lessons as lesson
    where lesson.id = content_lesson_revisions.lesson_id
      and lesson.lifecycle_status = 'active'
  )
);

drop policy if exists "Users read available content questions"
  on public.content_questions;
create policy "Users read available content questions"
on public.content_questions for select to authenticated
using (
  (select public.is_content_admin())
  or (
    lifecycle_status <> 'archived'
    and (
      lifecycle_status = 'verified'
      or exists (
        select 1
        from public.question_approvals as approval
        where approval.user_id = (select auth.uid())
          and approval.question_id = content_questions.id
          and approval.question_version = content_questions.current_version
      )
    )
  )
);

drop policy if exists "Users read available question revisions"
  on public.content_question_revisions;
create policy "Users read available question revisions"
on public.content_question_revisions for select to authenticated
using (
  (select public.is_content_admin())
  or exists (
    select 1
    from public.content_questions as question
    where question.id = content_question_revisions.question_id
      and question.current_version = content_question_revisions.version
      and question.lifecycle_status <> 'archived'
  )
);

drop policy if exists "Content admins read sync runs"
  on public.content_sync_runs;
create policy "Content admins read sync runs"
on public.content_sync_runs for select to authenticated
using ((select public.is_content_admin()));

drop policy if exists "Content admins read generation jobs"
  on public.content_generation_jobs;
create policy "Content admins read generation jobs"
on public.content_generation_jobs for select to authenticated
using ((select public.is_content_admin()));

drop policy if exists "Content admins read question events"
  on public.content_question_events;
create policy "Content admins read question events"
on public.content_question_events for select to authenticated
using ((select public.is_content_admin()));

revoke all on table public.content_admins from public, anon, authenticated;
revoke all on table public.content_lessons from public, anon, authenticated;
revoke all on table public.content_lesson_revisions from public, anon, authenticated;
revoke all on table public.content_questions from public, anon, authenticated;
revoke all on table public.content_question_revisions from public, anon, authenticated;
revoke all on table public.content_sync_runs from public, anon, authenticated;
revoke all on table public.content_generation_jobs from public, anon, authenticated;
revoke all on table public.content_question_events from public, anon, authenticated;

grant select on table public.content_admins to authenticated;
grant select on table public.content_lessons to authenticated;
grant select on table public.content_lesson_revisions to authenticated;
grant select on table public.content_questions to authenticated;
grant select on table public.content_question_revisions to authenticated;
grant select on table public.content_sync_runs to authenticated;
grant select on table public.content_generation_jobs to authenticated;
grant select on table public.content_question_events to authenticated;

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
    when lesson.current_source_hash is distinct from revision.source_hash
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

revoke all on table public.content_current_questions from public, anon, authenticated;
grant select on table public.content_current_questions to authenticated;

revoke all on function public.reject_content_revision_mutation()
  from public, anon, authenticated;
