-- ============================================================================
-- RLS / RPC acceptance tests for the Requisitions permissions alignment.
--
-- Run ONLY against a throwaway Postgres (never production): it creates
-- fixture users/items and a `rt_test` schema. See
-- esn-docs/content/apps/requisitions-refactor-spec.md, "How to test".
--
-- Personas (fixtures expected from the stub script):
--   ...0a  Requisitions admin : volunteer + user_project_access role=admin
--   ...0b  Volunteer          : profiles.role = volunteer, no grant
--   ...0e  Volunteer 2        : second volunteer (transfer target)
--   ...0c  Student            : authenticated, not staff → unauthorised
--   ...0d  Ex-volunteer       : student but with a stale admin grant
--   null   Anonymous          : no JWT
-- Output: one PASS/FAIL line per case; final line counts failures.
-- ============================================================================

create schema if not exists rt_test;
create table if not exists rt_test.results (n serial, label text, ok boolean, detail text);
truncate rt_test.results;

-- Run `p_sql` as `p_user` (null = anon) and record whether the outcome matched.
-- p_expect: 'ok' (no error), 'deny' (error 42501 / RLS violation),
--           'error' (business-rule error, not a permission error),
--           'rows:N' (query returns N rows), 'affected:N' (DML touched N rows),, 'true'/'false' (scalar boolean).
create or replace function rt_test.check(p_label text, p_user uuid, p_sql text, p_expect text)
returns void language plpgsql as $$
declare
  v_res text; v_ok boolean; v_detail text := '';
begin
  begin
    perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
    perform set_config('request.jwt.claim.role', case when p_user is null then 'anon' else 'authenticated' end, true);
    if p_expect like 'rows:%' then
      execute format('select count(*)::text from (%s) q', p_sql) into v_res;
      v_ok := v_res = split_part(p_expect, ':', 2);
    elsif p_expect like 'affected:%' then
      execute p_sql;
      get diagnostics v_res = row_count;
      v_ok := v_res = split_part(p_expect, ':', 2);
    elsif p_expect in ('true', 'false') then
      execute p_sql into v_res;
      v_ok := v_res = p_expect;
    else
      execute p_sql;
      v_ok := p_expect = 'ok';
      v_res := 'no error';
    end if;
    perform set_config('role', 'postgres', true);
    raise exception 'rt_rollback' using errcode = 'RT001';  -- undo side effects
  exception
    when sqlstate 'RT001' then null;
    when others then
      v_res := sqlstate || ' ' || sqlerrm;
      v_ok := (p_expect = 'deny' and sqlstate = '42501') or (p_expect = 'error' and sqlstate <> '42501');
  end;
  perform set_config('role', 'postgres', true);
  insert into rt_test.results (label, ok, detail) values (p_label, v_ok, 'expected ' || p_expect || ', got ' || coalesce(v_res, 'null'));
end $$;

-- Fixtures (as owner). Item 1 in office, item 2 held by volunteer B.
insert into requisitions_tracker.categories (id, key, name)
  values ('10000000-0000-0000-0000-000000000001', 'sound', 'Sound') on conflict do nothing;
