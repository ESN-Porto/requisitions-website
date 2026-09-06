import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER ONLY — bypasses RLS.
 * Used for Storage uploads (after an explicit admin check) and nothing else.
 */
export function createAdminClient(schema = "public") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    return createClient(url, key, {
        db: { schema },
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
