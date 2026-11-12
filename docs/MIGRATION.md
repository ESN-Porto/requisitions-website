# Cutover runbook: Firebase -> Supabase

This document walks through replacing the production Requisitions Tracker (Firebase Auth + Firestore, branch `main`) with the Supabase backend on branch `feat/supabase-backend`. It is written for whoever runs the cutover on the ESN VPS.

Expected downtime: roughly 15-30 minutes (build + smoke tests). The old data in Firestore is never modified: the migration script only reads from Firebase.

## What changes for users

| Before (Firebase) | After (Supabase) |
|-------------------|------------------|
| Google sign-in, per-app allowlist, admin-managed signups | Email + password with the shared ESN account (same as IT Manager). No signup in this app. |
| App-local `users` collection with `admin` / `member` roles | Access = ESN volunteer (`profiles.role` in `volunteer`/`admin`). Admin = ESN admin or `admin` on project `requisitions_tracker` in IT Manager. |
| Photos in `public/uploads` on the host | Photos in Supabase Storage bucket `item-images` |
| Item URLs with Firestore ids | New uuids; old ids kept in `items.legacy_id`, so printed QR codes still resolve |

**Roles do not carry over.** Anyone who was an admin in the Firebase app must be granted role `admin` on project `requisitions_tracker` in IT Manager (or already be an ESN admin). Do this before the cutover so admins are not locked out of inventory management on day one.

## Prerequisites (already done)

These were completed on 2026-09-05 and only need to be checked, not repeated:

- [x] `public.projects` has a row with slug `requisitions_tracker`, `access_level = staff_only`, `allow_signup = false`.
- [x] Schema applied: `supabase/migrations/20260905120000_supabase_backend.sql` run as `supabase_admin` (`docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < ...`). Tables, views, RPCs, RLS and grants exist. **Do not re-run this file after importing data: it drops and recreates the tables.**
- [x] PostgREST exposes the schema (`requisitions_tracker` is in `pgrst.db_schemas` on role `authenticator`; config reloaded).
- [x] Realtime publication `supabase_realtime` includes `items`, `transfers`, `categories`.
- [x] Storage bucket `item-images` exists, public read, no write policies for regular users (writes only via `/api/upload` with the service role).
- [x] GoTrue redirect allow-list contains `https://requisitions.esnporto.org/**`.
- [x] `.env` in `/root/requisitions-website` has the Supabase variables (see `.env.example`) plus the legacy `FIREBASE_PROJECT_ID` / `FIREBASE_ADMIN_SERVICE_ACCOUNT` needed by the migration script.

Quick check from the VPS:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "
  select slug, access_level, allow_signup from public.projects where slug = 'requisitions_tracker';
  select count(*) items, (select count(*) from requisitions_tracker.transfers) transfers,
         (select count(*) from requisitions_tracker.categories) categories
    from requisitions_tracker.items;
  select tablename from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'requisitions_tracker';"
```

## Cutover steps

### 0. Before the day

- [ ] Confirm the list of current admins in the Firebase app (Admin -> Users) and grant each of them `admin` on `requisitions_tracker` in IT Manager (or confirm they are ESN admins).
- [ ] Confirm every active holder of an item has an ESN account with role `volunteer`/`admin`. Holders without an account are still imported (the script keeps the holder name as a text snapshot), but they will not be able to return or pass the item themselves; an admin will have to force-return it.
- [ ] Make sure `git status` on the VPS checkout is clean and the branch is `feat/supabase-backend`.

### 1. Freeze

- [ ] Announce in the volunteers' group that the tracker is under maintenance for ~30 minutes and no items should be checked in/out. There is no maintenance mode; the announcement is the freeze. Any movement recorded in Firebase after the import starts is lost unless the script is re-run (it is idempotent, see below).

### 2. Import the data

The script lives in `scripts/firestore-migration/`. It reads Firestore with the Firebase Admin SDK, writes to Supabase with the service role, derives deterministic uuids from the Firestore ids (so re-running never duplicates rows), stores the Firestore id in `items.legacy_id`, and uploads the photos found in `public/uploads/` to the `item-images` bucket. It never writes to Firebase.

```bash
cd /root/requisitions-website/scripts/firestore-migration
npm install

# Dry run: reads everything, prints what would be written, writes nothing.
node migrate.mjs

# Real import.
node migrate.mjs --apply
```

- [ ] Dry run finishes without errors; the printed counts match what the Firebase app shows (items, categories, transfers, photos).
- [ ] `--apply` finishes without errors. If it fails halfway, fix the cause and run `--apply` again; it is idempotent.

### 3. Verify counts

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "
  select
    (select count(*) from requisitions_tracker.categories)                        as categories,
    (select count(*) from requisitions_tracker.items)                             as items,
    (select count(*) from requisitions_tracker.items where legacy_id is not null) as items_with_legacy_id,
    (select count(*) from requisitions_tracker.items where status = 'out')        as items_out,
    (select count(*) from requisitions_tracker.items where photo_url is not null) as items_with_photo,
    (select count(*) from requisitions_tracker.transfers)                         as transfers;
  select count(*) from storage.objects where bucket_id = 'item-images';"
```

- [ ] Counts match Firestore (items, categories, transfers) and the dry-run summary.
- [ ] `items_out` matches the number of items currently held in the Firebase app, and the holder names look right: `select name, status, holder_name from requisitions_tracker.items where status = 'out';`
- [ ] Every photo URL resolves: open one or two `photo_url` values in a browser.

### 4. Update the compose service

