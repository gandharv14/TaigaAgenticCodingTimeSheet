create table if not exists public.timesheet_work_batches (
  id uuid primary key default gen_random_uuid(),
  auth0_user_id text not null,
  auth0_email text,
  workforce_email text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  total_hours_override numeric(10, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timesheet_work_batches_time_check check (end_at > start_at),
  constraint timesheet_work_batches_total_hours_override_check
    check (total_hours_override is null or total_hours_override >= 0)
);

alter table public.timesheet_entries
add column if not exists work_batch_id uuid;

update public.timesheet_entries
set work_batch_id = gen_random_uuid()
where work_batch_id is null;

insert into public.timesheet_work_batches (
  id,
  auth0_user_id,
  auth0_email,
  workforce_email,
  start_at,
  end_at,
  total_hours_override,
  created_at,
  updated_at
)
select
  entry.work_batch_id,
  entry.auth0_user_id,
  entry.auth0_email,
  entry.workforce_email,
  entry.start_at,
  entry.end_at,
  entry.total_hours_override,
  entry.created_at,
  entry.updated_at
from public.timesheet_entries entry
where entry.work_batch_id is not null
on conflict (id) do nothing;

alter table public.timesheet_entries
alter column work_batch_id set not null;

alter table public.timesheet_entries
drop constraint if exists timesheet_entries_work_batch_id_fkey;

alter table public.timesheet_entries
add constraint timesheet_entries_work_batch_id_fkey
foreign key (work_batch_id) references public.timesheet_work_batches(id) on delete cascade;

create table if not exists public.timesheet_batch_work_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.timesheet_work_batches(id) on delete cascade,
  session_number integer not null check (session_number > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint timesheet_batch_work_sessions_time_check check (end_at > start_at),
  unique (batch_id, session_number)
);

insert into public.timesheet_batch_work_sessions (batch_id, session_number, start_at, end_at)
select
  entry.work_batch_id,
  session.session_number,
  session.start_at,
  session.end_at
from public.timesheet_entries entry
join public.timesheet_work_sessions session on session.entry_id = entry.id
on conflict (batch_id, session_number) do nothing;

insert into public.timesheet_batch_work_sessions (batch_id, session_number, start_at, end_at)
select entry.work_batch_id, 1, entry.start_at, entry.end_at
from public.timesheet_entries entry
where not exists (
  select 1
  from public.timesheet_batch_work_sessions session
  where session.batch_id = entry.work_batch_id
)
on conflict (batch_id, session_number) do nothing;

create index if not exists timesheet_work_batches_auth0_user_id_idx
on public.timesheet_work_batches(auth0_user_id);

create index if not exists timesheet_work_batches_created_at_idx
on public.timesheet_work_batches(created_at desc);

create index if not exists timesheet_entries_work_batch_id_idx
on public.timesheet_entries(work_batch_id);

create index if not exists timesheet_batch_work_sessions_batch_id_idx
on public.timesheet_batch_work_sessions(batch_id);

drop trigger if exists timesheet_work_batches_set_updated_at on public.timesheet_work_batches;
create trigger timesheet_work_batches_set_updated_at
before update on public.timesheet_work_batches
for each row
execute function public.set_updated_at();

alter table public.timesheet_work_batches enable row level security;
alter table public.timesheet_batch_work_sessions enable row level security;
