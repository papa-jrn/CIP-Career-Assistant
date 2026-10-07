-- IRS EIN for employer candidates discovered through the 990 layer, so promotion can attach the
-- financial profile without parsing source_notes. Nullable: web-search candidates have no EIN.
alter table public.employer_candidates add column if not exists ein bigint;
