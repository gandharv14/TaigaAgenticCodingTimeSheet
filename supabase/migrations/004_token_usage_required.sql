alter table public.timesheet_entries
drop constraint if exists timesheet_entries_token_usage_required_check;

alter table public.timesheet_entries
add constraint timesheet_entries_token_usage_required_check
check (token_usage is not null) not valid;
