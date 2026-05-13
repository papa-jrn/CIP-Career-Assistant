create table if not exists public.watched_employers (
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
  source_notes jsonb not null default '[]'::jsonb,
  last_reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, region)
);

alter table public.watched_employers enable row level security;

drop policy if exists "watched_employers_own" on public.watched_employers;
create policy "watched_employers_own"
  on public.watched_employers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.career_strategy_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  region_focus text[] not null default '{}',
  watched_employer_count integer not null default 0,
  opportunity_match_count integer not null default 0,
  summary text not null,
  next_actions text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.career_strategy_snapshots enable row level security;

drop policy if exists "career_strategy_snapshots_own" on public.career_strategy_snapshots;
create policy "career_strategy_snapshots_own"
  on public.career_strategy_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
