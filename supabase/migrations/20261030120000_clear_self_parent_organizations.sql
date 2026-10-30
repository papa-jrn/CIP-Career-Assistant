-- Discovery used to store whatever the model put in `parent_organization`, and the model routinely
-- repeated the employer's own name: saved rows read "Intuit Inc. - Part of Intuit Inc.", and the
-- shared-organization notice counted a self-parented row, so the UI suggested adding a parent that
-- was already in the list. Commit 1684ebb stops that at ingest; rows written before it keep their
-- value, which is what this clears.
--
-- Point-in-time cleanup, not an ongoing rule: ingest is the ongoing rule. The comparison below
-- mirrors `normalizeOrganizationName` in src/lib/cip/organization-names.ts as it stood at 1684ebb.
-- Safe to run twice.

create or replace function pg_temp.norm_org(value text) returns text as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(value, '')), '&', ' and ', 'g'),
             '\y(the|inc|incorporated|llc|llp|lp|ltd|limited|corp|corporation|company|co|plc|gmbh|ag|nv|sa)\y', ' ', 'g'),
           '[^a-z0-9]', '', 'g');
$$ language sql immutable;

-- A company is not its own parent.
update public.employer_candidates
   set parent_organization = ''
 where parent_organization <> ''
   and pg_temp.norm_org(parent_organization) = pg_temp.norm_org(name);

-- parent_key carries normOrg(parent_organization), and a parent-level exclusion suppresses that
-- parent's members. Where the key equals the employer's own, the row grouped an employer under
-- itself; null is the honest value.
update public.employer_target_events
   set parent_key = null
 where parent_key is not null
   and parent_key = employer_key;
