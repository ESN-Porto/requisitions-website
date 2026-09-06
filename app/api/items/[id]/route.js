import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/permissions";
import { errorResponse, badRequest } from "@/lib/apiErrors";
import { isUuid } from "@/lib/ids";
import { storagePathFromUrl, BUCKET } from "@/lib/storage";

// PATCH /api/items/:id — rename / recategorise / change photo (admins).
// Status and holder are NOT editable here: only move_item / admin_move_item
// change them, so every movement leaves an audit row.
export async function PATCH(request, { params }) {
    const { id } = await params;
    if (!isUuid(id)) return badRequest("Invalid item id");
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const patch = {};
    if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name || name.length > 120) return badRequest("Name is required (max 120 characters)");
        patch.name = name;
    }
    if (body.categoryId !== undefined) {
        if (body.categoryId !== null && !isUuid(body.categoryId)) return badRequest("Invalid category");
        patch.category_id = body.categoryId;
    }
    if (body.photoUrl !== undefined) patch.photo_url = body.photoUrl || null;
    if (Object.keys(patch).length === 0) return badRequest("Nothing to update");

    const supabase = await createClient();
    const { data: before } = await supabase.from("items").select("photo_url").eq("id", id).maybeSingle();
    const { data, error: dbError } = await supabase.from("items").update(patch).eq("id", id).select("id").maybeSingle();
    if (dbError) return errorResponse(dbError, "Could not update item");
    if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Replaced photo → drop the old object (best effort).
    if (patch.photo_url !== undefined && before?.photo_url && before.photo_url !== patch.photo_url) {
        await removeStoredPhoto(before.photo_url);
    }
    return NextResponse.json({ id: data.id });
}

// DELETE /api/items/:id — remove an item (admins). History rows keep item_name.
export async function DELETE(_request, { params }) {
    const { id } = await params;
    if (!isUuid(id)) return badRequest("Invalid item id");
    const { error } = await requireAdmin();
    if (error) return error;

    const supabase = await createClient();
    const { data, error: dbError } = await supabase.from("items").delete().eq("id", id).select("id, photo_url").maybeSingle();
    if (dbError) return errorResponse(dbError, "Could not delete item");
    if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    if (data.photo_url) await removeStoredPhoto(data.photo_url);
    return NextResponse.json({ ok: true });
}

async function removeStoredPhoto(url) {
    const path = storagePathFromUrl(url);
    if (!path) return;
    try {
        await createAdminClient().storage.from(BUCKET).remove([path]);
    } catch (e) {
        console.warn("[items] could not remove photo", path, e?.message);
    }
}
