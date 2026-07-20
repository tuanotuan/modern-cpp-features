create table if not exists public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  actual_usd_micros bigint not null default 0 check (actual_usd_micros >= 0),
  reserved_usd_micros bigint not null default 0 check (reserved_usd_micros >= 0),
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  last_model text,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

alter table public.ai_usage_monthly enable row level security;

grant select on public.ai_usage_monthly to authenticated;

drop policy if exists "Users read their own AI usage"
  on public.ai_usage_monthly;
create policy "Users read their own AI usage"
on public.ai_usage_monthly for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.reserve_ai_budget(
  p_reservation_usd_micros bigint,
  p_limit_usd_micros bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', now())::date;
  v_reserved boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_reservation_usd_micros <= 0 or p_limit_usd_micros <= 0 then
    raise exception 'Budget values must be positive';
  end if;

  insert into public.ai_usage_monthly (
    user_id,
    month_start,
    reserved_usd_micros
  )
  select v_user_id, v_month_start, p_reservation_usd_micros
  where p_reservation_usd_micros <= p_limit_usd_micros
  on conflict (user_id, month_start) do update
  set reserved_usd_micros =
        public.ai_usage_monthly.reserved_usd_micros + excluded.reserved_usd_micros,
      updated_at = now()
  where public.ai_usage_monthly.actual_usd_micros
      + public.ai_usage_monthly.reserved_usd_micros
      + excluded.reserved_usd_micros
      <= p_limit_usd_micros
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

create or replace function public.finalize_ai_budget(
  p_reservation_usd_micros bigint,
  p_actual_usd_micros bigint,
  p_model text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_cache_write_tokens bigint,
  p_output_tokens bigint
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
  where user_id = auth.uid()
    and month_start = date_trunc('month', now())::date;
end;
$$;

create or replace function public.release_ai_budget(
  p_reservation_usd_micros bigint
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
  where user_id = auth.uid()
    and month_start = date_trunc('month', now())::date;
end;
$$;

revoke all on function public.reserve_ai_budget(bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_budget(bigint, bigint, text, bigint, bigint, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.release_ai_budget(bigint)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_budget(bigint, bigint)
  to authenticated;
grant execute on function public.finalize_ai_budget(bigint, bigint, text, bigint, bigint, bigint, bigint)
  to authenticated;
grant execute on function public.release_ai_budget(bigint)
  to authenticated;
