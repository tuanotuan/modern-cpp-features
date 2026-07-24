create table if not exists public.code_execution_reservations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  purpose text not null check (purpose in ('sample', 'mock_report')),
  job_count integer not null check (job_count > 0),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  cached_result jsonb,
  usage_date date not null,
  lease_started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (
    cached_result is null
    or octet_length(cached_result::text) <= 131072
  ),
  check (
    (status = 'running' and cached_result is null and finished_at is null)
    or (
      status in ('completed', 'failed')
      and cached_result is not null
      and finished_at is not null
    )
  )
);

create unique index if not exists code_execution_one_active_user_idx
  on public.code_execution_reservations (user_id)
  where status = 'running';

create index if not exists code_execution_user_daily_purpose_idx
  on public.code_execution_reservations (
    user_id,
    usage_date,
    purpose,
    created_at
  );

alter table public.code_execution_reservations enable row level security;

revoke all on table public.code_execution_reservations
  from public, anon, authenticated;

drop policy if exists "Users read their own code execution reservations"
  on public.code_execution_reservations;

drop function if exists public.reserve_code_execution(
  uuid,
  text,
  integer
);
drop function if exists public.finish_code_execution(
  uuid,
  text,
  jsonb
);

create or replace function public.reserve_code_execution(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_purpose text,
  p_job_count integer,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_usage_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_daily_limit integer;
  v_jobs_used bigint;
  v_existing public.code_execution_reservations%rowtype;
  v_active public.code_execution_reservations%rowtype;
  v_created public.code_execution_reservations%rowtype;
begin
  if v_user_id is null then
    raise exception 'A user UUID is required';
  end if;
  if p_idempotency_key is null
    or p_idempotency_key = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'A non-zero idempotency UUID is required';
  end if;
  if p_purpose is null
    or p_purpose not in ('sample', 'mock_report') then
    raise exception 'Invalid code execution purpose';
  end if;
  if p_request_fingerprint is null
    or p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'A SHA-256 request fingerprint is required';
  end if;

  v_daily_limit := case p_purpose
    when 'sample' then 20
    when 'mock_report' then 12
  end;
  if p_job_count is null
    or p_job_count <= 0
    or p_job_count > v_daily_limit then
    raise exception 'Invalid code execution job count';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  update public.code_execution_reservations
  set status = 'failed',
      cached_result = jsonb_build_object(
        'ok', false,
        'code', 'lease_expired'
      ),
      finished_at = now(),
      updated_at = now()
  where user_id = v_user_id
    and status = 'running'
    and lease_expires_at <= now();

  select *
  into v_existing
  from public.code_execution_reservations
  where user_id = v_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.purpose is distinct from p_purpose
      or v_existing.job_count is distinct from p_job_count
      or v_existing.request_fingerprint
        is distinct from p_request_fingerprint then
      return jsonb_build_object(
        'reservation_id', v_existing.id,
        'status', 'idempotency_conflict',
        'cached_result', v_existing.cached_result,
        'is_new', false,
        'purpose', v_existing.purpose,
        'job_count', v_existing.job_count,
        'usage_date', v_existing.usage_date
      );
    end if;

    return jsonb_build_object(
      'reservation_id', v_existing.id,
      'status', v_existing.status,
      'cached_result', v_existing.cached_result,
      'is_new', false,
      'purpose', v_existing.purpose,
      'job_count', v_existing.job_count,
      'usage_date', v_existing.usage_date,
      'lease_expires_at', v_existing.lease_expires_at
    );
  end if;

  select *
  into v_active
  from public.code_execution_reservations
  where user_id = v_user_id
    and status = 'running'
  limit 1;

  if found then
    return jsonb_build_object(
      'reservation_id', v_active.id,
      'status', 'busy',
      'cached_result', null,
      'is_new', false,
      'purpose', v_active.purpose,
      'job_count', v_active.job_count,
      'usage_date', v_active.usage_date,
      'lease_expires_at', v_active.lease_expires_at
    );
  end if;

  select coalesce(sum(job_count), 0)
  into v_jobs_used
  from public.code_execution_reservations
  where user_id = v_user_id
    and usage_date = v_usage_date
    and purpose = p_purpose;

  if v_jobs_used + p_job_count > v_daily_limit then
    return jsonb_build_object(
      'reservation_id', null,
      'status', 'quota_exceeded',
      'cached_result', null,
      'is_new', false,
      'purpose', p_purpose,
      'job_count', p_job_count,
      'usage_date', v_usage_date,
      'jobs_used', v_jobs_used,
      'daily_limit', v_daily_limit
    );
  end if;

  insert into public.code_execution_reservations (
    user_id,
    idempotency_key,
    request_fingerprint,
    purpose,
    job_count,
    usage_date,
    lease_expires_at
  )
  values (
    v_user_id,
    p_idempotency_key,
    p_request_fingerprint,
    p_purpose,
    p_job_count,
    v_usage_date,
    now() + case p_purpose
      when 'sample' then interval '2 minutes'
      when 'mock_report' then interval '10 minutes'
    end
  )
  returning * into v_created;

  return jsonb_build_object(
    'reservation_id', v_created.id,
    'status', v_created.status,
    'cached_result', v_created.cached_result,
    'is_new', true,
    'purpose', v_created.purpose,
    'job_count', v_created.job_count,
    'usage_date', v_created.usage_date,
    'lease_expires_at', v_created.lease_expires_at,
    'jobs_used', v_jobs_used + p_job_count,
    'daily_limit', v_daily_limit
  );
end;
$$;

create or replace function public.finish_code_execution(
  p_user_id uuid,
  p_reservation_id uuid,
  p_status text,
  p_cached_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_reservation public.code_execution_reservations%rowtype;
begin
  if v_user_id is null then
    raise exception 'A user UUID is required';
  end if;
  if p_reservation_id is null then
    raise exception 'Reservation UUID is required';
  end if;
  if p_status is null
    or p_status not in ('completed', 'failed') then
    raise exception 'A terminal code execution status is required';
  end if;
  if p_cached_result is null
    or jsonb_typeof(p_cached_result) <> 'object' then
    raise exception 'Code execution result must be a JSON object';
  end if;
  if octet_length(p_cached_result::text) > 131072 then
    raise exception 'Code execution result exceeds 128 KiB';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select *
  into v_reservation
  from public.code_execution_reservations
  where id = p_reservation_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'reservation_id', null,
      'status', 'not_found',
      'cached_result', null,
      'is_new', false
    );
  end if;

  if v_reservation.status <> 'running' then
    return jsonb_build_object(
      'reservation_id', v_reservation.id,
      'status', v_reservation.status,
      'cached_result', v_reservation.cached_result,
      'is_new', false,
      'purpose', v_reservation.purpose,
      'job_count', v_reservation.job_count,
      'usage_date', v_reservation.usage_date
    );
  end if;

  update public.code_execution_reservations
  set status = p_status,
      cached_result = p_cached_result,
      finished_at = now(),
      updated_at = now()
  where id = v_reservation.id
    and user_id = v_user_id
  returning * into v_reservation;

  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'status', v_reservation.status,
    'cached_result', v_reservation.cached_result,
    'is_new', true,
    'purpose', v_reservation.purpose,
    'job_count', v_reservation.job_count,
    'usage_date', v_reservation.usage_date
  );
end;
$$;

revoke all on function public.reserve_code_execution(
  uuid,
  uuid,
  text,
  integer,
  text
) from public, anon, authenticated;
revoke all on function public.finish_code_execution(
  uuid,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.reserve_code_execution(
  uuid,
  uuid,
  text,
  integer,
  text
) to service_role;
grant execute on function public.finish_code_execution(
  uuid,
  uuid,
  text,
  jsonb
) to service_role;
