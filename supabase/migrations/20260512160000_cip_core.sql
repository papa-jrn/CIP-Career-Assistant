create table if not exists public.career_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  salary_target integer,
  preferred_work_modes text[] not null default '{}',
  preferred_industries text[] not null default '{}',
  geographic_preferences text[] not null default '{}',
  career_archetype text,
  confidence text not null default 'low',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_profiles enable row level security;

create policy "career_profiles_select_own"
  on public.career_profiles for select
  using (auth.uid() = user_id);

create policy "career_profiles_write_own"
  on public.career_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.career_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  title text not null,
  url text,
  extracted_text text,
  trust_state text not null default 'unverified',
  created_at timestamptz not null default now()
);

alter table public.career_sources enable row level security;

create policy "career_sources_own"
  on public.career_sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null,
  location text,
  work_mode text,
  salary_min integer,
  salary_max integer,
  source_url text,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.opportunities enable row level security;

create policy "opportunities_read_authenticated"
  on public.opportunities for select
  to authenticated
  using (true);

create table if not exists public.opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  match_score integer not null check (match_score between 0 and 100),
  confidence text not null default 'low',
  fit_summary text not null,
  missing_skills text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  approval_state text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

alter table public.opportunity_matches enable row level security;

create policy "opportunity_matches_own"
  on public.opportunity_matches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.career_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  recommendation text not null,
  confidence text not null default 'low',
  evidence jsonb not null default '[]'::jsonb,
  approval_state text not null default 'draft',
  created_at timestamptz not null default now()
);

alter table public.career_recommendations enable row level security;

create policy "career_recommendations_own"
  on public.career_recommendations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.weekly_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  summary text not null,
  highlights jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_briefings enable row level security;

create policy "weekly_briefings_own"
  on public.weekly_briefings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

create policy "audit_events_select_own"
  on public.audit_events for select
  using (auth.uid() = user_id);
