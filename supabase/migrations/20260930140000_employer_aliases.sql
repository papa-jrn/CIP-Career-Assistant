-- Opportunities item 4 (employer resolution): the user's learned corrections that map a posting's
-- free-text employer name to one of their watched (canonical) employers. One row per normalized
-- observed name. canonical_name = '' means "force unresolved" — the correction for a wrong auto-merge
-- (e.g. keep "Dartmouth College" from ever resolving to "Dartmouth Health"). Auto-resolution is
-- deterministic and conservative; this table only records the user's overrides, and they persist
-- across every future run.
create table if not exists public.employer_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alias_norm text not null,
  canonical_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, alias_norm)
);

alter table public.employer_aliases enable row level security;

drop policy if exists "employer_aliases_own" on public.employer_aliases;
create policy "employer_aliases_own"
  on public.employer_aliases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
