// lib/brands/validation.ts

/**
 * Returns true if the given hostname resolves to a private or link-local IP range.
 *
 * Checked ranges:
 *  - 10.0.0.0/8
 *  - 172.16.0.0/12
 *  - 192.168.0.0/16
 *  - 127.0.0.0/8
 *  - 169.254.0.0/16
 *  - ::1, fc00::/7 (fc00::, fd00::)
 */
export function isPrivateIp(hostname: string): boolean {
  // Normalise: strip surrounding brackets for IPv6 literals like [::1]
  const h = hostname.replace(/^\[|\]$/g, "");

  // IPv6 checks
  if (h === "::1") return true;
  const lower = h.toLowerCase();
  if (lower.startsWith("fc00:") || lower.startsWith("fd00:")) return true;

  // IPv4 checks
  if (h.startsWith("10.")) return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("169.254.")) return true;

  // 172.16.0.0 – 172.31.255.255
  if (h.startsWith("172.")) {
    const second = parseInt(h.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // "localhost" is effectively 127.0.0.1
  if (lower === "localhost") return true;

  return false;
}

/**
 * Validates that a URL string is safe to use as an event feed base URL.
 * Returns null if valid, or a human-readable error message if invalid.
 */
export function validateEventFeedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL";
  }

  if (parsed.protocol !== "https:") {
    return "Must be an HTTPS URL";
  }

  if (isPrivateIp(parsed.hostname)) {
    return "URL must not point to a private or internal IP address";
  }

  return null;
}
