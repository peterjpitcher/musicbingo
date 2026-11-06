import crypto from "node:crypto";

/**
 * True only for exactly `Bearer <CRON_SECRET>`, compared in constant time.
 * False when the secret is not configured, so a cron route fails closed.
 */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected || !authorization) return false;
  const left = Buffer.from(authorization);
  const right = Buffer.from(`Bearer ${expected}`);
  return left.byteLength === right.byteLength && crypto.timingSafeEqual(left, right);
}
