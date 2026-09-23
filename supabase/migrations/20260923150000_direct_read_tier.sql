-- Allow a posting to be labeled as found by the app reading an employer's own job list directly
-- (the fallback used only when the web search could not read that employer's listings).

alter table public.job_search_observations
  drop constraint if exists job_search_observations_source_tier_check;

alter table public.job_search_observations
  add constraint job_search_observations_source_tier_check
  check (source_tier in ('target_page', 'preferred_source', 'general', 'direct_read'));
