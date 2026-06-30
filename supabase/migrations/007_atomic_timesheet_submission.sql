create or replace function public.create_timesheet_batch_transaction(
  p_auth0_user_id text,
  p_auth0_email text,
  p_client_submission_id text,
  p_workforce_email text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_total_hours_override numeric,
  p_work_sessions jsonb,
  p_problems jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_session jsonb;
  v_problem jsonb;
  v_turn jsonb;
  v_entry_id uuid;
begin
  if p_client_submission_id is not null then
    insert into public.timesheet_work_batches (
      auth0_user_id,
      auth0_email,
      client_submission_id,
      workforce_email,
      start_at,
      end_at,
      total_hours_override
    )
    values (
      p_auth0_user_id,
      p_auth0_email,
      p_client_submission_id,
      p_workforce_email,
      p_start_at,
      p_end_at,
      p_total_hours_override
    )
    on conflict (auth0_user_id, client_submission_id)
    where client_submission_id is not null
    do nothing
    returning id into v_batch_id;

    if v_batch_id is null then
      select id
      into v_batch_id
      from public.timesheet_work_batches
      where auth0_user_id = p_auth0_user_id
        and client_submission_id = p_client_submission_id;

      if v_batch_id is null then
        raise exception 'Unable to find idempotent timesheet batch for client submission %', p_client_submission_id;
      end if;

      return v_batch_id;
    end if;
  else
    insert into public.timesheet_work_batches (
      auth0_user_id,
      auth0_email,
      client_submission_id,
      workforce_email,
      start_at,
      end_at,
      total_hours_override
    )
    values (
      p_auth0_user_id,
      p_auth0_email,
      null,
      p_workforce_email,
      p_start_at,
      p_end_at,
      p_total_hours_override
    )
    returning id into v_batch_id;
  end if;

  for v_session in
    select value from jsonb_array_elements(p_work_sessions) as sessions(value)
  loop
    insert into public.timesheet_batch_work_sessions (
      batch_id,
      session_number,
      start_at,
      end_at
    )
    values (
      v_batch_id,
      (v_session ->> 'sessionNumber')::integer,
      (v_session ->> 'startAt')::timestamptz,
      (v_session ->> 'endAt')::timestamptz
    );
  end loop;

  for v_problem in
    select value from jsonb_array_elements(p_problems) as problems(value)
  loop
    insert into public.timesheet_entries (
      work_batch_id,
      auth0_user_id,
      auth0_email,
      workforce_email,
      primary_programming_language,
      secondary_programming_languages,
      live_compare_problem_id,
      task_url,
      start_at,
      end_at,
      total_hours_override,
      summary,
      comments,
      token_usage,
      blocked_on_taiga_bug
    )
    values (
      v_batch_id,
      p_auth0_user_id,
      p_auth0_email,
      p_workforce_email,
      v_problem ->> 'primaryProgrammingLanguage',
      v_problem ->> 'secondaryProgrammingLanguages',
      v_problem ->> 'liveCompareProblemId',
      v_problem ->> 'taskUrl',
      p_start_at,
      p_end_at,
      p_total_hours_override,
      v_problem ->> 'summary',
      v_problem ->> 'comments',
      (v_problem ->> 'tokenUsage')::bigint,
      (v_problem ->> 'blockedOnTaigaBug')::boolean
    )
    returning id into v_entry_id;

    for v_turn in
      select value from jsonb_array_elements(v_problem -> 'turns') as turns(value)
    loop
      insert into public.timesheet_turns (
        entry_id,
        turn_number,
        task_type
      )
      values (
        v_entry_id,
        (v_turn ->> 'turnNumber')::integer,
        v_turn ->> 'taskType'
      );
    end loop;
  end loop;

  return v_batch_id;
end;
$$;

revoke all on function public.create_timesheet_batch_transaction(
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  numeric,
  jsonb,
  jsonb
) from public;

grant execute on function public.create_timesheet_batch_transaction(
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  numeric,
  jsonb,
  jsonb
) to service_role;
