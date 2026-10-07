-- Employers Part 6, first slice (lane-aware discovery): record which of the user's lanes a discovered
-- employer serves, so the review queue can show the lane fit and the user can correct it. Additive.
alter table public.employer_candidates
  add column if not exists relevant_lanes text[] not null default '{}';
