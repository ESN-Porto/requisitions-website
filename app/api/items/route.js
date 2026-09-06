import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { errorResponse, badRequest } from "@/lib/apiErrors";
import { isUuid } from "@/lib/ids";

// POST /api/items — create an item (project admins; RLS enforces it too).
export async function POST(request) {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const categoryId = body.categoryId || null;
    const photoUrl = body.photoUrl || null;

    if (!name || name.length > 120) return badRequest("Name is required (max 120 characters)");
    if (categoryId && !isUuid(categoryId)) return badRequest("Invalid category");

    const supabase = await createClient();
    const { data, error: dbError } = await supabase
        .from("items")
        .insert({ name, category_id: categoryId, photo_url: photoUrl, created_by: user.id })
        .select("id")
        .single();
    if (dbError) return errorResponse(dbError, "Could not create item");

    return NextResponse.json({ id: data.id }, { status: 201 });
}
