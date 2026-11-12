import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "requisitions_tracker";

async function build(schema) {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            db: { schema },
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Called from a Server Component: the proxy (middleware)
                        // already refreshed the session, so this is safe to ignore.
                    }
                },
            },
        }
    );
}

/** Server client (Server Components, Route Handlers) on the project schema. */
export async function createClient() {
    return build(SCHEMA);
}

/** Server client on the shared `public` schema (profiles, projects, RPCs). */
export async function createPublicClient() {
    return build("public");
}
