create table if not exists public.discovery_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  region text not null,
  source_type text not null,
  url text not null,
  access_type text not null default 'public',
  usefulness_score integer not null default 50 check (usefulness_score between 0 and 100),
  notes text not null default '',
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, name, region)
);

alter table public.discovery_sources enable row level security;

drop policy if exists "discovery_sources_own" on public.discovery_sources;
create policy "discovery_sources_own"
  on public.discovery_sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.employer_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  region text not null,
  category text not null,
  location text,
  estimated_size text,
  priority text not null default 'medium',
  fit_score integer not null default 50 check (fit_score between 0 and 100),
  fit_summary text not null default '',
  target_roles text[] not null default '{}',
  source_url text,
  careers_url text,
  adapter_status text not null default 'needs_adapter',
  confidence text not null default 'medium',
  discovery_channel text not null default 'regional_directory',
  discovery_source_names text[] not null default '{}',
  source_notes jsonb not null default '[]'::jsonb,
  review_state text not null default 'pending',
  last_reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, region)
);

alter table public.employer_candidates enable row level security;

drop policy if exists "employer_candidates_own" on public.employer_candidates;
create policy "employer_candidates_own"
  on public.employer_candidates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
