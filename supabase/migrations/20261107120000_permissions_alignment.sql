-- ============================================================================
-- Requisitions Tracker — permissions alignment (forward-only)
--
-- Base: 20260905120000_supabase_backend.sql, ALREADY APPLIED in production.
-- Do NOT edit that file; this migration moves the applied schema to the
-- target design in ESN Docs (roadmap/permissions-spec, apps/requisitions-refactor-spec):
--
--   1. Capability keys `requisitions.<resource>.<action>` declared in a small
--      app-local catalogue, resolved by ONE function: requisitions_tracker.can(key).
--      Today can() maps every key onto the shared IT Manager contract:
--        tier 'use'    → public.has_project_access('requisitions_tracker')
--        tier 'manage' → has_project_access(...) AND public.is_project_admin(...)
--      When the org-wide public.authorize() exists, only capability_check()'s body changes;
--      policies and RPCs keep calling can(). No org-wide framework is built here.
--   2. Every RLS policy and RPC gate goes through can() (was: is_staff() directly,
--      which ignored the project's access_level / is_active switch).
--   3. "Manage" also requires use access: a stale user_project_access admin
--      grant on someone who is no longer a volunteer no longer works.
--   4. Catalogue changes (items/categories insert/update/delete) are audited in
--      an append-only table written by trigger.
--   5. Grant hygiene: default privileges, internal helpers not callable by clients,
--      is_admin(uuid) no longer lets anyone probe other users.
--
-- Idempotent: safe to run twice. Apply as supabase_admin:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < this_file
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Capability catalogue (data, not code). Keys follow permissions-spec.md.
-- ----------------------------------------------------------------------------
create table if not exists requisitions_tracker.capabilities (
  key         text primary key check (key ~ '^requisitions\.[a-z_]+\.[a-z_]+$'),
  tier        text not null check (tier in ('use', 'manage')),
  description text not null,
  enforced_in text not null   -- where the DB enforces it (documentation for reviewers)
);

insert into requisitions_tracker.capabilities (key, tier, description, enforced_in) values
  ('requisitions.inventory.view',    'use',    'See items, categories, holders and movement history', 'RLS select on items/categories/transfers, volunteers view'),
  ('requisitions.items.checkout',    'use',    'Pick up an item from the office',                    'RPC move_item(pickup)'),
  ('requisitions.items.return',      'use',    'Return an item you hold to the office',              'RPC move_item(return)'),
  ('requisitions.items.transfer',    'use',    'Pass an item you hold / take an item from its holder','RPC move_item(pass|take)'),
  ('requisitions.items.override',    'manage', 'Force-return or assign any item to any volunteer',   'RPC admin_move_item'),
  ('requisitions.catalogue.manage',  'manage', 'Create, edit, delete items and categories; upload photos', 'RLS insert/update/delete on items/categories; /api/upload server check'),
  ('requisitions.audit.view',        'manage', 'Read the catalogue audit log',                       'RLS select on catalogue_audit'),
  ('requisitions.access.manage',     'manage', 'Grant/revoke Requisitions admin (done in IT Manager, not here)', 'IT Manager: public.user_project_access')
on conflict (key) do update
  set tier = excluded.tier, description = excluded.description, enforced_in = excluded.enforced_in;

-- ----------------------------------------------------------------------------
-- 2. The single decision function.
--    capability_check(key, user): the rule itself. Internal (RPCs use it to
--      check a recipient); NOT executable by clients.
--    can(key [, user]): the client-facing wrapper. Asking about another user
--      is only allowed for Requisitions managers / service_role.
--    security definer + empty search_path; unknown key → false (fail closed).
-- ----------------------------------------------------------------------------
create or replace function requisitions_tracker.capability_check(p_key text, p_user uuid)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid  uuid := p_user;
  v_tier text;
begin
  if v_uid is null then
    return false;
  end if;

  select tier into v_tier from requisitions_tracker.capabilities where key = p_key;
  if v_tier is null then
    return false;
  end if;

  if not public.has_project_access('requisitions_tracker', v_uid) then
    return false;
  end if;
  if v_tier = 'use' then
    return true;
  end if;
  return public.is_project_admin('requisitions_tracker', v_uid);
end;
$$;

create or replace function requisitions_tracker.can(p_key text, p_user uuid default null)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_user is not null and p_user is distinct from auth.uid()
     and coalesce(auth.role(), '') <> 'service_role'
     and not requisitions_tracker.capability_check('requisitions.access.manage', auth.uid()) then
    return false;
  end if;
  return requisitions_tracker.capability_check(p_key, coalesce(p_user, auth.uid()));
end;
$$;

-- What the current user can do; mirrors the future public.my_permissions().
create or replace function requisitions_tracker.my_capabilities()
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select c.key from requisitions_tracker.capabilities c
   where requisitions_tracker.can(c.key)
   order by c.key;
$$;

-- Kept for compatibility (not used by the app). Now routed through can().
create or replace function requisitions_tracker.is_admin(check_user_id uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select requisitions_tracker.can('requisitions.catalogue.manage', check_user_id);
$$;

-- ----------------------------------------------------------------------------
-- 3. Volunteer directory: same columns, gate now = project access.
-- ----------------------------------------------------------------------------
create or replace view requisitions_tracker.volunteers as
select
  p.id,
  coalesce(
    nullif(trim(v.display_name), ''),
    nullif(trim(v.name), ''),
    nullif(trim(p.name), ''),
    split_part(coalesce(p.email, u.email), '@', 1)
  )                                   as name,
  coalesce(p.email, u.email)          as email,
  coalesce(v.photo_url, p.avatar_url) as photo_url,
  p.role::text                        as esn_role,
  v.status                            as volunteer_status
from public.profiles p
left join it_manager.volunteers v on v.id = p.id
left join auth.users u on u.id = p.id
where p.role in ('volunteer', 'admin')
  and requisitions_tracker.can('requisitions.inventory.view');

-- ----------------------------------------------------------------------------
-- 4. Movement RPCs: same signatures and behaviour, gates per capability.
-- ----------------------------------------------------------------------------
create or replace function requisitions_tracker.move_item(
  p_item_id    uuid,
  p_action     text,               -- 'pickup' | 'return' | 'pass' | 'take'
  p_to_user    uuid default null,  -- required for 'pass'
  p_event_name text default null,
  p_note       text default null
)
returns setof requisitions_tracker.items_view
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_cap   text;
  v_me    record;
  v_to    record;
  v_item  requisitions_tracker.items%rowtype;
  v_event text := nullif(trim(p_event_name), '');
  v_note  text := nullif(trim(p_note), '');
begin
  v_cap := case p_action
             when 'pickup' then 'requisitions.items.checkout'
             when 'return' then 'requisitions.items.return'
             when 'pass'   then 'requisitions.items.transfer'
             when 'take'   then 'requisitions.items.transfer'
           end;
  if v_cap is null then
    raise exception 'Unknown action: %', p_action using errcode = '22023';
  end if;
  if v_uid is null or not requisitions_tracker.can(v_cap) then
    raise exception 'Not allowed: %', v_cap using errcode = '42501';
  end if;

  select * into v_me from requisitions_tracker.volunteers where id = v_uid;
  if not found then
    raise exception 'Volunteer profile not found' using errcode = '42501';
  end if;

  select * into v_item from requisitions_tracker.items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  case p_action
    when 'pickup' then
      if v_item.status <> 'office' then
        raise exception 'This item is not in the office' using errcode = 'P0001';
      end if;
      insert into requisitions_tracker.transfers
        (item_id, item_name, action, from_user_id, from_user_name, to_user_id, to_user_name, event_name, note, performed_by)
      values
        (v_item.id, v_item.name, 'pickup', null, 'Office', v_uid, v_me.name, v_event, v_note, v_uid);
      update requisitions_tracker.items
         set status = 'out', holder_id = v_uid, holder_name = v_me.name
       where id = v_item.id;

    when 'return' then
      if v_item.status <> 'out' or v_item.holder_id is distinct from v_uid then
        raise exception 'Only the current holder can return this item' using errcode = 'P0001';
      end if;
      insert into requisitions_tracker.transfers
        (item_id, item_name, action, from_user_id, from_user_name, to_user_id, to_user_name, event_name, note, performed_by)
      values
        (v_item.id, v_item.name, 'return', v_uid, v_me.name, null, 'Office', v_event, v_note, v_uid);
      update requisitions_tracker.items
         set status = 'office', holder_id = null, holder_name = null
       where id = v_item.id;

    when 'pass' then
      if v_item.status <> 'out' or v_item.holder_id is distinct from v_uid then
        raise exception 'Only the current holder can pass this item' using errcode = 'P0001';
      end if;
      if p_to_user is null or p_to_user = v_uid then
        raise exception 'Choose another volunteer to pass the item to' using errcode = 'P0001';
      end if;
      select * into v_to from requisitions_tracker.volunteers where id = p_to_user;
      if not found or not requisitions_tracker.capability_check('requisitions.inventory.view', p_to_user) then
        raise exception 'Recipient is not an ESN volunteer' using errcode = 'P0001';
      end if;
      insert into requisitions_tracker.transfers
        (item_id, item_name, action, from_user_id, from_user_name, to_user_id, to_user_name, event_name, note, performed_by)
      values
        (v_item.id, v_item.name, 'transfer', v_uid, v_me.name, v_to.id, v_to.name, v_event, v_note, v_uid);
      update requisitions_tracker.items
         set status = 'out', holder_id = v_to.id, holder_name = v_to.name
       where id = v_item.id;

    when 'take' then
      if v_item.status <> 'out' then
        raise exception 'This item is in the office — pick it up instead' using errcode = 'P0001';
      end if;
      if v_item.holder_id = v_uid then
        raise exception 'You already have this item' using errcode = 'P0001';
      end if;
      insert into requisitions_tracker.transfers
        (item_id, item_name, action, from_user_id, from_user_name, to_user_id, to_user_name, event_name, note, performed_by)
      values
        (v_item.id, v_item.name, 'transfer', v_item.holder_id, coalesce(v_item.holder_name, 'Unknown'), v_uid, v_me.name, v_event, v_note, v_uid);
      update requisitions_tracker.items
         set status = 'out', holder_id = v_uid, holder_name = v_me.name
       where id = v_item.id;
  end case;

  return query select * from requisitions_tracker.items_view where id = p_item_id;
end;
$$;

create or replace function requisitions_tracker.admin_move_item(
  p_item_id uuid,
  p_action  text,               -- 'return' | 'assign'
  p_to_user uuid default null,  -- required for 'assign'
  p_note    text default null
)
returns setof requisitions_tracker.items_view
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_to   record;
  v_item requisitions_tracker.items%rowtype;
  v_note text := nullif(trim(p_note), '');
begin
  if v_uid is null or not requisitions_tracker.can('requisitions.items.override') then
    raise exception 'Not allowed: requisitions.items.override' using errcode = '42501';
  end if;

  select * into v_item from requisitions_tracker.items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  case p_action
    when 'return' then
      if v_item.status <> 'out' then
        raise exception 'This item is already in the office' using errcode = 'P0001';
      end if;
      insert into requisitions_tracker.transfers
        (item_id, item_name, action, from_user_id, from_user_name, to_user_id, to_user_name, note, admin_override, performed_by)
      values
        (v_item.id, v_item.name, 'return', v_item.holder_id, coalesce(v_item.holder_name, 'Unknown'), null, 'Office', v_note, true, v_uid);
      update requisitions_tracker.items
         set status = 'office', holder_id = null, holder_name = null
       where id = v_item.id;

    when 'assign' then
      if p_to_user is null then
        raise exception 'Choose a volunteer to assign the item to' using errcode = 'P0001';
      end if;
      select * into v_to from requisitions_tracker.volunteers where id = p_to_user;
      if not found or not requisitions_tracker.capability_check('requisitions.inventory.view', p_to_user) then
        raise exception 'Recipient is not an ESN volunteer' using errcode = 'P0001';
      end if;
      if v_item.holder_id = v_to.id then
        raise exception 'That volunteer already has this item' using errcode = 'P0001';
      end if;
      insert into requisitions_tracker.transfers
        (item_id, item_name, action, from_user_id, from_user_name, to_user_id, to_user_name, note, admin_override, performed_by)
      values
        (v_item.id, v_item.name,
         case when v_item.status = 'office' then 'pickup' else 'transfer' end,
         v_item.holder_id,
         case when v_item.status = 'office' then 'Office' else coalesce(v_item.holder_name, 'Unknown') end,
         v_to.id, v_to.name, v_note, true, v_uid);
      update requisitions_tracker.items
         set status = 'out', holder_id = v_to.id, holder_name = v_to.name
       where id = v_item.id;

    else
      raise exception 'Unknown action: %', p_action using errcode = '22023';
  end case;

  return query select * from requisitions_tracker.items_view where id = p_item_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Catalogue audit (append-only, trigger-written).
--    Movements are already audited in transfers; this covers admin edits.
-- ----------------------------------------------------------------------------
create table if not exists requisitions_tracker.catalogue_audit (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     uuid not null,
  op         text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row    jsonb,
  new_row    jsonb,
  actor_id   uuid,            -- auth.uid(); null = service_role / migration script
  created_at timestamptz not null default now()
);
create index if not exists catalogue_audit_row_idx
  on requisitions_tracker.catalogue_audit (table_name, row_id, created_at desc);

create or replace function requisitions_tracker.audit_catalogue()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Movement RPCs only touch status/holder*/updated_at: those are in transfers already.
  if tg_op = 'UPDATE' and tg_table_name = 'items'
     and (to_jsonb(new) - array['status','holder_id','holder_name','updated_at'])
       = (to_jsonb(old) - array['status','holder_id','holder_name','updated_at']) then
    return new;
  end if;
  insert into requisitions_tracker.catalogue_audit (table_name, row_id, op, old_row, new_row, actor_id)
  values (tg_table_name,
          coalesce(new.id, old.id),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end;
$$;

drop trigger if exists items_audit on requisitions_tracker.items;
create trigger items_audit
  after insert or update or delete on requisitions_tracker.items
  for each row execute function requisitions_tracker.audit_catalogue();

drop trigger if exists categories_audit on requisitions_tracker.categories;
create trigger categories_audit
  after insert or update or delete on requisitions_tracker.categories
  for each row execute function requisitions_tracker.audit_catalogue();

-- ----------------------------------------------------------------------------
-- 6. RLS: every policy via can(). Drop old names + new names (idempotent).
-- ----------------------------------------------------------------------------
alter table requisitions_tracker.capabilities    enable row level security;
alter table requisitions_tracker.catalogue_audit enable row level security;

drop policy if exists categories_select_staff on requisitions_tracker.categories;
drop policy if exists categories_write_admin  on requisitions_tracker.categories;
drop policy if exists items_select_staff      on requisitions_tracker.items;
drop policy if exists items_insert_admin      on requisitions_tracker.items;
drop policy if exists items_update_admin      on requisitions_tracker.items;
drop policy if exists items_delete_admin      on requisitions_tracker.items;
drop policy if exists transfers_select_staff  on requisitions_tracker.transfers;

drop policy if exists categories_select   on requisitions_tracker.categories;
drop policy if exists categories_insert   on requisitions_tracker.categories;
drop policy if exists categories_update   on requisitions_tracker.categories;
drop policy if exists categories_delete   on requisitions_tracker.categories;
drop policy if exists items_select        on requisitions_tracker.items;
drop policy if exists items_insert        on requisitions_tracker.items;
drop policy if exists items_update        on requisitions_tracker.items;
drop policy if exists items_delete        on requisitions_tracker.items;
drop policy if exists transfers_select    on requisitions_tracker.transfers;
drop policy if exists capabilities_select on requisitions_tracker.capabilities;
drop policy if exists catalogue_audit_select on requisitions_tracker.catalogue_audit;

create policy categories_select on requisitions_tracker.categories
  for select to authenticated using (requisitions_tracker.can('requisitions.inventory.view'));
create policy categories_insert on requisitions_tracker.categories
  for insert to authenticated with check (requisitions_tracker.can('requisitions.catalogue.manage'));
create policy categories_update on requisitions_tracker.categories
  for update to authenticated
  using (requisitions_tracker.can('requisitions.catalogue.manage'))
  with check (requisitions_tracker.can('requisitions.catalogue.manage'));
create policy categories_delete on requisitions_tracker.categories
  for delete to authenticated using (requisitions_tracker.can('requisitions.catalogue.manage'));

create policy items_select on requisitions_tracker.items
  for select to authenticated using (requisitions_tracker.can('requisitions.inventory.view'));
create policy items_insert on requisitions_tracker.items
  for insert to authenticated with check (requisitions_tracker.can('requisitions.catalogue.manage'));
create policy items_update on requisitions_tracker.items
  for update to authenticated
  using (requisitions_tracker.can('requisitions.catalogue.manage'))
  with check (requisitions_tracker.can('requisitions.catalogue.manage'));
create policy items_delete on requisitions_tracker.items
  for delete to authenticated using (requisitions_tracker.can('requisitions.catalogue.manage'));

create policy transfers_select on requisitions_tracker.transfers
  for select to authenticated using (requisitions_tracker.can('requisitions.inventory.view'));
-- transfers: still no insert/update/delete policy → only the RPCs write.

create policy capabilities_select on requisitions_tracker.capabilities
  for select to authenticated using (requisitions_tracker.can('requisitions.inventory.view'));

create policy catalogue_audit_select on requisitions_tracker.catalogue_audit
  for select to authenticated using (requisitions_tracker.can('requisitions.audit.view'));

-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------
-- New objects in this schema get nothing by default for client roles.
alter default privileges in schema requisitions_tracker revoke all on tables    from anon, authenticated, public;
alter default privileges in schema requisitions_tracker revoke all on functions from anon, authenticated, public;
alter default privileges in schema requisitions_tracker revoke all on sequences from anon, authenticated, public;

revoke all on requisitions_tracker.capabilities, requisitions_tracker.catalogue_audit
  from anon, authenticated, authenticator, public;
grant select on requisitions_tracker.capabilities, requisitions_tracker.catalogue_audit to authenticated;

-- Functions: clients may call only the public API below.
revoke all on all functions in schema requisitions_tracker from anon, authenticated, authenticator, public;
grant execute on function requisitions_tracker.can(text, uuid)                          to authenticated;
grant execute on function requisitions_tracker.my_capabilities()                         to authenticated;
grant execute on function requisitions_tracker.move_item(uuid, text, uuid, text, text)   to authenticated;
grant execute on function requisitions_tracker.admin_move_item(uuid, text, uuid, text)   to authenticated;
-- capability_check(), is_admin(uuid), set_updated_at(), audit_catalogue(): internal only.

grant all on all tables    in schema requisitions_tracker to service_role;
grant all on all functions in schema requisitions_tracker to service_role;
grant all on all sequences in schema requisitions_tracker to service_role;

commit;

-- Reload PostgREST schema cache so can()/my_capabilities() are exposed.
notify pgrst, 'reload schema';
