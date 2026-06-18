alter table public.timesheet_entries
add column if not exists total_hours_override numeric(10, 4);

alter table public.timesheet_entries
drop constraint if exists timesheet_entries_total_hours_override_check;

alter table public.timesheet_entries
add constraint timesheet_entries_total_hours_override_check
check (total_hours_override is null or total_hours_override >= 0);

create table if not exists public.timesheet_work_sessions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.timesheet_entries(id) on delete cascade,
  session_number integer not null check (session_number > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint timesheet_work_sessions_time_check check (end_at > start_at),
  unique (entry_id, session_number)
);

insert into public.timesheet_work_sessions (entry_id, session_number, start_at, end_at)
select id, 1, start_at, end_at
from public.timesheet_entries
on conflict (entry_id, session_number) do nothing;

create index if not exists timesheet_work_sessions_entry_id_idx on public.timesheet_work_sessions(entry_id);

alter table public.timesheet_work_sessions enable row level security;
