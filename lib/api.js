"use client";

/**
 * Tiny fetch wrapper for the app's own API routes. Mutations never touch the
 * database from the browser; they go through /api/* where the server checks
 * the session and calls the Postgres RPCs / RLS-protected tables as the user.
 */
export async function api(path, { method = "POST", body, formData } = {}) {
    const res = await fetch(path, {
        method,
        headers: formData ? undefined : { "Content-Type": "application/json" },
        body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
    });
    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }
    if (!res.ok) {
        const message = payload?.error || `Request failed (${res.status})`;
        const error = new Error(message);
        error.status = res.status;
        throw error;
    }
    return payload;
}

/** Movement actions performed by the signed-in volunteer. */
export const moveItem = (itemId, action, { toUserId = null, eventName = null, note = null } = {}) =>
    api(`/api/items/${itemId}/move`, { body: { action, toUserId, eventName, note } });

/** Admin overrides (force return / assign). */
export const adminMoveItem = (itemId, action, { toUserId = null, note = null } = {}) =>
    api(`/api/items/${itemId}/admin-move`, { body: { action, toUserId, note } });
