---
title: Requisitions refactor — Supabase foundation spec
tags: [app, supabase, spec, intern, access]
---

> **Status: SPEC (2026-11-07).** For the IT intern working Vikunja task **#17**
> ("Start Requisitions refactor — shared Supabase foundation", **24h cap**). Related:
> task #21 / [[permissions-spec]]. App page: [[requisitions]].
>
> **Pre-chewed work:** branch `intern/requisitions-schema-foundation` in
> `ESNPorto/requisitions-website` (local only, not pushed) contains a ready, tested
> migration. Your job is to review it, prove it, wire one vertical slice, and document.

## 1. Problem

The Requisitions (item tracker) app runs on Firebase with its own Google sign-in, its own
`users` collection with `admin`/`member` roles and a hard-coded admin e-mail list. It does
not use the shared ESN identity, so access is managed in two places and leaves are not
revoked when a volunteer leaves. Items and categories are **world-readable** in Firestore
(`allow read: if true`), and any signed-in Google account can write audit rows.

## 2. Goals / non-goals

**Goals**

- Reuse the shared identity/access contract (Supabase Auth + IT Manager's
  `public.projects` / `user_project_access`). No second auth or user system.
- Authenticated only. **Volunteers = use access**, **Requisitions admins = management
  access**. Enforced in the **database** (RLS + RPC), the UI only hides buttons.
- Versioned, forward-only migrations + RLS for one vertical slice, with tests for
  volunteer / Requisitions admin / unauthorised.
- A reversible data-migration plan with stable identity matching; Firebase untouched.
- Name future capabilities (inventory view, checkout, return, transfer,
  catalogue/access management) as keys, **without** building the org-wide framework.

**Non-goals**

- No production cutover, no traffic switch, no Firebase deletes.
- No `public.authorize()` / org-wide permission tables (that's task #21's proposal).
- Not every screen. One slice end-to-end.

## 3. Current state

### 3.1 Firebase inventory (branch `main`)

| Collection | Content | Rules today |
|---|---|---|
| `users` | uid, email, name, photo, `role` admin/member | read: any signed-in; self-create as `member` (or `admin` for 3 hard-coded e-mails) |
| `categories` | name, sort | **read: public**; write: admin |
| `items` | name, category, photo, `status`, `currentHolder*` | **read: public**; create/delete: admin; members may change only status/holder fields |
| `transfers` | append-only movement log | **read: public**; create: any signed-in; no update/delete |
| `settings` | e-mail allowlist | read: signed-in; write: admin |

Auth: Firebase Google sign-in. QR/NFC: printed codes point to `/scan/<firestoreDocId>`.
Photos: `public/uploads` on the host. Confirm counts yourself with the dry run in §7.

### 3.2 Branch `feat/supabase-backend` (commit `38c6199`, not pushed)

Already rewrites the app for Supabase (login, proxy/middleware guard, API routes calling
RPCs, Firestore import script, `docs/MIGRATION.md` cutover runbook) and its migration
`20260905120000_supabase_backend.sql` is **already applied in production** (schema
`requisitions_tracker`, empty). Project row: `requisitions_tracker`, `access_level =
staff_only`, active. **Never re-run that file — it drops the tables.**

### 3.3 Verdict: keep it as the base

The applied schema is sound (RPC-only movements, row lock + audit row per move,
append-only `transfers`, column-level grants, `legacy_id` for QR). Gaps found against
[[permissions-spec]]:

| # | Gap | Fix in new migration |
|---|---|---|
| 1 | Gates call `public.is_staff()` directly, so the project's `is_active`/`access_level` switch in IT Manager is ignored | Everything goes through `has_project_access('requisitions_tracker')` via `can()` |
| 2 | `is_project_admin()` does not require staff: a stale admin grant on an ex-volunteer still works | Manage tier = use access **and** project admin |
| 3 | No capability names; "admin" is one blob | 8 keys `requisitions.<resource>.<action>` in a catalogue table |
| 4 | `is_admin(uuid)` callable by any user for any uuid (probe who is admin) | Not executable by clients; `can(key, other_user)` only for managers |
| 5 | No audit of catalogue edits (rename/delete item) | `catalogue_audit` append-only, trigger-written |
| 6 | Default privileges in the schema would expose future tables | `alter default privileges ... revoke` |

A clean replacement was rejected: prod already has the old schema, so the right move is
a forward-only migration that is idempotent and keeps the RPC signatures the app calls.

## 4. Data model

Schema `requisitions_tracker` (after both migrations):

