import { NextResponse } from "next/server";

/**
 * Map PostgREST / Postgres errors from the RPCs and RLS to HTTP responses.
 * The RPCs raise with deliberate SQLSTATEs:
 *   42501 insufficient_privilege → 403
 *   P0002 no_data_found          → 404
 *   P0001 raise_exception        → 409 (business rule)
 *   22023 invalid_parameter      → 400
 *   23505 unique_violation       → 409
 */
export function errorResponse(error, fallback = "Request failed") {
    const code = error?.code;
    const message = error?.message || fallback;
    const status =
        code === "42501" ? 403 :
        code === "P0002" || code === "PGRST116" ? 404 :
        code === "P0001" || code === "23505" ? 409 :
        code === "22023" || code === "22P02" || code === "23514" ? 400 :
        500;
    if (status === 500) console.error("[api]", error);
    return NextResponse.json({ error: status === 500 ? fallback : message, code }, { status });
}

export function badRequest(message) {
    return NextResponse.json({ error: message }, { status: 400 });
}
