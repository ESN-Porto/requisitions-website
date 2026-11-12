-- ============================================================================
-- Stubs for running the Requisitions migrations + RLS tests in a THROWAWAY
-- Postgres 15 (plain postgres:15 image, NOT Supabase, NEVER production).
--
-- Recreates the minimum of the shared ESN Supabase that
--   20260905120000_supabase_backend.sql
--   20261107120000_permissions_alignment.sql
--   tests/rls_permissions_test.sql
-- depend on. See esn-docs/content/apps/requisitions-refactor-spec.md §8.
--
-- Sources of the real shared helpers (copied verbatim, read-only):
--   * public.has_project_access  ← /root/migrations/20260903b_has_project_access_grant_requires_staff.sql
--                                  (the live version, verified 2026-11-09)
--   * public.is_project_admin,
--     public.is_staff,
--     public.is_esn_admin         ← /root/migrations/2026-04-11/full_db.dump
--                                  (pg_dump of 2026-04-11; may lag prod if they
--                                  changed since — re-check before relying on it)
-- Table shapes (columns used by the migrations/helpers only) also come from the
-- 2026-04-11 dump. Everything here is owned by `postgres` (prod: supabase_admin).
--
-- Personas match the header of rls_permissions_test.sql. Fake people only.
--
-- Apply first:  psql -v ON_ERROR_STOP=1 -U postgres < supabase/tests/stubs.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Supabase roles
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon          nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role  nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

-- ----------------------------------------------------------------------------
-- 2. auth schema: users table + JWT-claim helpers (same logic as Supabase:
--    request.jwt.claim.<x> first, then the request.jwt.claims JSON)
-- ----------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Shared identity / access tables (IT Manager contract)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'user_role') then
    create type public.user_role as enum ('student', 'volunteer', 'admin');
  end if;
end $$;

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  avatar_url text,
  role       public.user_role not null default 'student'
);

create table if not exists public.projects (
  slug         text primary key,
  name         text not null,
  access_level text not null default 'custom'
    constraint valid_access_level check (access_level in ('public', 'staff_only', 'admin_only', 'custom')),
  is_active    boolean default true
);

create table if not exists public.user_project_access (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  project_slug text not null,
  role         text not null default 'user' constraint valid_role check (role in ('user', 'admin')),
  granted_at   timestamptz default now(),
  revoked_at   timestamptz
);

create schema if not exists it_manager;
create table if not exists it_manager.volunteers (
  id           uuid primary key,
  name         text,
  display_name text,
  email        text,
  photo_url    text,
  status       text default 'new_member'
);

-- ----------------------------------------------------------------------------
-- 4. Storage + realtime: only what the old migration touches
--    (DROP POLICY IF EXISTS ... ON storage.objects; ALTER PUBLICATION ... ADD TABLE)
-- ----------------------------------------------------------------------------
create schema if not exists storage;
create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text
);

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Real helper bodies
-- ----------------------------------------------------------------------------

-- From 2026-04-11 full_db.dump (verbatim).
CREATE OR REPLACE FUNCTION public.is_esn_admin(check_user_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  target_user_id uuid;
BEGIN
  target_user_id := COALESCE(check_user_id, auth.uid());

  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = target_user_id
    AND role = 'admin'
  );
END;
$$;

-- From 2026-04-11 full_db.dump (verbatim).
CREATE OR REPLACE FUNCTION public.is_staff(check_user_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Se não passar user_id, usa o usuário atual
  target_user_id := COALESCE(check_user_id, auth.uid());

  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = target_user_id
    AND role IN ('volunteer', 'admin')
  );
END;
$$;

-- From 2026-04-11 full_db.dump (verbatim).
CREATE OR REPLACE FUNCTION public.is_project_admin(check_project_slug text, check_user_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  target_user_id uuid;
BEGIN
  target_user_id := COALESCE(check_user_id, auth.uid());

  -- ESN admins are admin of every project
  IF public.is_esn_admin(target_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Check explicit admin role in user_project_access
  RETURN EXISTS (
    SELECT 1 FROM public.user_project_access
    WHERE user_id = target_user_id
    AND project_slug = check_project_slug
    AND role = 'admin'
    AND revoked_at IS NULL
  );
END;
$$;

-- From 20260903b_has_project_access_grant_requires_staff.sql (verbatim; live version).
CREATE OR REPLACE FUNCTION public.has_project_access(
  check_project_slug text,
  check_user_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_user_id uuid;
  project_record RECORD;
  has_grant boolean;
BEGIN
  target_user_id := COALESCE(check_user_id, auth.uid());

  -- ESN admins have access to everything
  IF public.is_esn_admin(target_user_id) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO project_record
  FROM public.projects
  WHERE slug = check_project_slug AND is_active = true;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  has_grant := EXISTS (
    SELECT 1 FROM public.user_project_access
    WHERE user_id = target_user_id
      AND project_slug = check_project_slug
      AND revoked_at IS NULL
  );

  CASE project_record.access_level
    WHEN 'public' THEN
      RETURN target_user_id IS NOT NULL;
    WHEN 'staff_only' THEN
      -- a concessão não substitui ser staff, só se soma a ela
      RETURN public.is_staff(target_user_id);
    WHEN 'admin_only' THEN
      RETURN has_grant AND public.is_staff(target_user_id);
    WHEN 'custom' THEN
      RETURN has_grant;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$function$;

-- Same ACL as the dump (GRANT ALL to anon/authenticated/service_role).
grant execute on function public.is_esn_admin(uuid), public.is_staff(uuid),
                          public.is_project_admin(text, uuid), public.has_project_access(text, uuid)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Fixtures: project row + 5 personas (see rls_permissions_test.sql header)
-- ----------------------------------------------------------------------------
insert into public.projects (slug, name, access_level, is_active)
values ('requisitions_tracker', 'Requisitions Tracker', 'staff_only', true)
on conflict (slug) do update set access_level = excluded.access_level, is_active = excluded.is_active;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'req-admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'volunteer@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'volunteer2@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'student@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'ex-volunteer@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Req Admin',    'req-admin@example.test',    'volunteer'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Volunteer',    'volunteer@example.test',    'volunteer'),
  ('00000000-0000-0000-0000-00000000000e', 'Test Volunteer Two','volunteer2@example.test',   'volunteer'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Student',      'student@example.test',      'student'),
  ('00000000-0000-0000-0000-00000000000d', 'Test Ex Volunteer', 'ex-volunteer@example.test', 'student')
on conflict (id) do nothing;

insert into it_manager.volunteers (id, name, display_name, email, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Req Admin',     'Req Admin',  'req-admin@example.test',    'member'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Volunteer',     'Volunteer',  'volunteer@example.test',    'member'),
  ('00000000-0000-0000-0000-00000000000e', 'Test Volunteer Two', 'Volunteer 2','volunteer2@example.test',   'member'),
  ('00000000-0000-0000-0000-00000000000d', 'Test Ex Volunteer',  'Ex Vol',     'ex-volunteer@example.test', 'alumni')
on conflict (id) do nothing;

-- Requisitions admin: volunteer + explicit admin grant.
-- Ex-volunteer: stale admin grant never revoked (revoked_at null) after demotion to student.
insert into public.user_project_access (user_id, project_slug, role, revoked_at)
select u, 'requisitions_tracker', 'admin', null
  from (values ('00000000-0000-0000-0000-00000000000a'::uuid),
               ('00000000-0000-0000-0000-00000000000d'::uuid)) g(u)
 where not exists (select 1 from public.user_project_access x
                    where x.user_id = g.u and x.project_slug = 'requisitions_tracker');

commit;
