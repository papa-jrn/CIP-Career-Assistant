-- Employers Part 6, first slice (follow-up): record the larger health system / parent company a
-- discovered employer rolls up to, so member entities (e.g. Mary Hitchcock Memorial Hospital) can be
-- grouped and deduped against a watched parent (e.g. Dartmouth Health) that their name does not share
-- words with. Supplied by the discovery web search; additive.
alter table public.employer_candidates
  add column if not exists parent_organization text not null default '';
