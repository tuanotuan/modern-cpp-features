alter table public.ai_usage_daily
  add column if not exists usage_floor_usd_micros bigint not null default 0
    check (usage_floor_usd_micros >= 0);

alter table public.ai_usage_monthly
  add column if not exists usage_floor_usd_micros bigint not null default 0
    check (usage_floor_usd_micros >= 0);

update public.ai_usage_daily
set usage_floor_usd_micros = greatest(
  usage_floor_usd_micros,
  actual_usd_micros,
  provider_usd_micros
    + greatest(0, actual_usd_micros - provider_actual_baseline_usd_micros)
);

update public.ai_usage_monthly
set usage_floor_usd_micros = greatest(
  usage_floor_usd_micros,
  actual_usd_micros,
  provider_usd_micros
    + greatest(0, actual_usd_micros - provider_actual_baseline_usd_micros)
);

create or replace function public.reconcile_ai_costs(
  p_daily_usd_micros bigint,
  p_monthly_usd_micros bigint
)
returns void
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_daily_usd_micros < 0 or p_monthly_usd_micros < 0 then
    raise exception 'Provider costs cannot be negative';
  end if;

  insert into public.ai_usage_daily (user_id, usage_date)
  values (v_user_id, v_usage_date)
  on conflict (user_id, usage_date) do nothing;

  update public.ai_usage_daily
  set usage_floor_usd_micros = greatest(
        usage_floor_usd_micros,
        actual_usd_micros,
        provider_usd_micros
          + greatest(
              0,
              actual_usd_micros - provider_actual_baseline_usd_micros
            ),
        p_daily_usd_micros
      ),
      provider_usd_micros = p_daily_usd_micros,
      provider_actual_baseline_usd_micros = actual_usd_micros,
      provider_synced_at = now(),
      updated_at = now()
  where user_id = v_user_id and usage_date = v_usage_date;

  insert into public.ai_usage_monthly (user_id, month_start)
  values (v_user_id, v_month_start)
  on conflict (user_id, month_start) do nothing;

  update public.ai_usage_monthly
  set usage_floor_usd_micros = greatest(
        usage_floor_usd_micros,
        actual_usd_micros,
        provider_usd_micros
          + greatest(
              0,
              actual_usd_micros - provider_actual_baseline_usd_micros
            ),
        p_monthly_usd_micros
      ),
      provider_usd_micros = p_monthly_usd_micros,
      provider_actual_baseline_usd_micros = actual_usd_micros,
      provider_synced_at = now(),
      updated_at = now()
  where user_id = v_user_id and month_start = v_month_start;
