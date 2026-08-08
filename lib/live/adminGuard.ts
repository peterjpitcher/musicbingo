const ADMIN_UNLOCK_PATH = "/admin";
const DEFAULT_NEXT_PATH = "/host";

export const ADMIN_UNLOCK_MESSAGE =
  "Admin access has expired. Taking you to the unlock page...";

/**
 * Thrown when an admin-gated endpoint answers 401. Callers must let this
 * propagate instead of falling back to cached data: the browser is already on
 * its way to the unlock page, and stale local data would hide the real reason.
 */
export class AdminUnlockRequiredError extends Error {
  constructor() {
    super(ADMIN_UNLOCK_MESSAGE);
    this.name = "AdminUnlockRequiredError";
  }
}

/**
 * Only same-origin absolute paths may be returned to after unlocking. A
 * protocol-relative value such as "//example.com" also starts with "/", so it
 * is rejected explicitly to stop the next parameter becoming an open redirect.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT_PATH
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

/**
 * The admin cookie expires, so a working app starts answering 401 with no
 * warning and every admin-gated list quietly renders empty. Send the operator
 * to the unlock page carrying the current path, so they land back where they
 * were instead of having to work out what broke.
 */
export function redirectToAdminUnlock(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === ADMIN_UNLOCK_PATH) return;
  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`${ADMIN_UNLOCK_PATH}?next=${next}`);
}

/**
 * Bounce to the unlock page and abort the caller when an admin-gated response
 * came back 401. Safe to call on any response; non-401s pass straight through.
 */
export function assertAdminUnlocked(res: Response): void {
  if (res.status !== 401) return;
  redirectToAdminUnlock();
  throw new AdminUnlockRequiredError();
}
