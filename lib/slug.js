/** "Câmeras fotográficas " → "cameras-fotograficas" (matches categories.key check). */
export function slugify(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