| Object | Kind | Key columns / notes |
|---|---|---|
| `categories` | table | `id uuid`, `key` slug unique, `name`, `sort_order` |
| `items` | table | `id uuid`, `legacy_id` (Firestore id, unique — QR), `name`, `category_id → categories`, `photo_url`, `status office/out`, `holder_id → auth.users`, `holder_name` snapshot; check: office ⇒ no holder |
| `transfers` | table, append-only | `item_id`, `item_name` snapshot, `action pickup/return/transfer`, from/to user + name snapshots, `event_name`, `note`, `admin_override`, `performed_by` |
| `capabilities` | table (new) | `key`, `tier use/manage`, `description`, `enforced_in` |
| `catalogue_audit` | table (new) | `table_name`, `row_id`, `op`, `old_row`/`new_row` jsonb, `actor_id`; movement-only updates are skipped (already in `transfers`) |
| `volunteers` | view | display-safe directory over `profiles` + `it_manager.volunteers`; 0 rows for non-users |
| `items_view` | view (security_invoker) | items + category + holder |
| `can(key, user?)` | function | client-facing decision |
| `capability_check(key, user)` | function | internal rule, not client-executable |
| `my_capabilities()` | RPC | list of keys for the UI (`<Can>`-style gating) |
| `move_item`, `admin_move_item` | RPC | unchanged signatures, gated per key |

Identity: `auth.users.id` = `public.profiles.id` = `it_manager.volunteers.id`. No app-local users.

## 5. Permission mapping

`can()` today: tier `use` → `has_project_access('requisitions_tracker')` (staff_only ⇒
`profiles.role in (volunteer, admin)`); tier `manage` → that **and**
`is_project_admin('requisitions_tracker')` (ESN admin or `user_project_access.role =
'admin'`). Later, only `capability_check()`'s body swaps to `public.authorize(key)`.

| Capability | Tier | Volunteer | Req. admin | Enforced by |
|---|---|---|---|---|
| `requisitions.inventory.view` | use | ✅ | ✅ | RLS select items/categories/transfers/capabilities; `volunteers` view |
| `requisitions.items.checkout` | use | ✅ | ✅ | `move_item('pickup')` |
| `requisitions.items.return` | use | ✅ (own item) | ✅ | `move_item('return')` |
| `requisitions.items.transfer` | use | ✅ (pass own / take) | ✅ | `move_item('pass'/'take')` |
| `requisitions.items.override` | manage | ❌ | ✅ | `admin_move_item` |
| `requisitions.catalogue.manage` | manage | ❌ | ✅ | RLS insert/update/delete items/categories; `/api/upload` server check |
| `requisitions.audit.view` | manage | ❌ | ✅ | RLS select `catalogue_audit` |
| `requisitions.access.manage` | manage | ❌ | ✅ | IT Manager (`user_project_access`) — not in this app |

Unauthorised (anon, student, ex-volunteer with stale grant, project deactivated): nothing.
`status`/`holder_*` are never writable directly, not even by admins — only via RPCs.

## 6. Vertical slice to implement

**"Check out / return an item, admin force-return"** — touches auth guard, RLS read,
both RPCs, audit. Screens: home list, item page, scan page (`/scan/<id or legacy_id>`).

## 7. Tasks and acceptance tests

| # | Task | Est. | Done when |
|---|---|---|---|
| 0 | Access prerequisite: confirm you can sign in with the shared ESN account and have the access needed; else send the manager **one** request naming your account and the exact grant (e.g. "`admin` on project `requisitions_tracker` in IT Manager") | 1h | Verified or request sent |
| 1 | Read [[permissions-spec]], [[access-model]], [[app-template]], this page, both migrations | 2h | — |
| 2 | Firebase inventory: run `node scripts/firestore-migration/migrate.mjs` (**dry run, no `--apply`**); record counts, admins, holders without ESN account | 2h | Inventory table in this page filled with real numbers |
| 3 | Review `20261107120000_permissions_alignment.sql`; run it + `supabase/tests/rls_permissions_test.sql` in a throwaway Postgres (§8) | 3h | **38/38 PASS**; any finding written up |
| 4 | App: replace `is_project_admin` calls in `lib/auth/permissions.js` with `rpc('my_capabilities')`; hide admin buttons by key | 4h | Volunteer sees no admin UI; admin does |
| 5 | Guard: proxy keeps `has_project_access` check; prove anon → `/login`, student → `/no-access` | 2h | Manual test recorded |
| 6 | Slice end-to-end on a **local/staging** Supabase (not prod): volunteer pick-up + return, admin force-return, student blocked | 4h | Screenshots/notes for the 3 personas |
| 7 | Data-migration plan (§9) reviewed with manager; note next slices | 2h | Section updated |
| 8 | PR (draft) + link this page from the ticket; log elapsed hours | 1h | PR open, hours logged |
| | **Total** | **21h** (3h buffer to the 24h cap) | |

