-- Rethink cutover (2026-09-23): the board-era job pipeline (Adzuna, Greenhouse/Lever board pulls,
-- keyword-overlap "match scores") is retired. Its records are ARCHIVED with provenance, not deleted:
-- they stay in place for the user's history but are no longer read by the app. New results come
-- from job_search_runs / job_search_observations (verified against each posting's own page).
--
-- Safe to run more than once: it only adds nullable columns and stamps rows that are not yet archived.

alter table public.opportunities
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

alter table public.opportunity_matches
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

update public.opportunities
  set archived_at = now(),
      archive_reason = 'Board-era pipeline retired at the Employers & Opportunities Rethink cutover (2026-09-23). Superseded by verified weekly job-search runs.'
  where archived_at is null;

update public.opportunity_matches
  set archived_at = now(),
      archive_reason = 'Board-era pipeline retired at the Employers & Opportunities Rethink cutover (2026-09-23). Superseded by verified weekly job-search runs.'
  where archived_at is null;
