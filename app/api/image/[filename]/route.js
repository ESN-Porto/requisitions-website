import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Strict filename pattern: only allow our generated filenames
// Format: {timestamp}_{uuid}.{ext}
const SAFE_FILENAME_PATTERN = /^\d+_[a-f0-9-]+\.(jpg|png|gif|webp)$/;

const MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
};

export async function GET(request, { params }) {
    const { filename } = await params;

    try {
        // 1. Validate filename format strictly
        if (!SAFE_FILENAME_PATTERN.test(filename)) {
            return new NextResponse("Not found", { status: 404 });
        }

        // 2. Resolve path and verify it's within uploads directory
        const uploadDir = path.resolve(process.cwd(), "public", "uploads");
        const filePath = path.resolve(uploadDir, filename);

        if (!filePath.startsWith(uploadDir)) {
            return new NextResponse("Not found", { status: 404 });
        }

        // 3. Read and serve the file
        const fileBuffer = await readFile(filePath);

        const ext = path.extname(filename).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; img-src 'self'",
            },
        });
    } catch (error) {
        return new NextResponse("Image not found", { status: 404 });
    }
}