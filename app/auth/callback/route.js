import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(raw) {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
    return raw;
}

/**
 * PKCE code exchange for e-mail links / OAuth. Not used by the password login,
 * kept so the app matches the other ESN apps and supports magic links or
 * Google later without code changes (the domain is already in GoTrue's
 * URI allow list).
 */
export async function GET(request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = safeNext(searchParams.get("next"));

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth`);
}
