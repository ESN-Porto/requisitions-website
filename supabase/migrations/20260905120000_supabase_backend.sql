-- ============================================================================
-- Requisitions Tracker — Supabase backend (replaces Firebase Auth + Firestore)
--
-- Schema: requisitions_tracker (registered in public.projects as staff_only).
-- Identity and access come from the shared ESN model owned by IT Manager:
--   * who can enter    → public.has_project_access('requisitions_tracker')
--                        (= public.is_staff(): profiles.role in volunteer/admin)
--   * who is an admin  → public.is_project_admin('requisitions_tracker')
--                        (= ESN admin, or user_project_access role='admin')
-- There are no app-local users, roles or email allowlists any more.
--
-- Apply as supabase_admin:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < this_file
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Schema + legacy cleanup
--    The four tables below were an earlier, never-used attempt (0 rows each,
--    audited 2026-07-10 and 2026-09-05).
-- ----------------------------------------------------------------------------
create schema if not exists requisitions_tracker;
grant usage on schema requisitions_tracker to anon, authenticated, service_role, authenticator;

drop view  if exists requisitions_tracker.items_view;
drop view  if exists requisitions_tracker.volunteers;
drop table if exists requisitions_tracker.transfers  cascade;
drop table if exists requisitions_tracker.items      cascade;
drop table if exists requisitions_tracker.categories cascade;
drop table if exists requisitions_tracker.profiles   cascade;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table requisitions_tracker.categories (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table requisitions_tracker.items (
  id          uuid primary key default gen_random_uuid(),
  -- Firestore document id. Printed QR codes / NFC tags point to /scan/<legacy_id>,
  -- so the app resolves both uuid and legacy ids.
  legacy_id   text unique,
  name        text not null check (length(trim(name)) between 1 and 120),
  category_id uuid references requisitions_tracker.categories(id) on delete set null,
  photo_url   text,
  status      text not null default 'office' check (status in ('office', 'out')),
  holder_id   uuid references auth.users(id) on delete set null,
  -- Snapshot of the holder's name: survives account deletion and covers
  -- migrated holders that never got a Supabase account.
  holder_name text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint items_office_has_no_holder
    check (status = 'out' or (holder_id is null and holder_name is null))
);
create index items_holder_idx   on requisitions_tracker.items (holder_id);
create index items_category_idx on requisitions_tracker.items (category_id);

-- Append-only audit log. No UPDATE/DELETE grants or policies exist on purpose.
create table requisitions_tracker.transfers (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid references requisitions_tracker.items(id) on delete set null,
  item_name      text not null,
  action         text not null check (action in ('pickup', 'return', 'transfer')),
  from_user_id   uuid references auth.users(id) on delete set null,
  from_user_name text,
  to_user_id     uuid references auth.users(id) on delete set null,
  to_user_name   text,
  event_name     text,
  note           text,
  admin_override boolean not null default false,
  performed_by   uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index transfers_item_idx    on requisitions_tracker.transfers (item_id, created_at desc);
create index transfers_created_idx on requisitions_tracker.transfers (created_at desc);

-- ----------------------------------------------------------------------------
-- 2. Volunteer directory (read model over IT Manager's data)
--    Owned by supabase_admin, so it reads the base tables regardless of their
--    RLS; the WHERE clause is the gate: non-staff callers get zero rows.
--    Only display-safe columns are exposed.
-- ----------------------------------------------------------------------------
create view requisitions_tracker.volunteers as
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
  and public.is_staff();

-- Items with category and resolved holder. security_invoker → RLS of the
-- caller applies to items/categories.
create view requisitions_tracker.items_view
  with (security_invoker = true) as
select
  i.id,
  i.legacy_id,
  i.name,
  i.category_id,
  c.key                              as category_key,
  c.name                             as category_name,
  i.photo_url,
  i.status,
  i.holder_id,
  coalesce(v.name, i.holder_name)    as holder_name,
  v.photo_url                        as holder_photo_url,
  i.created_at,
  i.updated_at
from requisitions_tracker.items i
left join requisitions_tracker.categories c on c.id = i.category_id
left join requisitions_tracker.volunteers v on v.id = i.holder_id;

-- ----------------------------------------------------------------------------
-- 3. Helpers
-- ----------------------------------------------------------------------------
create or replace function requisitions_tracker.is_admin(check_user_id uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_project_admin('requisitions_tracker', coalesce(check_user_id, auth.uid()));
$$;

create or replace function requisitions_tracker.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on requisitions_tracker.items
  for each row execute function requisitions_tracker.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Movement RPCs — the ONLY way status/holder change and transfers are written.
--    Each call is one transaction: item row locked, audit row inserted, item
--    updated. Business rules live here, not in the client.
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
  v_me    record;
  v_to    record;
  v_item  requisitions_tracker.items%rowtype;
  v_event text := nullif(trim(p_event_name), '');
  v_note  text := nullif(trim(p_note), '');
begin
  if v_uid is null or not public.is_staff(v_uid) then
    raise exception 'Only ESN volunteers can move items' using errcode = '42501';
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
      if not found then
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
      -- Scan page: the caller takes the item from whoever holds it.
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

    else
      raise exception 'Unknown action: %', p_action using errcode = '22023';
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
  if v_uid is null or not public.is_project_admin('requisitions_tracker', v_uid) then
    raise exception 'Admin access required' using errcode = '42501';
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
      if not found then
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
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table requisitions_tracker.categories enable row level security;
alter table requisitions_tracker.items      enable row level security;
alter table requisitions_tracker.transfers  enable row level security;

create policy categories_select_staff on requisitions_tracker.categories
  for select to authenticated using (public.is_staff());
create policy categories_write_admin on requisitions_tracker.categories
  for all to authenticated
  using (public.is_project_admin('requisitions_tracker'))
  with check (public.is_project_admin('requisitions_tracker'));

create policy items_select_staff on requisitions_tracker.items
  for select to authenticated using (public.is_staff());
create policy items_insert_admin on requisitions_tracker.items
  for insert to authenticated with check (public.is_project_admin('requisitions_tracker'));
create policy items_update_admin on requisitions_tracker.items
  for update to authenticated
  using (public.is_project_admin('requisitions_tracker'))
  with check (public.is_project_admin('requisitions_tracker'));
create policy items_delete_admin on requisitions_tracker.items
  for delete to authenticated using (public.is_project_admin('requisitions_tracker'));

create policy transfers_select_staff on requisitions_tracker.transfers
  for select to authenticated using (public.is_staff());
-- transfers: no insert/update/delete policy → only the RPCs (SECURITY DEFINER) write.

-- ----------------------------------------------------------------------------
-- 6. Grants (explicit; default privileges in this schema are too generous)
--    Column-level UPDATE on items keeps status/holder writable only through
--    move_item/admin_move_item, even for admins hitting PostgREST directly.
-- ----------------------------------------------------------------------------
revoke all on all tables    in schema requisitions_tracker from anon, authenticated, authenticator, public;
revoke all on all functions in schema requisitions_tracker from anon, authenticator, public;

grant select on requisitions_tracker.categories, requisitions_tracker.items,
                requisitions_tracker.transfers,  requisitions_tracker.volunteers,
                requisitions_tracker.items_view
  to authenticated;
grant insert, delete on requisitions_tracker.categories, requisitions_tracker.items to authenticated;
grant update (name, key, sort_order)                    on requisitions_tracker.categories to authenticated;
grant update (name, category_id, photo_url, legacy_id)  on requisitions_tracker.items      to authenticated;
grant execute on function requisitions_tracker.move_item(uuid, text, uuid, text, text)   to authenticated;
grant execute on function requisitions_tracker.admin_move_item(uuid, text, uuid, text)   to authenticated;
grant execute on function requisitions_tracker.is_admin(uuid)                            to authenticated;

grant all on all tables    in schema requisitions_tracker to service_role;
grant all on all functions in schema requisitions_tracker to service_role;

-- ----------------------------------------------------------------------------
-- 7. Realtime (live updates on the home / item / scan pages)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table
  requisitions_tracker.items,
  requisitions_tracker.transfers,
  requisitions_tracker.categories;

-- ----------------------------------------------------------------------------
-- 8. Storage: item photos live in the (pre-existing, public-read) bucket
--    item-images. Writes go through the app's /api/upload with service_role
--    after an admin check, so the blanket "any authenticated user may write"
--    policies are dropped.
-- ----------------------------------------------------------------------------
drop policy if exists "Authenticated upload for item images" on storage.objects;
drop policy if exists "Authenticated update for item images" on storage.objects;
drop policy if exists "Authenticated delete for item images" on storage.objects;

commit;

-- ----------------------------------------------------------------------------
-- 9. Expose the schema through PostgREST (outside the transaction: ALTER ROLE
--    and NOTIFY). PGRST_DB_USE_LEGACY_GUCS=false → the authenticator role
--    config is the source of truth, not the env var.
-- ----------------------------------------------------------------------------
alter role authenticator set pgrst.db_schemas to
  'public,storage,graphql_public,asset_management,talent_show,merch,it_manager,esn_porto_app,main_website,speed_dating,wrapped,pubcrawl,eventupp_data,partnerships,telegram_community,requisitions_tracker';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
