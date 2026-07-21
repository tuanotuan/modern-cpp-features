create table if not exists public.gemini_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  thought_tokens bigint not null default 0 check (thought_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  last_model text,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.gemini_usage_daily enable row level security;

grant select on public.gemini_usage_daily to authenticated;

drop policy if exists "Users read their own Gemini usage"
  on public.gemini_usage_daily;

create policy "Users read their own Gemini usage"
on public.gemini_usage_daily
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.record_gemini_fallback_usage(
  p_model text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_thought_tokens bigint,
  p_total_tokens bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_usage_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  insert into public.gemini_usage_daily (
    user_id,
    usage_date,
    request_count,
    input_tokens,
    output_tokens,
    thought_tokens,
    total_tokens,
    last_model
  ) values (
    v_user_id,
    v_usage_date,
    1,
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0),
    greatest(p_thought_tokens, 0),
    greatest(p_total_tokens, 0),
    p_model
  )
  on conflict (user_id, usage_date) do update set
    request_count = public.gemini_usage_daily.request_count + 1,
    input_tokens = public.gemini_usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = public.gemini_usage_daily.output_tokens + excluded.output_tokens,
    thought_tokens = public.gemini_usage_daily.thought_tokens + excluded.thought_tokens,
    total_tokens = public.gemini_usage_daily.total_tokens + excluded.total_tokens,
    last_model = excluded.last_model,
    updated_at = now();
end;
$$;

revoke all on function public.record_gemini_fallback_usage(text, bigint, bigint, bigint, bigint)
  from public, anon;
grant execute on function public.record_gemini_fallback_usage(text, bigint, bigint, bigint, bigint)
  to authenticated;

create table if not exists public.ai_provider_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_fallback_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_settings enable row level security;

grant select, insert, update on public.ai_provider_settings to authenticated;

drop policy if exists "Users read their own AI provider settings"
  on public.ai_provider_settings;
create policy "Users read their own AI provider settings"
on public.ai_provider_settings for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own AI provider settings"
  on public.ai_provider_settings;
create policy "Users insert their own AI provider settings"
on public.ai_provider_settings for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own AI provider settings"
  on public.ai_provider_settings;
create policy "Users update their own AI provider settings"
on public.ai_provider_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
