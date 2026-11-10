import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/permissions";
import { CAP } from "@/lib/auth/capabilities";
import { errorResponse, badRequest } from "@/lib/apiErrors";
import { slugify } from "@/lib/slug";

// POST /api/categories — create a category (admins).
export async function POST(request) {
    const { error } = await requireCapability(CAP.CATALOGUE_MANAGE);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name || name.length > 60) return badRequest("Name is required (max 60 characters)");
    const key = slugify(name);
    if (!key) return badRequest("Name must contain letters or numbers");

    const supabase = await createClient();
    const { data, error: dbError } = await supabase.from("categories").insert({ name, key }).select("id, key").single();
    if (dbError) {
        if (dbError.code === "23505") return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
        return errorResponse(dbError, "Could not create category");
    }
    return NextResponse.json(data, { status: 201 });
}
