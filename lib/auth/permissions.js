import { createClient, createPublicClient } from "@/lib/supabase/server";

const PROJECT_SLUG = process.env.NEXT_PUBLIC_PROJECT_SLUG || "requisitions_tracker";

/**
 * Server-side helpers over the shared ESN access model. All decisions are made
 * by SECURITY DEFINER functions in Postgres; these are thin wrappers.
 */

export async function getUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

export async function hasProjectAccess() {
    const supabase = await createPublicClient();
    const { data } = await supabase.rpc("has_project_access", { check_project_slug: PROJECT_SLUG });
    return data === true;
}

/**
 * Capability keys the current user has, from requisitions_tracker.my_capabilities()
 * (project schema client). Fails closed: no session or any error → [].
 */
export async function getCapabilities(client) {
    try {
        const supabase = client || (await createClient());
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase.rpc("my_capabilities");
        if (error || !Array.isArray(data)) return [];
        return data
            .map((row) => (typeof row === "string" ? row : row?.my_capabilities))
            .filter((key) => typeof key === "string");
    } catch {
        return [];
    }
}

/**
 * The signed-in volunteer as this app sees them (name/photo resolved by the
 * requisitions_tracker.volunteers view from IT Manager's data).
 * Returns null when there is no session.
 */
export async function getSessionContext() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, profile: null, capabilities: [] };

    const [{ data: profile }, capabilities] = await Promise.all([
        supabase.from("volunteers").select("id, name, email, photo_url, esn_role").eq("id", user.id).maybeSingle(),
        getCapabilities(supabase),
    ]);

    return {
        user: { id: user.id, email: user.email },
        profile: profile || { id: user.id, name: user.email?.split("@")[0] || "Volunteer", email: user.email, photo_url: null },
        capabilities,
    };
}

/**
 * Route-handler guards. Return a Response on failure, null when ok.
 */
export async function requireUser() {
    const user = await getUser();
    if (!user) return { user: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
    return { user, error: null };
}

export async function requireCapability(key) {
    const { user, error } = await requireUser();
    if (error) return { user: null, error };
    const capabilities = await getCapabilities();
    if (!capabilities.includes(key)) {
        return { user: null, error: Response.json({ error: `Missing permission: ${key}` }, { status: 403 }) };
    }
    return { user, error: null };
}
