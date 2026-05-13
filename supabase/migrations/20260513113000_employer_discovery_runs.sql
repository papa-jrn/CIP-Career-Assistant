create table if not exists public.employer_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  geography text not null,
  radius_miles integer not null default 50,
  sectors text[] not null default '{}',
  minimum_size text not null default '100',
  engine_mode text not null default 'not_configured',
  summary text not null default '',
  sources_found integer not null default 0,
  candidates_found integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.employer_discovery_runs enable row level security;

drop policy if exists "employer_discovery_runs_own" on public.employer_discovery_runs;
create policy "employer_discovery_runs_own"
  on public.employer_discovery_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
