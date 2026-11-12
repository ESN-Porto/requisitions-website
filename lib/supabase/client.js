import { createBrowserClient } from "@supabase/ssr";

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "requisitions_tracker";

let _client;

/**
 * Browser client bound to this project's schema (requisitions_tracker).
 * Singleton: the realtime socket and auth state should be shared across
 * components.
 */
export function createClient() {
    if (_client) return _client;
    _client = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { db: { schema: SCHEMA } }
    );
    return _client;
}