Acceptance (from the test file — must stay green):

- **Volunteer:** sees items; can pick up, return own, pass to another volunteer; cannot pass to a student; cannot `admin_move_item`, create/rename items, create categories, write `status` directly, insert/delete `transfers`, read `catalogue_audit`; `my_capabilities()` = 4 keys.
- **Requisitions admin:** all of the above plus force-return, assign, create/rename items & categories, read audit; `my_capabilities()` = 8; still cannot delete `transfers`.
- **Unauthorised:** anon gets permission denied; student and ex-volunteer-with-stale-admin-grant see 0 rows and every RPC raises `42501`; deactivating the project in IT Manager drops volunteers to 0 rows.

## 8. How to test (never against production)

```bash
docker run -d --name rt-pgtest -e POSTGRES_PASSWORD=x postgres:15
# 1) stubs: roles anon/authenticated/service_role/authenticator, auth.uid()/auth.role()
#    reading request.jwt.claim.*, public.profiles/projects/user_project_access,
#    it_manager.volunteers, storage.objects, publication supabase_realtime, 5 personas
# 2) real helper bodies: pg_get_functiondef of has_project_access, is_project_admin,
#    is_staff, is_esn_admin (read-only query on prod, or copy from IT Manager)
# 3) old migration, new migration, new migration again (idempotency)
# 4) psql < supabase/tests/rls_permissions_test.sql   → expect failures = 0
docker rm -f rt-pgtest
```

Result on 2026-11-07 (Postgres 15): old + new + new-again applied cleanly; **38/38
PASS**; extra check: project `is_active=false` ⇒ volunteer sees 0 items.

## 9. Data-migration plan (reversible)

- **Source stays intact:** the script only reads Firestore; no Firebase writes/deletes.
  Firebase app stays deployable from `main` as rollback.
- **Stable identity:** items/categories/transfers get deterministic uuids derived from
  Firestore ids (re-runs are idempotent upserts); `items.legacy_id` keeps the Firestore id
  so printed QR codes still resolve. People are matched by **lower-cased e-mail** Firebase
  `users.email` → `auth.users.email`; unmatched holders keep `holder_name` with
  `holder_id = null` (admin force-returns). Report unmatched e-mails, don't create accounts.
- **Roles don't migrate automatically:** Firebase admins must be granted `admin` on
  `requisitions_tracker` in IT Manager by a manager before cutover.
- **Order:** apply `20261107120000` first (empty tables) → dry run → `--apply` →
  count check (runbook `docs/MIGRATION.md`). The audit trigger will log the import as
  `actor_id = null` INSERTs; that's expected.
- **Rollback:** point the container back at `main`; optionally `truncate` the three data
  tables (Supabase side only). Nothing to undo in Firebase.

## 10. Risks

- Applying the old 20260905 file again wipes data — runbook already warns; keep it.
- RLS calls `can()` per row; fine at this size (tens of items). Revisit if > 10k rows.
- Holders without an ESN account can't act on their own items until onboarded.
- Photo uploads use `service_role` after a server-side admin check — a user-facing
  `service_role` write (finding per permissions-spec rule 6). Next slice: storage policy
  `can('requisitions.catalogue.manage')` on bucket `item-images`.
- Branch `feat/supabase-backend` is unpushed; one disk loss loses it. Push to a private
  remote branch early (manager decision).

## 11. Open questions for the manager

1. OK to apply `20261107120000_permissions_alignment.sql` to prod now (empty schema) or only at cutover?
2. Who are the Requisitions admins today (to grant in IT Manager)? ESN-wide admins inherit it — intended?
3. Should "take from current holder" (`take`) stay open to every volunteer, or require the holder's consent / admin?
4. Item delete: hard delete (current) or soft delete (`archived_at`)? Audit keeps the old row either way.
5. Is there a staging Supabase for task 6, or should the intern use the local CLI stack?
6. Push the branches to `ESNPorto/requisitions-website` now?

## Links

- [[requisitions]] · [[permissions-spec]] · [[rbac-permissions-proposal]] · [[access-model]] · [[app-template]] · [[firebase-legacy]]
