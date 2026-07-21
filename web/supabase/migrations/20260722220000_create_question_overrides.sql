create table if not exists public.question_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (
    question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  base_question_version integer not null check (base_question_version > 0),
  question_version integer not null check (question_version > 0),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  is_edited boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.question_overrides enable row level security;

grant select, insert, update, delete
  on public.question_overrides to authenticated;

drop policy if exists "Users read their own question overrides"
  on public.question_overrides;
create policy "Users read their own question overrides"
on public.question_overrides for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own question overrides"
  on public.question_overrides;
create policy "Users insert their own question overrides"
on public.question_overrides for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own question overrides"
  on public.question_overrides;
create policy "Users update their own question overrides"
on public.question_overrides for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own question overrides"
  on public.question_overrides;
create policy "Users delete their own question overrides"
on public.question_overrides for delete to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists question_overrides_set_updated_at
  on public.question_overrides;
create trigger question_overrides_set_updated_at
before update on public.question_overrides
for each row execute function public.set_updated_at();
