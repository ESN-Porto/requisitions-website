/** Supabase Storage bucket for item photos (public read, service-role write). */
export const BUCKET = "item-images";

/** Public URL → object path inside the bucket, or null if it is not ours. */
export function storagePathFromUrl(url) {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}
