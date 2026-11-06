/**
 * Helpers for web addresses typed by an operator, such as `brands.website_url`
 * or a host's QR override. These values are often stored without a scheme
 * (The Anchor's brand row held `www.the-anchor.pub` until November 2026), and a
 * QR code that encodes a bare hostname does not open as a link on every phone.
 */

/**
 * Turn an operator-typed address into an absolute http(s) URL, adding
 * `https://` when no scheme is given. Returns null for an empty value or
 * anything that is not a usable web address, so callers can hide the QR
 * rather than encode something broken.
 */
export function normaliseWebUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  const withScheme = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A bare word such as "anchor" parses as a hostname but is not a site.
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * A short, readable form of a web address for on-screen text: no scheme and
 * no trailing slash (`https://www.the-anchor.pub/` becomes `www.the-anchor.pub`).
 * Returns "" when the value is not a usable web address.
 */
export function websiteLabel(value: string | null | undefined): string {
  const url = normaliseWebUrl(value);
  if (!url) return "";
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
