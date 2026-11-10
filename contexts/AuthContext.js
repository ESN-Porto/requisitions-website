"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Session context. The server root layout resolves the session once
 * (Supabase Auth cookie → auth.users → requisitions_tracker.volunteers +
 * my_capabilities()) and hands it down as `initial`. Access is decided by the
 * proxy (middleware) before any page renders, so by the time a page mounts the
 * user is a volunteer with access to this project.
 *
 * Shape kept close to the old Firebase context so pages read naturally:
 *   user          → { id, email }
 *   userData      → { id, name, email, photo_url, esn_role }
 *   capabilities  → capability keys from my_capabilities() ([] when unknown)
 *   can(key)      → whether `key` is in capabilities
 *
 * This only hides UI. The API routes and the database (RLS + RPCs) enforce
 * the same keys.
 */
const AuthContext = createContext({
    user: null,
    userData: null,
    capabilities: [],
    can: () => false,
    loading: false,
    logout: async () => {},
});

export function AuthProvider({ initial, children }) {
    const router = useRouter();
    const [session, setSession] = useState(initial);

    // Keep in sync when the server re-renders the layout (router.refresh()).
    useEffect(() => {
        setSession(initial);
    }, [initial]);

    // React to sign-outs triggered elsewhere (another tab, token revoked).
    useEffect(() => {
        const supabase = createClient();
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT") {
                setSession({ user: null, profile: null, capabilities: [] });
                router.refresh();
            }
        });
        return () => subscription.unsubscribe();
    }, [router]);

    const value = useMemo(() => {
        // Fail closed: anything but an array of keys means no capabilities.
        const capabilities = Array.isArray(session?.capabilities) ? session.capabilities : [];
        return {
            user: session?.user ?? null,
            userData: session?.profile ?? null,
            capabilities,
            can: (key) => capabilities.includes(key),
            loading: false,
            logout: async () => {
                await createClient().auth.signOut();
                router.push("/login");
                router.refresh();
            },
        };
    }, [session, router]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
