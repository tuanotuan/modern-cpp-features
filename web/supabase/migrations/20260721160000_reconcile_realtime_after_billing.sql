alter table public.ai_usage_daily
  add column if not exists provider_actual_baseline_usd_micros bigint not null default 0
    check (provider_actual_baseline_usd_micros >= 0);

alter table public.ai_usage_monthly
  add column if not exists provider_actual_baseline_usd_micros bigint not null default 0
    check (provider_actual_baseline_usd_micros >= 0);

update public.ai_usage_daily
set provider_actual_baseline_usd_micros = actual_usd_micros
where provider_synced_at is not null;

update public.ai_usage_monthly
set provider_actual_baseline_usd_micros = actual_usd_micros
where provider_synced_at is not null;

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
  set provider_usd_micros = p_daily_usd_micros,
      provider_actual_baseline_usd_micros = actual_usd_micros,
      provider_synced_at = now(),
      updated_at = now()
  where user_id = v_user_id and usage_date = v_usage_date;

  insert into public.ai_usage_monthly (user_id, month_start)
  values (v_user_id, v_month_start)
  on conflict (user_id, month_start) do nothing;

  update public.ai_usage_monthly
  set provider_usd_micros = p_monthly_usd_micros,
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
  v_monthly_provider_synced_at timestamptz;
  v_monthly_reserved bigint;
  v_monthly_used bigint;
  v_daily_actual bigint;
  v_daily_provider bigint;
  v_daily_baseline bigint;
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
    provider_synced_at,
    reserved_usd_micros
  into
    v_monthly_actual,
    v_monthly_provider,
    v_monthly_baseline,
    v_monthly_provider_synced_at,
    v_monthly_reserved
  from public.ai_usage_monthly
  where user_id = v_user_id and month_start = v_month_start
  for update;

  select
    actual_usd_micros,
    provider_usd_micros,
    provider_actual_baseline_usd_micros,
    provider_synced_at
  into
    v_daily_actual,
    v_daily_provider,
    v_daily_baseline,
    v_daily_provider_synced_at
  from public.ai_usage_daily
  where user_id = v_user_id and usage_date = v_usage_date
  for update;

  v_monthly_used := case
    when v_monthly_provider_synced_at is null then v_monthly_actual
    else v_monthly_provider + greatest(0, v_monthly_actual - v_monthly_baseline)
  end;
  v_daily_used := case
    when v_daily_provider_synced_at is null then v_daily_actual
    else v_daily_provider + greatest(0, v_daily_actual - v_daily_baseline)
  end;

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

revoke all on function public.reconcile_ai_costs(bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.reserve_ai_budget(bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.reconcile_ai_costs(bigint, bigint)
  to authenticated;
grant execute on function public.reserve_ai_budget(bigint, bigint, bigint)
  to authenticated;
