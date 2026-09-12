create table if not exists public.conversation_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_name text not null,
  contact_organization text,
  contact_title text,
  conversation_date date,
  source_note_id uuid,
  source_ref text,
  related_lane text,
  related_employer text,
  signal_type text not null default 'market_signal',
  signal_direction text not null default 'unclear',
  confidence text not null default 'medium',
  compensation_signal text not null default '',
  work_model_signal text not null default '',
  culture_signal text not null default '',
  hiring_signal text not null default '',
  market_signal text not null default '',
  new_leads text not null default '',
  warnings text not null default '',
  promised_follow_up text not null default '',
  follow_up_due_date date,
  next_action text not null default '',
  raw_note_excerpt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversation_outcomes enable row level security;

drop policy if exists "conversation_outcomes_own" on public.conversation_outcomes;
create policy "conversation_outcomes_own"
  on public.conversation_outcomes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists conversation_outcomes_user_created_idx
  on public.conversation_outcomes (user_id, created_at desc);

create index if not exists conversation_outcomes_user_lane_idx
  on public.conversation_outcomes (user_id, related_lane)
  where related_lane is not null;

create index if not exists conversation_outcomes_user_employer_idx
  on public.conversation_outcomes (user_id, related_employer)
  where related_employer is not null;
