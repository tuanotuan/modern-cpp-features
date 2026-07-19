create table if not exists public.practice_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  reviewed_on date not null,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  next_due_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id, reviewed_on)
);

create index if not exists practice_reviews_user_due_idx
  on public.practice_reviews (user_id, next_due_on);

create table if not exists public.coach_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  question_version integer not null check (question_version > 0),
  source_commit_sha text not null,
  candidate_answer text not null check (char_length(candidate_answer) between 10 and 6000),
  score integer not null check (score between 0 and 100),
  verdict text not null check (verdict in ('needs_work', 'partial', 'solid', 'strong')),
  suggested_rating text not null check (suggested_rating in ('again', 'hard', 'good', 'easy')),
  feedback jsonb not null check (jsonb_typeof(feedback) = 'object'),
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_attempts_user_created_idx
  on public.coach_attempts (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists practice_reviews_set_updated_at on public.practice_reviews;

create trigger practice_reviews_set_updated_at
before update on public.practice_reviews
for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public, anon, authenticated;

alter table public.practice_reviews enable row level security;
alter table public.coach_attempts enable row level security;

grant select, insert, update, delete on public.practice_reviews to authenticated;
grant usage, select on sequence public.practice_reviews_id_seq to authenticated;
grant select, insert, delete on public.coach_attempts to authenticated;
grant usage, select on sequence public.coach_attempts_id_seq to authenticated;

drop policy if exists "Users read their own reviews" on public.practice_reviews;
create policy "Users read their own reviews"
on public.practice_reviews for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own reviews" on public.practice_reviews;
create policy "Users insert their own reviews"
on public.practice_reviews for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own reviews" on public.practice_reviews;
create policy "Users update their own reviews"
on public.practice_reviews for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own reviews" on public.practice_reviews;
create policy "Users delete their own reviews"
on public.practice_reviews for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own coach attempts" on public.coach_attempts;
create policy "Users read their own coach attempts"
on public.coach_attempts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own coach attempts" on public.coach_attempts;
create policy "Users insert their own coach attempts"
on public.coach_attempts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own coach attempts" on public.coach_attempts;
create policy "Users delete their own coach attempts"
on public.coach_attempts for delete to authenticated
using ((select auth.uid()) = user_id);
