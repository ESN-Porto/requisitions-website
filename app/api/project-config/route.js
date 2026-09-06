import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_SLUG = process.env.NEXT_PUBLIC_PROJECT_SLUG || "requisitions_tracker";

// GET /api/project-config — public project metadata from public.projects.
export async function GET() {
    try {
        const admin = createAdminClient("public");
        const { data } = await admin
            .from("projects")
            .select("name, description, access_level, allow_signup, allow_access_requests")
            .eq("slug", PROJECT_SLUG)
            .single();
        if (data) return NextResponse.json(data);
    } catch {
        // fall through to defaults
    }
    return NextResponse.json({
        name: process.env.NEXT_PUBLIC_PROJECT_NAME || "Requisitions Tracker",
        access_level: "staff_only",
        allow_signup: false,
        allow_access_requests: false,
    });
}
