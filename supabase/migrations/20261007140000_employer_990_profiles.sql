-- IRS Form 990 enrichment profiles for saved (watched) employers. One row per user + employer
-- identity (normOrg of the watched name — the same key the recommendation chips resolve to), so a
-- posting's resolved employer attaches with no new matching machinery. Additive: employers without
-- a row simply have no 990 data (unknown, never poor fit).
create table if not exists public.employer_990_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employer_key text not null,
  employer_name text not null default '',
  ein bigint,
  organization_name text not null default '',
  ntee_code text not null default '',
  latest_revenue_usd bigint,
  latest_expenses_usd bigint,
  latest_assets_usd bigint,
  latest_filing_year integer,
  filing_count integer not null default 0,
  trend text not null default 'unknown' check (trend in ('growing', 'stable', 'shrinking', 'unknown')),
  revenue_series jsonb not null default '[]',
  pdf_url text not null default '',
  source_url text not null default '',
  status text not null default 'ok' check (status in ('ok', 'no_match', 'no_filings', 'lookup_failed')),
  status_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, employer_key)
);

alter table public.employer_990_profiles enable row level security;

drop policy if exists "employer_990_profiles_own" on public.employer_990_profiles;
create policy "employer_990_profiles_own" on public.employer_990_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