insert into requisitions_tracker.items (id, legacy_id, name, category_id)
  values ('20000000-0000-0000-0000-000000000001', 'fsDoc1', 'Speaker', '10000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into requisitions_tracker.items (id, name, status, holder_id, holder_name)
  values ('20000000-0000-0000-0000-000000000002', 'Flag', 'out', '00000000-0000-0000-0000-00000000000b', 'Vol') on conflict do nothing;

do $$
declare
  A uuid := '00000000-0000-0000-0000-00000000000a';
  V uuid := '00000000-0000-0000-0000-00000000000b';
  V2 uuid := '00000000-0000-0000-0000-00000000000e';
  S uuid := '00000000-0000-0000-0000-00000000000c';
  X uuid := '00000000-0000-0000-0000-00000000000d';
  i1 text := '''20000000-0000-0000-0000-000000000001''';
  i2 text := '''20000000-0000-0000-0000-000000000002''';
begin
  -- inventory.view
  perform rt_test.check('anon cannot read items',            null, 'select * from requisitions_tracker.items', 'deny');
  perform rt_test.check('student sees 0 items',              S, 'select * from requisitions_tracker.items', 'rows:0');
  perform rt_test.check('ex-volunteer sees 0 items',         X, 'select * from requisitions_tracker.items', 'rows:0');
  perform rt_test.check('volunteer sees 2 items',            V, 'select * from requisitions_tracker.items_view', 'rows:2');
  perform rt_test.check('admin sees 2 items',                A, 'select * from requisitions_tracker.items_view', 'rows:2');
  perform rt_test.check('student sees 0 volunteers',         S, 'select * from requisitions_tracker.volunteers', 'rows:0');
  perform rt_test.check('volunteer sees 3 volunteers',       V, 'select * from requisitions_tracker.volunteers', 'rows:3');
  -- capability resolution
  perform rt_test.check('volunteer my_capabilities = 4 use keys', V, 'select * from requisitions_tracker.my_capabilities()', 'rows:4');
  perform rt_test.check('admin my_capabilities = all 8',     A, 'select * from requisitions_tracker.my_capabilities()', 'rows:8');
  perform rt_test.check('student my_capabilities = 0',       S, 'select * from requisitions_tracker.my_capabilities()', 'rows:0');
  perform rt_test.check('ex-volunteer stale admin grant ignored', X, 'select requisitions_tracker.can(''requisitions.catalogue.manage'')::text', 'false');
  perform rt_test.check('unknown key fails closed',          A, 'select requisitions_tracker.can(''requisitions.foo.bar'')::text', 'false');
  perform rt_test.check('admin may check another user',      A, format('select requisitions_tracker.can(''requisitions.inventory.view'', %L)::text', V), 'true');
  perform rt_test.check('capability_check not callable by clients', V, format('select requisitions_tracker.capability_check(''requisitions.inventory.view'', %L)', V), 'deny');
  perform rt_test.check('volunteer cannot probe admin of others', V, format('select requisitions_tracker.can(''requisitions.inventory.view'', %L)::text', A), 'false');
  perform rt_test.check('is_admin not callable by clients',  V, 'select requisitions_tracker.is_admin()', 'deny');
  -- movements (use tier)
  perform rt_test.check('volunteer can pick up',             V, format('select * from requisitions_tracker.move_item(%s, ''pickup'')', i1), 'ok');
  perform rt_test.check('volunteer can return own item',     V, format('select * from requisitions_tracker.move_item(%s, ''return'')', i2), 'ok');
  perform rt_test.check('volunteer can pass own item',       V, format('select * from requisitions_tracker.move_item(%s, ''pass'', %L)', i2, V2), 'ok');
  perform rt_test.check('volunteer cannot pass to student',  V, format('select * from requisitions_tracker.move_item(%s, ''pass'', %L)', i2, S), 'error');
  perform rt_test.check('student cannot pick up',            S, format('select * from requisitions_tracker.move_item(%s, ''pickup'')', i1), 'deny');
  perform rt_test.check('anon cannot call move_item',        null, format('select * from requisitions_tracker.move_item(%s, ''pickup'')', i1), 'deny');
  perform rt_test.check('volunteer cannot write status directly', V, format('update requisitions_tracker.items set status = ''office'' where id = %s', i2), 'deny');
  perform rt_test.check('volunteer cannot insert transfers', V, format('insert into requisitions_tracker.transfers (item_name, action) values (''x'', ''pickup'')'), 'deny');
  -- management tier
  perform rt_test.check('volunteer cannot admin_move_item',  V, format('select * from requisitions_tracker.admin_move_item(%s, ''return'')', i2), 'deny');
  perform rt_test.check('admin can force-return',            A, format('select * from requisitions_tracker.admin_move_item(%s, ''return'')', i2), 'ok');
  perform rt_test.check('admin can assign',                  A, format('select * from requisitions_tracker.admin_move_item(%s, ''assign'', %L)', i1, V), 'ok');
  perform rt_test.check('ex-volunteer cannot admin_move_item', X, format('select * from requisitions_tracker.admin_move_item(%s, ''return'')', i2), 'deny');
  perform rt_test.check('admin can create item',             A, 'insert into requisitions_tracker.items (name) values (''Tent'')', 'ok');
  perform rt_test.check('volunteer cannot create item',      V, 'insert into requisitions_tracker.items (name) values (''Tent'')', 'deny');
  perform rt_test.check('admin can rename item',             A, format('update requisitions_tracker.items set name = ''Big speaker'' where id = %s returning 1', i1), 'ok');
  perform rt_test.check('volunteer rename affects 0 rows',   V, format('update requisitions_tracker.items set name = ''x'' where id = %s', i1), 'affected:0');
  perform rt_test.check('admin cannot delete transfers',     A, 'delete from requisitions_tracker.transfers', 'deny');
  perform rt_test.check('admin can create category',         A, 'insert into requisitions_tracker.categories (key, name) values (''tents'', ''Tents'')', 'ok');
  perform rt_test.check('volunteer cannot create category',  V, 'insert into requisitions_tracker.categories (key, name) values (''tents'', ''Tents'')', 'deny');
  -- audit
  perform rt_test.check('admin can read audit log (3 fixture rows)', A, 'select * from requisitions_tracker.catalogue_audit', 'rows:3');
  perform rt_test.check('volunteer cannot read audit log',   V, 'select * from requisitions_tracker.catalogue_audit', 'rows:0');
end $$;

-- Audit trigger check outside the rollback wrapper (as owner, then cleaned up):
-- fixtures above produced 3 INSERT rows; movement-only updates must add none.
insert into rt_test.results (label, ok, detail)
select 'fixture inserts audited (3), movements not audited', count(*) = 3, count(*)::text || ' audit rows'
  from requisitions_tracker.catalogue_audit;

select case when ok then 'PASS' else 'FAIL' end as result, label, detail from rt_test.results order by n;
select count(*) filter (where not ok) as failures, count(*) as total from rt_test.results;
