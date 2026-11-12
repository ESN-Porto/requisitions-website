# Firestore -> Supabase data migration

One-off script that copies the requisitions tracker data from Firebase (Auth + Firestore)
into the shared Supabase project (schema `requisitions_tracker` + Storage bucket `item-images`).

It is self-contained (own `package.json`) so `firebase-admin` is never installed in the app image.

## What it does

1. Reads `users`, `categories`, `items`, `transfers` from Firestore.
2. Lists Supabase auth users and maps Firebase users to them by **lowercase email**.
3. Computes target rows:
   - `categories` — key/name (slug derived from name when `key` is missing).
   - `items` — `legacy_id` = Firestore id, `category_id` by `type` == category key,
     holder mapped by email (name snapshot kept when unmapped; both null when `status='office'`).
     Photos at `/api/image/<file>` are read from `public/uploads/` and uploaded to
     `item-images/items/<legacy_id>.<ext>`; http(s) URLs are kept as is.
   - `transfers` — `item_id` only if the item exists in the migrated set, user ids by email,
     name snapshots kept, `performed_by` = `to_user_id` for pickups, else `from_user_id`.
4. Dry run (default): prints the report and writes **nothing**.
   `--apply`: uploads photos, then upserts categories -> items -> transfers in batches of 200.

## How to run

```bash
cd scripts/firestore-migration
npm install
node migrate.mjs            # dry run
node migrate.mjs --apply    # real import
```

Config comes from the repo's `.env` (`FIREBASE_PROJECT_ID`, `FIREBASE_ADMIN_SERVICE_ACCOUNT`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Secrets are never printed.

## Idempotency

Every row id is a UUID v5 of `requisitions-tracker:<collection>:<firestoreId>` (RFC DNS namespace),
and all writes are `upsert(..., { onConflict: 'id' })`; storage uploads use `upsert: true`.
Re-running `--apply` overwrites the same rows/files, so it is safe to run again at cutover.
Rows created in Supabase after the migration are untouched.

## What to check in the report

- **Unmapped users** — Firebase users with no Supabase auth user for the same email. Their
  history keeps the name snapshots but `holder_id` / `from_user_id` / `to_user_id` will be null.
  Fix by creating/inviting those users in Supabase before running `--apply`, then re-run.
- **Items 'out' with unmapped holder** — the UI will show the holder name but the holder cannot
  act on the item until the user exists and the row is corrected.
- **Items with unknown category** — `category_id` will be null.
- **Transfers referencing missing items** — `item_id` will be null (history is kept via `item_name`).
- **Photos missing on disk** — `photo_url` will be null.
- In apply mode: rows written per table and photos uploaded (plus any upload errors; exit code 2).

The script exits non-zero on unexpected errors.
