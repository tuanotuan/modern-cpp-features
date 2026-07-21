create table if not exists public.user_question_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  question_version integer not null default 1 check (question_version > 0),
  source_hash text check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  learning_state text not null check (
    learning_state in ('new', 'learning', 'review', 'relearning')
  ),
  due_on date,
  interval_days integer not null default 0 check (interval_days >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  lapse_count integer not null default 0 check (lapse_count >= 0),
  last_rating text check (
    last_rating is null or last_rating in ('again', 'hard', 'good', 'easy')
  ),
  last_reviewed_on date,
  is_suspended boolean not null default false,
  is_leech boolean not null default false,
  content_changed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id),
  check (
    (learning_state = 'new' and due_on is null and review_count = 0)
    or
    (learning_state <> 'new' and due_on is not null and review_count > 0)
  ),
  check (
    (review_count = 0 and last_rating is null and last_reviewed_on is null)
    or
    (review_count > 0 and last_rating is not null and last_reviewed_on is not null)
  )
);

create index if not exists user_question_states_queue_idx
  on public.user_question_states (
    user_id,
    is_suspended,
    learning_state,
    due_on
  );

create index if not exists user_question_states_leech_idx
  on public.user_question_states (user_id, is_leech, lapse_count desc)
  where is_leech = true;

drop trigger if exists user_question_states_set_updated_at
  on public.user_question_states;

create trigger user_question_states_set_updated_at
before update on public.user_question_states
for each row execute function public.set_updated_at();

alter table public.user_question_states enable row level security;

grant select, insert, update, delete
  on public.user_question_states to authenticated;

drop policy if exists "Users read their own question states"
  on public.user_question_states;
create policy "Users read their own question states"
on public.user_question_states for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own question states"
  on public.user_question_states;
create policy "Users insert their own question states"
on public.user_question_states for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own question states"
  on public.user_question_states;
create policy "Users update their own question states"
on public.user_question_states for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own question states"
  on public.user_question_states;
create policy "Users delete their own question states"
on public.user_question_states for delete to authenticated
using ((select auth.uid()) = user_id);

with ordered_reviews as (
  select
    review.*,
    row_number() over (
      partition by review.user_id, review.question_id
      order by review.reviewed_on, review.created_at, review.id
    ) as review_number,
    row_number() over (
      partition by review.user_id, review.question_id
      order by review.reviewed_on desc, review.updated_at desc, review.id desc
    ) as latest_number
  from public.practice_reviews as review
),
review_stats as (
  select
    user_id,
    question_id,
    count(*)::integer as review_count,
    count(*) filter (
      where rating = 'again' and review_number > 1
    )::integer as lapse_count
  from ordered_reviews
  group by user_id, question_id
),
latest_reviews as (
  select *
  from ordered_reviews
  where latest_number = 1
)
insert into public.user_question_states (
  user_id,
  question_id,
  learning_state,
  due_on,
  interval_days,
  review_count,
  lapse_count,
  last_rating,
  last_reviewed_on
)
select
  latest.user_id,
  latest.question_id,
  case
    when latest.rating = 'again' then 'relearning'
    else 'review'
  end,
  latest.next_due_on,
  greatest(1, latest.next_due_on - latest.reviewed_on),
  stats.review_count,
  stats.lapse_count,
  latest.rating,
  latest.reviewed_on
from latest_reviews as latest
join review_stats as stats
  using (user_id, question_id)
on conflict (user_id, question_id) do nothing;
