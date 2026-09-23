-- Structured, user-confirmed search preferences (Employers & Opportunities Rethink, §8 step 1).
--
-- Append-only: editing a preference retires the old row (retired_at) and inserts a new one, so
-- history is preserved and nothing is silently overwritten. "Active" means retired_at is null.
-- Free-text intake answers are never interpreted into rows automatically; a row exists only
-- because the user confirmed it on the Search Preferences page.
--
-- kind / value conventions:
--   salary_floor        value = whole annual USD as text, amount = same number
--   work_mode           value = onsite | hybrid | remote
--   remote_limit        value = free text residency / work-authorization limit
--   exclusion_industry  value = industry name (hard exclusion, applied locally, never sent out)
--   exclusion_role      value = role/title text
--   exclusion_employer  value = organization name
--   anchor              value = place to geocode (e.g. "White River Junction, VT"), radius_miles set
--
-- scope/scope_ref exist so an explicit preference can later be limited to one lane, employer, or
-- role (§13). The v1 UI writes global scope only, and readers ignore non-global rows for now.

create table if not exists public.search_preference_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (
    kind in (
      'salary_floor',
      'work_mode',
      'remote_limit',
      'exclusion_industry',
      'exclusion_role',
      'exclusion_employer',
      'anchor'
    )
  ),
  value text not null check (char_length(value) between 1 and 300),
  amount numeric check (amount is null or amount > 0),
  radius_miles integer check (radius_miles is null or radius_miles between 1 and 100),
  scope text not null default 'global' check (scope in ('global', 'lane', 'employer', 'role')),
  scope_ref text,
  source text not null default 'user_entered' check (source in ('user_entered')),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

alter table public.search_preference_items enable row level security;

drop policy if exists "search_preference_items_own" on public.search_preference_items;
create policy "search_preference_items_own"
  on public.search_preference_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- At most one active row per identical preference. Single-valued kinds (salary_floor,
-- remote_limit) are resolved in code as "newest active wins"; the writer inserts the new row
-- before retiring the old one so a failed save can never leave the user with no preference.
create unique index if not exists search_preference_items_active_unique_idx
  on public.search_preference_items (user_id, kind, lower(value), scope, coalesce(scope_ref, ''))
  where retired_at is null;

create index if not exists search_preference_items_user_active_idx
  on public.search_preference_items (user_id, kind)
  where retired_at is null;
