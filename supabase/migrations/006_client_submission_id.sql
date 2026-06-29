alter table public.timesheet_work_batches
add column if not exists client_submission_id text;

create unique index if not exists timesheet_work_batches_auth0_user_client_submission_id_idx
on public.timesheet_work_batches(auth0_user_id, client_submission_id)
where client_submission_id is not null;
