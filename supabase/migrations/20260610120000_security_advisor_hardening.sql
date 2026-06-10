-- Resolves Supabase Security Advisor warnings (2026-06-10):
--
-- 1. "RLS Policy Always True" on public.opportunities:
--    Any signed-in user could insert or overwrite rows in the shared
--    opportunities catalog. Ingestion now runs server-side with the service
--    role (which bypasses RLS), so the permissive policies are removed.
--    Authenticated users keep read access via the existing select policy.
drop policy if exists "opportunities_insert_authenticated" on public.opportunities;
drop policy if exists "opportunities_update_authenticated" on public.opportunities;

-- 2. "Public/Signed-In Users Can Execute SECURITY DEFINER Function":
--    Postgres grants EXECUTE to PUBLIC on new functions by default. These
--    functions only need to run as triggers/internal automation, and trigger
--    firing does not require the invoking role to hold EXECUTE, so revoking
--    is safe.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable() exists in the hosted database but was not created by a
-- migration in this repo, so guard the revoke for environments (e.g. fresh
-- local resets) where it does not exist.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- 3. "Leaked Password Protection Disabled" is an Auth dashboard setting, not
--    a SQL change: Authentication -> Sign In / Up -> Passwords. Note it
--    requires a paid plan; on the Free plan, set a higher minimum password
--    length instead.
