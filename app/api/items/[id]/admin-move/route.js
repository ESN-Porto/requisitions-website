import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { errorResponse, badRequest } from "@/lib/apiErrors";
import { isUuid } from "@/lib/ids";

const ACTIONS = new Set(["return", "assign"]);

// POST /api/items/:id/admin-move  { action: 'return' | 'assign', toUserId?, note? }
export async function POST(request, { params }) {
    const { id } = await params;
    if (!isUuid(id)) return badRequest("Invalid item id");
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    if (!ACTIONS.has(action)) return badRequest("Unknown action");
    if (action === "assign" && !isUuid(body.toUserId)) return badRequest("Choose a volunteer");

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc("admin_move_item", {
        p_item_id: id,
        p_action: action,
        p_to_user: action === "assign" ? body.toUserId : null,
        p_note: body.note ?? null,
    });
    if (rpcError) return errorResponse(rpcError, "Could not move item");

    return NextResponse.json({ item: Array.isArray(data) ? data[0] ?? null : data });
}
