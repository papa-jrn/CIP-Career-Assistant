-- Target workspace slice 2 (Employers & Opportunities Rethink §14).
--
-- Append-only status history for an employer the user is tracking or has been
-- offered. The current status is the latest event per key; earlier events stay
-- so "what changed" can be answered and so a decision can be reversed without
-- destroying the record of having made it.
--
-- Keyed by employer_key = normOrg(name) rather than a foreign key, deliberately:
-- the same decision has to apply to a watched employer AND to a discovery
-- candidate that has not been promoted, and "not interested" has to keep
-- suppressing an organisation that discovery re-suggests later under a slightly
-- different name. parent_key does the same job for a member organisation whose
-- parent the user excluded.
--
-- Same shape as employer_aliases and the 990 profile tables, so it is safe to
-- run more than once.

create table if not exists public.employer_target_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- normOrg(name): lowercase, punctuation stripped, so naming drift does not
  -- lose a decision the user already made.
  employer_key text not null check (char_length(employer_key) between 1 and 200),
  -- The name as it was when the event was recorded, for display and history.
  name text not null check (char_length(name) between 1 and 200),
  -- normOrg(parent_organization) when discovery knew one; lets an exclusion of
  -- a parent suppress its member organisations.
  parent_key text,
  status text not null check (
    status in ('new', 'researching', 'talk_first', 'monitoring', 'applying', 'paused', 'not_interested')
  ),
  note text not null default '',
  -- 'user' is a decision the person made; 'app' is a status the engine recorded
  -- on their behalf. A user event always outranks an app one at the same time.
  source text not null default 'user' check (source in ('user', 'app')),
  created_at timestamptz not null default now()
);

alter table public.employer_target_events enable row level security;

drop policy if exists "employer_target_events_own" on public.employer_target_events;
create policy "employer_target_events_own"
  on public.employer_target_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The common read: every event for a user, newest first, to fold into a current
-- status per key.
create index if not exists employer_target_events_user_key_idx
  on public.employer_target_events (user_id, employer_key, created_at desc);

-- Suppressing excluded organisations during discovery looks up by parent too.
create index if not exists employer_target_events_user_parent_idx
  on public.employer_target_events (user_id, parent_key);