Edit `/root/n8n/docker-compose.yml`, service `item-tracker`:

- add `build.args` with the `NEXT_PUBLIC_*` variables (they are inlined at build time, so `env_file` alone is not enough);
- remove the `public/uploads` volume (photos are in Storage now);
- keep `env_file` so `SUPABASE_SERVICE_ROLE_KEY` reaches the container at runtime without being in the image.

```yaml
  item-tracker:
    build:
      context: ../requisitions-website
      args:
        NEXT_PUBLIC_SUPABASE_URL: https://supa.esnporto.org
        NEXT_PUBLIC_SUPABASE_ANON_KEY: <anon key>
        NEXT_PUBLIC_SUPABASE_SCHEMA: requisitions_tracker
        NEXT_PUBLIC_PROJECT_SLUG: requisitions_tracker
        NEXT_PUBLIC_PROJECT_NAME: Requisitions Tracker
        NEXT_PUBLIC_APP_URL: https://requisitions.esnporto.org
        NEXT_PUBLIC_IT_MANAGER_URL: https://it.esnporto.org
    container_name: item_tracker
    restart: always
    env_file:
      - ../requisitions-website/.env
    networks:
      - proxy-network
```

The anon key is not a secret (it is in the browser bundle anyway), so it can live in the compose file. The service role key must stay only in `.env`.

- [ ] Compose file updated; `docker compose config` in `/root/n8n` parses without errors.

### 5. Build and start

```bash
cd /root/n8n
docker tag $(docker compose images -q item-tracker) item-tracker:firebase-backup 2>/dev/null || true
docker compose build item-tracker && docker compose up -d item-tracker
docker compose logs -f --tail=50 item-tracker   # wait for "Ready" on :3000
```

- [ ] Old image tagged `item-tracker:firebase-backup` (for rollback).
- [ ] Build succeeded, container is up, Nginx Proxy Manager still points `requisitions.esnporto.org` to `item_tracker:3000` (unchanged).

### 6. Smoke tests

Do these with two accounts: a regular volunteer and an admin.

- [ ] `https://requisitions.esnporto.org` redirects to `/login`; signing in with an ESN account (IT Manager credentials) lands on the dashboard with the imported items and categories.
- [ ] A signed-in account without volunteer role (e.g. a student account) lands on `/no-access`.
- [ ] Scan a **printed** QR code of an existing item: `/scan/<oldFirestoreId>` opens the right item.
- [ ] Volunteer: pick up an item in the office, then return it. Both appear in the item history and on the dashboard in real time (open the dashboard in a second tab while doing it).
- [ ] Volunteer: pass an item to another volunteer; the recipient shows up as holder.
- [ ] Admin: force-return an item held by someone else; history shows the admin override.
- [ ] Admin: reassign an item to a volunteer.
- [ ] Admin: create a category, create an item with a photo (upload goes to Storage; the image loads), edit it, delete the test item and category.
- [ ] Container logs show no 401/403/500 during the above.

### 7. Announce

- [ ] Tell the volunteers the tracker is back, that they sign in with their IT Manager account, and that old QR codes still work. Point them to `https://requisitions.esnporto.org/forgot-password` if they never set a password (same GoTrue account as IT Manager).

## Rollback

Firestore is untouched by the whole procedure, so rolling back is only a matter of running the old image again.

1. In `/root/n8n/docker-compose.yml`, restore the previous `item-tracker` definition (plain `build: ../requisitions-website`, `env_file`, the `public/uploads` volume).
2. Either check out `main` in `/root/requisitions-website` and `docker compose build item-tracker`, or point the service at the saved image: `image: item-tracker:firebase-backup` (remove `build`).
3. Ensure `.env` still has the `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_ADMIN_SERVICE_ACCOUNT` variables (a copy is kept in `.env.firebase.bak`).
4. `docker compose up -d item-tracker`.

Any movements recorded in Supabase between cutover and rollback would have to be re-entered in the Firebase app by hand. The Supabase data can be wiped and re-imported at any time by re-running the migration script.

## Post-cutover cleanup

Do this after at least one or two weeks without issues.

- [ ] Remove `FIREBASE_PROJECT_ID` and `FIREBASE_ADMIN_SERVICE_ACCOUNT` from `/root/requisitions-website/.env`; delete `.env.firebase.bak`.
- [ ] Delete `scripts/firestore-migration/` from the repo (it has no purpose once the import is done) and the legacy Firebase block from `.env.example`.
- [ ] Delete `public/uploads/` on the VPS (photos are in the `item-images` bucket). Keep a copy for a while if in doubt: `tar czf /root/requisitions-uploads-backup.tgz -C /root/requisitions-website public/uploads`.
- [ ] Revoke the Firebase service account key, then delete the Firebase project (Auth users and Firestore) once everyone agrees nothing else depends on it.
- [ ] Update the `.env` on the VPS so it only contains what `.env.example` documents.
- [ ] Follow-up: move the repository to the `ESN-Porto` GitHub org and onto the shared GitHub Actions -> GHCR -> `deploy` pipeline like the other apps.

## Checklist summary

- [ ] Admins granted in IT Manager
- [ ] Freeze announced
- [ ] Dry run OK
- [ ] `--apply` OK
- [ ] Counts verified
- [ ] Compose updated (build args, no uploads volume, env_file kept)
- [ ] Old image tagged, new image built and running
- [ ] Smoke tests passed (login, no-access, legacy QR, pickup/return, pass, force-return, assign, admin CRUD + upload)
- [ ] Volunteers informed
- [ ] Cleanup scheduled
