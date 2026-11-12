import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const PROJECT_SLUG = process.env.NEXT_PUBLIC_PROJECT_SLUG || "requisitions_tracker";

// Reachable without a session.
const PUBLIC_ROUTES = ["/login", "/forgot-password", "/auth/", "/no-access", "/api/project-config"];
// Needs a session but not project access (password recovery lands here).
const SESSION_ONLY_ROUTES = ["/reset-password"];

function isPublic(pathname) {
    return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route));
}

/**
 * Same contract as the other ESN apps (it-managment, app-template):
 *   1. refresh the Supabase session cookie,
 *   2. no session → /login?next=<path>,
 *   3. session but no has_project_access(slug) → /no-access.
 * Access itself is decided in the database by IT Manager's model
 * (projects + profiles.role + user_project_access), never here.
 */
export async function updateSession(request) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname, search } = request.nextUrl;
    const publicRoute = isPublic(pathname);

    const isApi = pathname.startsWith("/api/");

    // API routes answer with JSON, never with a redirect to the login page.
    if (!user && !publicRoute && isApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user && !publicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        url.searchParams.set("next", pathname + search);
        return NextResponse.redirect(url);
    }

    if (user && !publicRoute && !SESSION_ONLY_ROUTES.includes(pathname)) {
        const { data: hasAccess } = await supabase.rpc("has_project_access", {
            check_project_slug: PROJECT_SLUG,
            check_user_id: user.id,
        });
        if (!hasAccess && isApi) {
            return NextResponse.json({ error: "Volunteers only" }, { status: 403 });
        }
        if (!hasAccess) {
            const url = request.nextUrl.clone();
            url.pathname = "/no-access";
            url.search = "";
            return NextResponse.redirect(url);
        }
    }

    // Logged-in users have no business on the login page.
    if (user && pathname === "/login") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
    }

    return response;
}
