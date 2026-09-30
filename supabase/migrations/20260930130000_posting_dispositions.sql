-- Opportunities step 6 (items 2 & 3): the user's own status on a posting — their override of the
-- app's recommendation chip AND the minimal action-tracking store, in one table. A row is keyed by
-- posting identity (normalized URL, with employer + requisition as a secondary match) so a status
-- set on a posting survives across weekly runs, including when the posting is carried forward.
create table if not exists public.posting_dispositions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  normalized_url text not null,
  source_url text not null,
  employer_key text not null default '',
  requisition_id text,
  status text not null check (status in ('watching', 'applied', 'talking', 'passed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);

alter table public.posting_dispositions enable row level security;

drop policy if exists "posting_dispositions_own" on public.posting_dispositions;
create policy "posting_dispositions_own"
  on public.posting_dispositions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Secondary lookup: match a carried/re-found posting whose URL changed but employer + requisition did not.
create index if not exists posting_dispositions_user_emp_req_idx
  on public.posting_dispositions (user_id, employer_key, requisition_id);
