alter table public.opportunities
  add column if not exists description text,
  add column if not exists source_provider text,
  add column if not exists source_id text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now();

create unique index if not exists opportunities_source_url_key
  on public.opportunities (source_url)
  where source_url is not null;

drop policy if exists "opportunities_insert_authenticated" on public.opportunities;
create policy "opportunities_insert_authenticated"
  on public.opportunities for insert
  to authenticated
  with check (true);

drop policy if exists "opportunities_update_authenticated" on public.opportunities;
create policy "opportunities_update_authenticated"
  on public.opportunities for update
  to authenticated
  using (true)
  with check (true);
