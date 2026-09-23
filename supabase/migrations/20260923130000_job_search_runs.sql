-- Weekly job-search run records (Employers & Opportunities Rethink, §12, build step 3).
--
-- Append-only history. A run stores exactly what was decided and sent (private brief, outbound
-- facets), what was attempted, what it cost, and how it ended. Observations are what each run
-- found and how each posting was verified. Posting identity and dedupe across runs is build step 4
-- and links to these rows later; nothing here merges postings.

-- 1. Allow "preferred job sources" (domains the user trusts) as a preference kind.
alter table public.search_preference_items
  drop constraint if exists search_preference_items_kind_check;
alter table public.search_preference_items
  add constraint search_preference_items_kind_check check (
    kind in (
      'salary_floor',
      'work_mode',
      'remote_limit',
      'exclusion_industry',
      'exclusion_role',
      'exclusion_employer',
      'anchor',
      'job_source'
    )
  );

-- 2. Runs.
create table if not exists public.job_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Client-supplied key rendered with the button. A repeated click reuses the same run.
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'not_configured', 'budget_limited')
  ),
  brief_schema_version integer not null,
  brief_fingerprint text not null,
  -- The full private brief and the exact outbound projection that was sent to the provider.
  brief jsonb not null,
  outbound_facets jsonb not null,
  provider text not null,
  model text not null,
  -- Planned steps and how far the run has advanced (each step is one bounded provider call).
  plan jsonb not null default '[]'::jsonb,
  next_step integer not null default 0,
  -- Caps applied to this run, so the record shows what limits were in force.
  limits jsonb not null default '{}'::jsonb,
  -- Per-step trace: queries, pages opened, tokens, errors.
  trace jsonb not null default '[]'::jsonb,
  -- Coverage: per target/source, what could and could not be read.
  coverage jsonb not null default '[]'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  -- Null when usage or pricing is unavailable. Never a made-up number.
  estimated_cost_usd numeric,
  cost_basis text not null default 'unavailable' check (cost_basis in ('estimated', 'unavailable')),
  summary text not null default '',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.job_search_runs enable row level security;

drop policy if exists "job_search_runs_own" on public.job_search_runs;
create policy "job_search_runs_own"
  on public.job_search_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A repeated click cannot create a second run, and only one run may be active per user.
create unique index if not exists job_search_runs_idempotency_idx
  on public.job_search_runs (user_id, idempotency_key);

create unique index if not exists job_search_runs_one_active_idx
  on public.job_search_runs (user_id)
  where status in ('queued', 'running');

create index if not exists job_search_runs_user_started_idx
  on public.job_search_runs (user_id, started_at desc);

-- 3. Observations: one row per posting found in a run, with its verification outcome.
create table if not exists public.job_search_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid not null references public.job_search_runs (id) on delete cascade,
  title text not null,
  employer_text text not null,
  worksite_text text,
  source_url text not null,
  requisition_id text,
  posted_text text,
  salary_text text,
  remote_status text not null default 'not_stated' check (remote_status in ('onsite', 'hybrid', 'remote', 'not_stated')),
  matched_role_term text,
  evidence_excerpt text,
  -- Where in the tiered search this came from.
  source_tier text not null default 'general' check (source_tier in ('target_page', 'preferred_source', 'general')),
  verification_state text not null default 'discovered_unverified' check (
    verification_state in (
      'discovered_unverified',
      'verified_open',
      'source_reports_closed',
      'no_longer_visible',
      'verification_unavailable'
    )
  ),
  verification_note text,
  verification_checked_at timestamptz,
  -- Straight-line location assessment against the user's anchors.
  location_status text check (location_status in ('within', 'outside', 'unknown', 'ambiguous')),
  location_distance_miles numeric,
  location_note text,
  -- Set when the posting matches a hard exclusion (kept and shown as excluded, never silently dropped).
  exclusion_hit text,
  first_seen_at timestamptz not null default now()
);

alter table public.job_search_observations enable row level security;

drop policy if exists "job_search_observations_own" on public.job_search_observations;
create policy "job_search_observations_own"
  on public.job_search_observations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists job_search_observations_run_idx
  on public.job_search_observations (run_id);

create index if not exists job_search_observations_user_idx
  on public.job_search_observations (user_id, first_seen_at desc);