end;
$$;

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
  v_monthly_provider bigint;
  v_monthly_baseline bigint;
  v_monthly_floor bigint;
  v_monthly_provider_synced_at timestamptz;
  v_monthly_reserved bigint;
  v_monthly_used bigint;
  v_daily_actual bigint;
  v_daily_provider bigint;
  v_daily_baseline bigint;
  v_daily_floor bigint;
  v_daily_provider_synced_at timestamptz;
  v_daily_used bigint;
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

  select
    actual_usd_micros,
    provider_usd_micros,
    provider_actual_baseline_usd_micros,
    usage_floor_usd_micros,
    provider_synced_at,
    reserved_usd_micros
  into
    v_monthly_actual,
    v_monthly_provider,
    v_monthly_baseline,
    v_monthly_floor,
    v_monthly_provider_synced_at,
    v_monthly_reserved
  from public.ai_usage_monthly
  where user_id = v_user_id and month_start = v_month_start
  for update;

  select
    actual_usd_micros,
    provider_usd_micros,
    provider_actual_baseline_usd_micros,
    usage_floor_usd_micros,
    provider_synced_at
  into
    v_daily_actual,
    v_daily_provider,
    v_daily_baseline,
    v_daily_floor,
    v_daily_provider_synced_at
  from public.ai_usage_daily
  where user_id = v_user_id and usage_date = v_usage_date
  for update;

  v_monthly_used := greatest(
    v_monthly_floor,
    v_monthly_actual,
    case
      when v_monthly_provider_synced_at is null then v_monthly_actual
      else v_monthly_provider
        + greatest(0, v_monthly_actual - v_monthly_baseline)
    end
  );
  v_daily_used := greatest(
    v_daily_floor,
    v_daily_actual,
    case
      when v_daily_provider_synced_at is null then v_daily_actual
      else v_daily_provider + greatest(0, v_daily_actual - v_daily_baseline)
    end
  );

  if v_monthly_used + v_monthly_reserved + p_reservation_usd_micros
    > p_monthly_limit_usd_micros then
    return jsonb_build_object(
      'status', 'monthly_exceeded',
      'usage_date', v_usage_date,
      'month_start', v_month_start
    );
  end if;

  if v_daily_used >= p_daily_limit_usd_micros then
    return jsonb_build_object(
      'status', 'daily_exceeded',
      'usage_date', v_usage_date,
      'month_start', v_month_start
    );
  end if;

  update public.ai_usage_monthly
  set reserved_usd_micros = reserved_usd_micros + p_reservation_usd_micros,
      usage_floor_usd_micros = greatest(usage_floor_usd_micros, v_monthly_used),
      updated_at = now()
  where user_id = v_user_id and month_start = v_month_start;

  update public.ai_usage_daily
  set reserved_usd_micros = reserved_usd_micros + p_reservation_usd_micros,
      usage_floor_usd_micros = greatest(usage_floor_usd_micros, v_daily_used),
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
declare
  v_actual bigint := greatest(0, p_actual_usd_micros);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.ai_usage_monthly
  set reserved_usd_micros = greatest(
        0,
        reserved_usd_micros - p_reservation_usd_micros
      ),
      usage_floor_usd_micros = greatest(
        usage_floor_usd_micros,
        actual_usd_micros
      ) + v_actual,
      actual_usd_micros = actual_usd_micros + v_actual,
      request_count = request_count + 1,
      input_tokens = input_tokens + greatest(0, p_input_tokens),
      cached_input_tokens = cached_input_tokens
        + greatest(0, p_cached_input_tokens),
      cache_write_tokens = cache_write_tokens
        + greatest(0, p_cache_write_tokens),
      output_tokens = output_tokens + greatest(0, p_output_tokens),
      last_model = p_model,
      updated_at = now()
  where user_id = auth.uid() and month_start = p_month_start;

  update public.ai_usage_daily
  set reserved_usd_micros = greatest(
        0,
        reserved_usd_micros - p_reservation_usd_micros
      ),
      usage_floor_usd_micros = greatest(
        usage_floor_usd_micros,
        actual_usd_micros
      ) + v_actual,
      actual_usd_micros = actual_usd_micros + v_actual,
      request_count = request_count + 1,
      input_tokens = input_tokens + greatest(0, p_input_tokens),
      cached_input_tokens = cached_input_tokens
        + greatest(0, p_cached_input_tokens),
      cache_write_tokens = cache_write_tokens
        + greatest(0, p_cache_write_tokens),
      output_tokens = output_tokens + greatest(0, p_output_tokens),
      last_model = p_model,
      updated_at = now()
  where user_id = auth.uid() and usage_date = p_usage_date;
end;
$$;

revoke all on function public.reconcile_ai_costs(bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.reserve_ai_budget(bigint, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_budget(bigint, bigint, text, bigint, bigint, bigint, bigint, date, date)
  from public, anon, authenticated;
grant execute on function public.reconcile_ai_costs(bigint, bigint)
  to authenticated;
grant execute on function public.reserve_ai_budget(bigint, bigint, bigint)
  to authenticated;
grant execute on function public.finalize_ai_budget(bigint, bigint, text, bigint, bigint, bigint, bigint, date, date)
  to authenticated;
