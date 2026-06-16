create extension if not exists pgcrypto;

create table if not exists public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  auth0_user_id text not null,
  auth0_email text,
  workforce_email text not null,
  primary_programming_language text not null default 'Not specified',
  secondary_programming_languages text,
  live_compare_problem_id text not null,
  task_url text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  summary text not null,
  comments text,
  token_usage bigint check (token_usage is null or token_usage >= 0),
  blocked_on_taiga_bug boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timesheet_entries_time_check check (end_at > start_at),
  constraint timesheet_entries_summary_check check (
    array_length(regexp_split_to_array(trim(summary), '\s+'), 1) <= 100
  )
);

alter table public.timesheet_entries
add column if not exists primary_programming_language text not null default 'Not specified';

alter table public.timesheet_entries
add column if not exists secondary_programming_languages text;

create table if not exists public.user_profiles (
  auth0_user_id text primary key,
  auth0_email text,
  name text not null,
  workforce_email text,
  discord_id text,
  hubstaff_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_workforce_email_check check (
    workforce_email is null or lower(workforce_email) like '%@alignerrworkforce.com'
  )
);

create table if not exists public.timesheet_turns (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.timesheet_entries(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  task_type text not null check (
    task_type in (
      'Debugging',
      'Root Cause Analysis',
      'System-Level Investigation',
      'Code writing',
      'Code review',
      'Exploration & learning',
      'Maintenance & ops tooling',
      'Planning & requirements',
      'Design',
      'Testing',
      'Deployment & infra',
      'Communication'
    )
  ),
  created_at timestamptz not null default now(),
  unique (entry_id, turn_number)
);

create index if not exists timesheet_entries_auth0_user_id_idx on public.timesheet_entries(auth0_user_id);
create index if not exists timesheet_entries_created_at_idx on public.timesheet_entries(created_at desc);
create index if not exists timesheet_turns_entry_id_idx on public.timesheet_turns(entry_id);
create index if not exists user_profiles_auth0_email_idx on public.user_profiles(auth0_email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists timesheet_entries_set_updated_at on public.timesheet_entries;
create trigger timesheet_entries_set_updated_at
before update on public.timesheet_entries
for each row
execute function public.set_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.timesheet_entries enable row level security;
alter table public.timesheet_turns enable row level security;
alter table public.user_profiles enable row level security;
