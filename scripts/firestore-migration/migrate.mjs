#!/usr/bin/env node
/**
 * One-off data migration: Firebase (Auth + Firestore) -> Supabase (Postgres + Storage).
 *
 * Usage:
 *   node migrate.mjs            # dry run: reads Firestore, computes mapping, prints report, writes nothing
 *   node migrate.mjs --apply    # performs upserts into requisitions_tracker.* and uploads item photos
 *
 * The script is idempotent: every row id is a UUID v5 derived from the Firestore doc id,
 * and all writes are upserts on `id`, so it can be re-run safely at cutover.
 */

import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });

const APPLY = process.argv.includes('--apply');
const UPLOADS_DIR = path.join(REPO_ROOT, 'public', 'uploads');
const BUCKET = 'item-images';
const BATCH_SIZE = 200;
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // RFC 4122 DNS namespace

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const FIREBASE_PROJECT_ID = requireEnv('FIREBASE_PROJECT_ID');
const FIREBASE_ADMIN_SERVICE_ACCOUNT = requireEnv('FIREBASE_ADMIN_SERVICE_ACCOUNT');
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID v5 (SHA-1, RFC 4122) implemented with node:crypto — no extra dependency. */
function uuidV5(name, namespace = UUID_NAMESPACE) {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(nsBytes).update(Buffer.from(name, 'utf8')).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic row id for a Firestore document. */
function rowId(collection, firestoreId) {
  return uuidV5(`requisitions-tracker:${collection}:${firestoreId}`);
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Convert a Firestore Timestamp / Date / ISO string to an ISO string, or the fallback. */
function toIso(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function upsertBatches(supabase, table, rows) {
  let written = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`upsert into ${table} failed: ${error.message}`);
    written += batch.length;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function initFirestore() {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(FIREBASE_ADMIN_SERVICE_ACCOUNT);
  } catch {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON');
  }
  initializeApp({ credential: cert(serviceAccount), projectId: FIREBASE_PROJECT_ID });
  return getFirestore();
}

function initSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'requisitions_tracker' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Build a lowercase email -> auth.users.id map by paginating the Admin API. */
async function loadAuthUsersByEmail(supabase) {
  const map = new Map();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    for (const user of data.users) {
      if (user.email) map.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < perPage) break;
  }
  return map;
}

async function loadCollection(db, name) {
  const snap = await db.collection(name).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to Supabase)' : 'DRY RUN (no writes)'}`);
  console.log(`Firebase project: ${FIREBASE_PROJECT_ID}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('');

  const db = initFirestore();
  const supabase = initSupabase();

  // ---- Load sources -------------------------------------------------------
  console.log('Loading Firestore collections...');
  const [fbUsers, fbCategories, fbItems, fbTransfers] = await Promise.all([
    loadCollection(db, 'users'),
    loadCollection(db, 'categories'),
    loadCollection(db, 'items'),
    loadCollection(db, 'transfers'),
  ]);
  console.log(
    `  users=${fbUsers.length} categories=${fbCategories.length} items=${fbItems.length} transfers=${fbTransfers.length}`,
  );

  console.log('Loading Supabase auth users...');
  const authByEmail = await loadAuthUsersByEmail(supabase);
  console.log(`  auth users with email: ${authByEmail.size}`);
  console.log('');

  // ---- Users: Firebase uid -> Supabase auth id ----------------------------
  const uidToAuthId = new Map();
  const uidToUser = new Map();
  const unmappedUsers = [];
  for (const u of fbUsers) {
    uidToUser.set(u.id, u);
    const email = (u.email || '').toLowerCase().trim();
    const authId = email ? authByEmail.get(email) : undefined;
    if (authId) {
      uidToAuthId.set(u.id, authId);
    } else {
      unmappedUsers.push({ uid: u.id, name: u.name || '(no name)', email: u.email || '(no email)' });
    }
  }
  const mapUid = (uid) => (uid ? uidToAuthId.get(uid) ?? null : null);
  /** Firebase uids referenced by items/transfers that have no users/{uid} doc at all. */
  const unknownUids = new Set();
  const noteUid = (uid) => {
    if (uid && !uidToUser.has(uid)) unknownUids.add(uid);
  };

  // ---- Categories ---------------------------------------------------------
  const categoryRows = [];
  const categoryIdByKey = new Map();
  fbCategories.forEach((c, index) => {
    const key = emptyToNull(c.key) ?? slugify(c.name);
    const row = {
      id: rowId('categories', c.id),
      key,
      name: c.name ?? key,
      sort_order: index,
      created_at: toIso(c.createdAt, new Date().toISOString()),
    };
    categoryRows.push(row);
    categoryIdByKey.set(key, row.id);
  });

  // ---- Items --------------------------------------------------------------
  const itemRows = [];
  const itemIdsByLegacy = new Map();
  const itemsUnknownCategory = [];
  const itemsOutUnmappedHolder = [];
  const photosMissing = [];
  const photoUploads = []; // { storagePath, diskPath, contentType, legacyId }

  for (const it of fbItems) {
    const id = rowId('items', it.id);
    itemIdsByLegacy.set(it.id, id);

    const categoryId = it.type ? categoryIdByKey.get(it.type) ?? null : null;
    if (!categoryId) itemsUnknownCategory.push({ name: it.name, type: it.type ?? null, legacyId: it.id });

    const status = it.status === 'out' ? 'out' : 'office';
    let holderId = null;
    let holderName = null;
    if (status === 'out') {
      noteUid(it.currentHolder);
      holderId = mapUid(it.currentHolder);
      holderName = emptyToNull(it.currentHolderName);
      if (!holderId) {
        itemsOutUnmappedHolder.push({
          name: it.name,
          holderName: holderName ?? '(no name)',
          holderUid: it.currentHolder ?? null,
        });
      }
    }

    // Photo handling
    let photoUrl = null;
    const src = typeof it.photoURL === 'string' ? it.photoURL.trim() : '';
    if (/^https?:\/\//i.test(src)) {
      photoUrl = src;
    } else if (src.startsWith('/api/image/')) {
      const filename = decodeURIComponent(src.slice('/api/image/'.length));
      const ext = path.extname(filename).toLowerCase();
      const diskPath = path.join(UPLOADS_DIR, path.basename(filename));
      const contentType = CONTENT_TYPES[ext];
      if (!contentType || !(await fileExists(diskPath))) {
        photosMissing.push({ name: it.name, legacyId: it.id, photoURL: src });
      } else {
        const storagePath = `items/${it.id}${ext}`;
        photoUploads.push({ storagePath, diskPath, contentType, legacyId: it.id });
        photoUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
      }
    }

    const updatedAt = toIso(it.updatedAt, new Date().toISOString());
    itemRows.push({
      id,
      legacy_id: it.id,
      name: it.name ?? 'Unnamed item',
      category_id: categoryId,
      photo_url: photoUrl,
      status,
      holder_id: holderId,
      holder_name: holderName,
      created_by: null,
      created_at: updatedAt,
      updated_at: updatedAt,
    });
  }

  // ---- Transfers ----------------------------------------------------------
  const transferRows = [];
  const transfersMissingItem = [];
  const transfersBadAction = [];

  for (const t of fbTransfers) {
    const itemId = t.itemId ? itemIdsByLegacy.get(t.itemId) ?? null : null;
    if (!itemId) transfersMissingItem.push({ transferId: t.id, itemId: t.itemId ?? null, itemName: t.itemName ?? null });

    const action = ['pickup', 'return', 'transfer'].includes(t.action) ? t.action : null;
    if (!action) {
      transfersBadAction.push({ transferId: t.id, action: t.action ?? null });
      continue;
    }

    noteUid(t.fromUserId);
    noteUid(t.toUserId);
    const fromUserId = mapUid(t.fromUserId);
    const toUserId = mapUid(t.toUserId);
    const adminOverride = Boolean(t.adminOverride);
    const performedBy = action === 'pickup' ? toUserId : fromUserId;

    transferRows.push({
      id: rowId('transfers', t.id),
      item_id: itemId,
      item_name: emptyToNull(t.itemName) ?? 'Unknown',
      action,
      from_user_id: fromUserId,
      from_user_name: emptyToNull(t.fromUserName),
      to_user_id: toUserId,
      to_user_name: emptyToNull(t.toUserName),
      event_name: emptyToNull(t.eventName),
      note: emptyToNull(t.note),
      admin_override: adminOverride,
      performed_by: performedBy, // null when the actor is unknown (e.g. admin override by an unmapped user)
      created_at: toIso(t.timestamp, new Date().toISOString()),
    });
  }

  // ---- Apply --------------------------------------------------------------
  const written = { categories: 0, items: 0, transfers: 0, photos: 0 };
  const uploadErrors = [];

  if (APPLY) {
    console.log('Uploading item photos to Storage...');
    for (const up of photoUploads) {
      const buffer = await readFile(up.diskPath);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(up.storagePath, buffer, { contentType: up.contentType, upsert: true });
      if (error) {
        uploadErrors.push({ legacyId: up.legacyId, path: up.storagePath, error: error.message });
        // Don't leave a dangling URL if the upload failed
        const row = itemRows.find((r) => r.legacy_id === up.legacyId);
        if (row) row.photo_url = null;
      } else {
        written.photos++;
        // Use the SDK-provided public URL to be safe about any URL prefix differences
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(up.storagePath);
        const row = itemRows.find((r) => r.legacy_id === up.legacyId);
        if (row && data?.publicUrl) row.photo_url = data.publicUrl;
      }
    }

    console.log('Upserting categories...');
    written.categories = await upsertBatches(supabase, 'categories', categoryRows);
    console.log('Upserting items...');
    written.items = await upsertBatches(supabase, 'items', itemRows);
    console.log('Upserting transfers...');
    written.transfers = await upsertBatches(supabase, 'transfers', transferRows);
    console.log('');
  }

  // ---- Report -------------------------------------------------------------
  const line = (s = '') => console.log(s);
  const section = (title) => {
    line('');
    line(`== ${title} ==`);
  };

  line('==================== MIGRATION REPORT ====================');
  line(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  section('Source counts (Firestore)');
  line(`  users:      ${fbUsers.length}`);
  line(`  categories: ${fbCategories.length}`);
  line(`  items:      ${fbItems.length}`);
  line(`  transfers:  ${fbTransfers.length}`);

  section('Target rows (computed)');
  line(`  categories: ${categoryRows.length}`);
  line(`  items:      ${itemRows.length}`);
  line(`  transfers:  ${transferRows.length}${transfersBadAction.length ? ` (${transfersBadAction.length} skipped, invalid action)` : ''}`);
  line(`  photos to upload: ${photoUploads.length}`);

  section(`Users: total ${fbUsers.length} / mapped ${uidToAuthId.size} / unmapped ${unmappedUsers.length}`);
  if (unmappedUsers.length === 0) line('  (all Firebase users matched a Supabase auth user by email)');
  for (const u of unmappedUsers) line(`  - ${u.name} <${u.email}>  [uid ${u.uid}]`);
  if (unknownUids.size) {
    line(`  Firebase uids referenced by items/transfers with NO users/{uid} document (${unknownUids.size}):`);
    for (const uid of unknownUids) line(`  - ${uid}`);
  }

  section(`Categories (${categoryRows.length})`);
  for (const c of categoryRows) line(`  - ${c.key}  "${c.name}"`);

  section(`Items with unknown category (${itemsUnknownCategory.length})`);
  for (const i of itemsUnknownCategory) line(`  - "${i.name}"  type=${JSON.stringify(i.type)}  [${i.legacyId}]`);

  section(`Items 'out' whose holder is unmapped (${itemsOutUnmappedHolder.length})`);
  for (const i of itemsOutUnmappedHolder) line(`  - "${i.name}"  held by ${i.holderName}  [uid ${i.holderUid}]`);

  section(`Transfers referencing missing items (${transfersMissingItem.length})`);
  for (const t of transfersMissingItem) line(`  - transfer ${t.transferId}  itemId=${t.itemId}  itemName=${JSON.stringify(t.itemName)}`);

  if (transfersBadAction.length) {
    section(`Transfers skipped for invalid action (${transfersBadAction.length})`);
    for (const t of transfersBadAction) line(`  - transfer ${t.transferId}  action=${JSON.stringify(t.action)}`);
  }

  section(`Photos missing on disk / unsupported (${photosMissing.length})`);
  for (const p of photosMissing) line(`  - "${p.name}"  ${p.photoURL}  [${p.legacyId}]`);

  if (APPLY) {
    section('Written');
    line(`  categories: ${written.categories}`);
    line(`  items:      ${written.items}`);
    line(`  transfers:  ${written.transfers}`);
    line(`  photos uploaded: ${written.photos}`);
    if (uploadErrors.length) {
      line(`  photo upload errors (${uploadErrors.length}):`);
      for (const e of uploadErrors) line(`  - ${e.path}: ${e.error}`);
    }
  } else {
    line('');
    line('Dry run only: nothing was written. Re-run with --apply to perform the migration.');
  }
  line('==========================================================');

  if (uploadErrors.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error('Migration failed:', err?.message || err);
  process.exit(1);
});
