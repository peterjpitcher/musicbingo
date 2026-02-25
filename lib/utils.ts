/**
 * Shared filename-safe string sanitizer used across PDF, ZIP, and JSON exports.
 * @param fallback - returned when the sanitized result is empty (default "file")
 */
export function sanitizeFilenamePart(s: string, fallback = "file"): string {
  const cleaned = s
    .trim()
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return cleaned || fallback;
}
