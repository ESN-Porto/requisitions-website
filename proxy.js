import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: `proxy` replaces `middleware`.
export async function proxy(request) {
    return updateSession(request);
}

export const config = {
    matcher: [
        // Everything except static assets and images.
        "/((?!_next/static|_next/image|assets/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    ],
};
