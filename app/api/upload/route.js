import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifyAdmin } from "@/lib/authMiddleware";

// Security limits
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Allowed MIME types and their corresponding magic bytes
const ALLOWED_TYPES = {
    "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
    "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
    "image/webp": { ext: "webp", magic: null }, // checked via RIFF header below
    "image/gif": { ext: "gif", magic: [0x47, 0x49, 0x46] },
};

/**
 * Validate the actual file content matches its claimed type by checking magic bytes.
 * Returns the validated MIME type, or null if invalid.
 */
function validateMagicBytes(buffer) {
    const bytes = new Uint8Array(buffer.slice(0, 16));

    // JPEG: starts with FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }

    // PNG: starts with 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return "image/png";
    }

    // GIF: starts with GIF (47 49 46)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return "image/gif";
    }

    // WebP: starts with RIFF....WEBP
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
        return "image/webp";
    }

    return null;
}

export async function POST(request) {
    try {
        // 1. Verify authentication AND admin role via Firebase Admin SDK
        const auth = await verifyAdmin(request);
        if (!auth) {
            return NextResponse.json(
                { error: "Unauthorized. Admin access required." },
                { status: 403 }
            );
        }

        // 2. Extract file from form data
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // 3. Size check
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File exceeds 100MB limit" }, { status: 400 });
        }

        // 4. Read the file bytes
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 5. Validate actual file content via magic bytes (don't trust client MIME type)
        const detectedType = validateMagicBytes(arrayBuffer);
        if (!detectedType || !ALLOWED_TYPES[detectedType]) {
            return NextResponse.json(
                { error: "Invalid file type. Only JPG, PNG, WebP, and GIF images are allowed." },
                { status: 400 }
            );
        }

        // 6. Use the validated extension (not the client-supplied one)
        const safeExt = ALLOWED_TYPES[detectedType].ext;
        const filename = `${Date.now()}_${crypto.randomUUID()}.${safeExt}`;

        // 7. Save the file
        const uploadDir = path.join(process.cwd(), "public", "uploads");
        await mkdir(uploadDir, { recursive: true });

        const filepath = path.join(uploadDir, filename);

        // Ensure the resolved path is still within the upload directory (prevent path traversal)
        const resolvedPath = path.resolve(filepath);
        const resolvedUploadDir = path.resolve(uploadDir);
        if (!resolvedPath.startsWith(resolvedUploadDir)) {
            return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
        }

        await writeFile(filepath, buffer);

        return NextResponse.json({ url: `/api/image/${filename}` });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}