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

create index if not exists user_profiles_auth0_email_idx on public.user_profiles(auth0_email);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
