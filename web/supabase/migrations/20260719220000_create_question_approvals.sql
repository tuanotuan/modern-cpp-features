create table if not exists public.question_approvals (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  question_version integer not null check (question_version > 0),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  approved_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists question_approvals_user_approved_idx
  on public.question_approvals (user_id, approved_at desc);

alter table public.question_approvals enable row level security;

grant select, insert, update, delete on public.question_approvals to authenticated;

drop policy if exists "Users read their own question approvals"
  on public.question_approvals;
create policy "Users read their own question approvals"
on public.question_approvals for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own question approvals"
  on public.question_approvals;
create policy "Users insert their own question approvals"
on public.question_approvals for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own question approvals"
  on public.question_approvals;
create policy "Users update their own question approvals"
on public.question_approvals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own question approvals"
  on public.question_approvals;
create policy "Users delete their own question approvals"
on public.question_approvals for delete to authenticated
using ((select auth.uid()) = user_id);
