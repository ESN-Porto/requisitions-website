import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/storage";

// Item photos. 10 MB is plenty for a phone picture; the old 100 MB limit also
// exceeded what the reverse proxy accepts.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** Sniff the real type from magic bytes — never trust the client's MIME type. */
function detectImageType(buffer) {
    const b = new Uint8Array(buffer.slice(0, 16));
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return null;
}

// POST /api/upload (multipart: file) → { url }
// Admin-only. Writes to Supabase Storage with the service role: the bucket has
// no write policy for regular users on purpose.
export async function POST(request) {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided" }, { status: 400 });
        if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });

        const arrayBuffer = await file.arrayBuffer();
        const contentType = detectImageType(arrayBuffer);
        if (!contentType) {
            return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, WebP and GIF images are allowed." }, { status: 400 });
        }

        const path = `items/${Date.now()}_${crypto.randomUUID()}.${EXT[contentType]}`;
        const storage = createAdminClient().storage.from(BUCKET);
        const { error: uploadError } = await storage.upload(path, Buffer.from(arrayBuffer), {
            contentType,
            cacheControl: "31536000",
            upsert: false,
        });
        if (uploadError) {
            console.error("[upload]", uploadError);
            return NextResponse.json({ error: "Upload failed" }, { status: 500 });
        }

        const { data } = storage.getPublicUrl(path);
        return NextResponse.json({ url: data.publicUrl });
    } catch (e) {
        console.error("[upload]", e);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
