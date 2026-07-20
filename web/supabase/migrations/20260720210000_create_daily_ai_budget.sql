create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  actual_usd_micros bigint not null default 0 check (actual_usd_micros >= 0),
  reserved_usd_micros bigint not null default 0 check (reserved_usd_micros >= 0),
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  last_model text,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_usage_daily enable row level security;
grant select on public.ai_usage_daily to authenticated;

drop policy if exists "Users read their own daily AI usage"
  on public.ai_usage_daily;
create policy "Users read their own daily AI usage"
on public.ai_usage_daily for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.reserve_ai_budget(
  p_reservation_usd_micros bigint,
  p_monthly_limit_usd_micros bigint,
  p_daily_limit_usd_micros bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_usage_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month_start date := date_trunc(
    'month',
    (now() at time zone 'Asia/Ho_Chi_Minh')
  )::date;
  v_monthly_actual bigint;
  v_daily_actual bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_reservation_usd_micros <= 0
    or p_monthly_limit_usd_micros <= 0
    or p_daily_limit_usd_micros <= 0 then
    raise exception 'Budget values must be positive';
  end if;

  insert into public.ai_usage_monthly (user_id, month_start)
  values (v_user_id, v_month_start)
  on conflict (user_id, month_start) do nothing;

  insert into public.ai_usage_daily (user_id, usage_date)
  values (v_user_id, v_usage_date)
  on conflict (user_id, usage_date) do nothing;

  select actual_usd_micros
  into v_monthly_actual
  from public.ai_usage_monthly
  where user_id = v_user_id and month_start = v_month_start
  for update;

  select actual_usd_micros
  into v_daily_actual
  from public.ai_usage_daily
  where user_id = v_user_id and usage_date = v_usage_date
  for update;

  if v_monthly_actual >= p_monthly_limit_usd_micros then
    return jsonb_build_object(
      'status', 'monthly_exceeded',
      'usage_date', v_usage_date,
      'month_start', v_month_start
    );
  end if;

  if v_daily_actual >= p_daily_limit_usd_micros then
    return jsonb_build_object(
      'status', 'daily_exceeded',
      'usage_date', v_usage_date,
      'month_start', v_month_start
    );
  end if;

  update public.ai_usage_monthly
  set reserved_usd_micros = reserved_usd_micros + p_reservation_usd_micros,
      updated_at = now()
  where user_id = v_user_id and month_start = v_month_start;

  update public.ai_usage_daily
  set reserved_usd_micros = reserved_usd_micros + p_reservation_usd_micros,
      updated_at = now()
  where user_id = v_user_id and usage_date = v_usage_date;

  return jsonb_build_object(
    'status', 'allowed',
    'usage_date', v_usage_date,
    'month_start', v_month_start
  );
end;
$$;

create or replace function public.finalize_ai_budget(
  p_reservation_usd_micros bigint,
  p_actual_usd_micros bigint,
  p_model text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_cache_write_tokens bigint,
  p_output_tokens bigint,
  p_usage_date date,
  p_month_start date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.ai_usage_monthly
  set reserved_usd_micros = greatest(0, reserved_usd_micros - p_reservation_usd_micros),
      actual_usd_micros = actual_usd_micros + greatest(0, p_actual_usd_micros),
      request_count = request_count + 1,
      input_tokens = input_tokens + greatest(0, p_input_tokens),
      cached_input_tokens = cached_input_tokens + greatest(0, p_cached_input_tokens),
      cache_write_tokens = cache_write_tokens + greatest(0, p_cache_write_tokens),
      output_tokens = output_tokens + greatest(0, p_output_tokens),
      last_model = p_model,
      updated_at = now()
  where user_id = auth.uid() and month_start = p_month_start;

  update public.ai_usage_daily
  set reserved_usd_micros = greatest(0, reserved_usd_micros - p_reservation_usd_micros),
      actual_usd_micros = actual_usd_micros + greatest(0, p_actual_usd_micros),
      request_count = request_count + 1,
      input_tokens = input_tokens + greatest(0, p_input_tokens),
      cached_input_tokens = cached_input_tokens + greatest(0, p_cached_input_tokens),
      cache_write_tokens = cache_write_tokens + greatest(0, p_cache_write_tokens),
      output_tokens = output_tokens + greatest(0, p_output_tokens),
      last_model = p_model,
      updated_at = now()
  where user_id = auth.uid() and usage_date = p_usage_date;
end;
$$;

create or replace function public.release_ai_budget(
  p_reservation_usd_micros bigint,
  p_usage_date date,
  p_month_start date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.ai_usage_monthly
  set reserved_usd_micros = greatest(0, reserved_usd_micros - p_reservation_usd_micros),
      updated_at = now()
  where user_id = auth.uid() and month_start = p_month_start;

  update public.ai_usage_daily
  set reserved_usd_micros = greatest(0, reserved_usd_micros - p_reservation_usd_micros),
      updated_at = now()
  where user_id = auth.uid() and usage_date = p_usage_date;
end;
$$;

revoke all on function public.reserve_ai_budget(bigint, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_budget(bigint, bigint, text, bigint, bigint, bigint, bigint, date, date)
  from public, anon, authenticated;
revoke all on function public.release_ai_budget(bigint, date, date)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_budget(bigint, bigint, bigint)
  to authenticated;
grant execute on function public.finalize_ai_budget(bigint, bigint, text, bigint, bigint, bigint, bigint, date, date)
  to authenticated;
grant execute on function public.release_ai_budget(bigint, date, date)
  to authenticated;
