import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/permissions";
import { CAP } from "@/lib/auth/capabilities";
import { errorResponse, badRequest } from "@/lib/apiErrors";
import { isUuid } from "@/lib/ids";
import { slugify } from "@/lib/slug";

// PATCH /api/categories/:id — rename (key follows the name). Items reference
// categories by id, so renaming never orphans them.
export async function PATCH(request, { params }) {
    const { id } = await params;
    if (!isUuid(id)) return badRequest("Invalid category id");
    const { error } = await requireCapability(CAP.CATALOGUE_MANAGE);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name || name.length > 60) return badRequest("Name is required (max 60 characters)");
    const key = slugify(name);
    if (!key) return badRequest("Name must contain letters or numbers");

    const supabase = await createClient();
    const { data, error: dbError } = await supabase.from("categories").update({ name, key }).eq("id", id).select("id, key").maybeSingle();
    if (dbError) {
        if (dbError.code === "23505") return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
        return errorResponse(dbError, "Could not update category");
    }
    if (!data) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json(data);
}

// DELETE /api/categories/:id — items in it keep existing with no category.
export async function DELETE(_request, { params }) {
    const { id } = await params;
    if (!isUuid(id)) return badRequest("Invalid category id");
    const { error } = await requireCapability(CAP.CATALOGUE_MANAGE);
    if (error) return error;

    const supabase = await createClient();
    const { data, error: dbError } = await supabase.from("categories").delete().eq("id", id).select("id").maybeSingle();
    if (dbError) return errorResponse(dbError, "Could not delete category");
    if (!data) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
}
