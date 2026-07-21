alter table public.practice_reviews
  add column if not exists question_version integer
    check (question_version is null or question_version > 0),
  add column if not exists source_hash text
    check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists learning_state_after text
    check (
      learning_state_after is null
      or learning_state_after in ('learning', 'review', 'relearning')
    ),
  add column if not exists interval_days_after integer
    check (interval_days_after is null or interval_days_after > 0),
  add column if not exists lapse_count_after integer
    check (lapse_count_after is null or lapse_count_after >= 0);

with latest_reviews as (
  select distinct on (user_id, question_id)
    id,
    user_id,
    question_id
  from public.practice_reviews
  order by user_id, question_id, reviewed_on desc, updated_at desc, id desc
)
update public.practice_reviews as review
set
  question_version = state.question_version,
  source_hash = state.source_hash,
  learning_state_after = state.learning_state,
  interval_days_after = greatest(1, state.interval_days),
  lapse_count_after = state.lapse_count
from latest_reviews as latest
join public.user_question_states as state
  using (user_id, question_id)
where review.id = latest.id
  and state.learning_state <> 'new';

create or replace function public.record_practice_review(
  p_question_id text,
  p_question_version integer,
  p_source_hash text,
  p_reviewed_on date,
  p_rating text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_state text := 'new';
  v_due_on date;
  v_interval integer := 0;
  v_review_count integer := 0;
  v_lapse_count integer := 0;
  v_existing_version integer;
  v_existing_hash text;
  v_next_state text;
  v_next_interval integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_question_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid question ID';
  end if;
  if p_question_version <= 0 then
    raise exception 'Invalid question version';
  end if;
  if p_source_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid source hash';
  end if;
  if p_rating not in ('again', 'hard', 'good', 'easy') then
    raise exception 'Invalid rating';
  end if;

  if exists (
    select 1
    from public.practice_reviews
    where user_id = v_user_id
      and question_id = p_question_id
      and reviewed_on = p_reviewed_on
  ) then
    return;
  end if;

  select
    learning_state,
    due_on,
    interval_days,
    review_count,
    lapse_count,
    question_version,
    source_hash
  into
    v_state,
    v_due_on,
    v_interval,
    v_review_count,
    v_lapse_count,
    v_existing_version,
    v_existing_hash
  from public.user_question_states
  where user_id = v_user_id
    and question_id = p_question_id
  for update;

  if not found then
    v_state := 'new';
    v_interval := 0;
    v_review_count := 0;
    v_lapse_count := 0;
  elsif v_existing_hash is not null and (
    v_existing_version <> p_question_version
    or v_existing_hash <> p_source_hash
  ) then
    v_state := 'learning';
    v_interval := 0;
  end if;

  if v_state in ('new', 'learning') then
    case p_rating
      when 'again' then v_next_state := 'learning'; v_next_interval := 1;
      when 'hard' then v_next_state := 'learning'; v_next_interval := 2;
      when 'good' then v_next_state := 'review'; v_next_interval := 3;
      when 'easy' then v_next_state := 'review'; v_next_interval := 7;
    end case;
  elsif v_state = 'relearning' then
    case p_rating
      when 'again' then v_next_state := 'relearning'; v_next_interval := 1;
      when 'hard' then v_next_state := 'relearning'; v_next_interval := 2;
      when 'good' then v_next_state := 'review'; v_next_interval := 3;
      when 'easy' then v_next_state := 'review'; v_next_interval := 7;
    end case;
  else
    case p_rating
      when 'again' then
        v_next_state := 'relearning';
        v_next_interval := 1;
        v_lapse_count := v_lapse_count + 1;
      when 'hard' then
        v_next_state := 'review';
        v_next_interval := greatest(v_interval + 1, ceil(v_interval * 1.2)::integer);
      when 'good' then
        v_next_state := 'review';
        v_next_interval := greatest(v_interval + 1, ceil(v_interval * 2.2)::integer);
      when 'easy' then
        v_next_state := 'review';
        v_next_interval := greatest(v_interval + 2, ceil(v_interval * 3.2)::integer);
    end case;
  end if;

  v_due_on := p_reviewed_on + v_next_interval;
  v_review_count := v_review_count + 1;

  insert into public.practice_reviews (
    user_id,
    question_id,
    reviewed_on,
    rating,
    next_due_on,
    question_version,
    source_hash,
    learning_state_after,
    interval_days_after,
    lapse_count_after
  ) values (
    v_user_id,
    p_question_id,
    p_reviewed_on,
    p_rating,
    v_due_on,
    p_question_version,
    p_source_hash,
    v_next_state,
    v_next_interval,
    v_lapse_count
  );

  insert into public.user_question_states (
    user_id,
    question_id,
    question_version,
    source_hash,
    learning_state,
    due_on,
    interval_days,
    review_count,
    lapse_count,
    last_rating,
    last_reviewed_on,
    is_leech,
    content_changed
  ) values (
    v_user_id,
    p_question_id,
    p_question_version,
    p_source_hash,
    v_next_state,
    v_due_on,
    v_next_interval,
    v_review_count,
    v_lapse_count,
    p_rating,
    p_reviewed_on,
    v_lapse_count >= 8,
    false
  )
  on conflict (user_id, question_id) do update set
    question_version = excluded.question_version,
    source_hash = excluded.source_hash,
    learning_state = excluded.learning_state,
    due_on = excluded.due_on,
    interval_days = excluded.interval_days,
    review_count = excluded.review_count,
    lapse_count = excluded.lapse_count,
    last_rating = excluded.last_rating,
    last_reviewed_on = excluded.last_reviewed_on,
    is_leech = excluded.is_leech,
    content_changed = excluded.content_changed;
end;
$$;

revoke all on function public.record_practice_review(
  text,
  integer,
  text,
  date,
  text
) from public, anon;

grant execute on function public.record_practice_review(
  text,
  integer,
  text,
  date,
  text
) to authenticated;
