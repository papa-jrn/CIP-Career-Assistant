-- Posting persistence across runs (Employers & Opportunities Rethink, build step 4).
--
-- A posting found and verified in an earlier run should not vanish when the next run's
-- (non-deterministic) discovery does not re-surface it -- this matters most for web-search-only
-- employers whose robots.txt blocks the direct reader (e.g. Dartmouth College). At the end of a
-- run, still-live prior postings are re-verified (a fetch of each posting's own page, no model
-- call) and carried forward as observations on the new run, preserving their original first_seen_at.
--
-- Safe to run more than once: it only adds a nullable-with-default column.

alter table public.job_search_observations
  add column if not exists carried_forward boolean not null default false;

-- Cross-run lookup of a user's recent postings by URL, for dedupe against the current run.
create index if not exists job_search_observations_user_url_idx
  on public.job_search_observations (user_id, source_url);
