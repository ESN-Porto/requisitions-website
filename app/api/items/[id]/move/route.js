import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/permissions";
import { errorResponse, badRequest } from "@/lib/apiErrors";
import { isUuid } from "@/lib/ids";

const ACTIONS = new Set(["pickup", "return", "pass", "take"]);

// POST /api/items/:id/move  { action, toUserId?, eventName?, note? }
// Runs requisitions_tracker.move_item AS THE USER (auth.uid() inside the
// function is the caller), so the business rules and the audit row are
// enforced in one transaction in Postgres.
export async function POST(request, { params }) {
    const { id } = await params;
    if (!isUuid(id)) return badRequest("Invalid item id");
    const { error } = await requireUser();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    if (!ACTIONS.has(action)) return badRequest("Unknown action");
    if (action === "pass" && !isUuid(body.toUserId)) return badRequest("Choose a volunteer");

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc("move_item", {
        p_item_id: id,
        p_action: action,
        p_to_user: action === "pass" ? body.toUserId : null,
        p_event_name: body.eventName ?? null,
        p_note: body.note ?? null,
    });
    if (rpcError) return errorResponse(rpcError, "Could not move item");

    return NextResponse.json({ item: Array.isArray(data) ? data[0] ?? null : data });
}
