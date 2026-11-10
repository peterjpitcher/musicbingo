import { safeNextPath } from "@anchor-nights/kit/auth/shared";

const SIGN_IN_PATH = "/login";
const PENDING_PATH = "/pending";

export const SIGN_IN_MESSAGE = "Your sign-in has ended. Taking you to the sign-in page...";

/**
 * Thrown when a staff-only API route answers 401 (signed out) or 403 (the
 * account has no access now). Callers must let this propagate instead of
 * falling back to cached data: the browser is already on its way to sign in,
 * and stale local data would hide the real reason.
 */
export class SignInRequiredError extends Error {
  constructor() {
    super(SIGN_IN_MESSAGE);
    this.name = "SignInRequiredError";
  }
}

/**
 * Sends the browser to sign in, carrying the current path so the host lands
 * back where they were. The path goes through the kit's shared validator, the
 * same one the server applies after sign-in.
 */
export function redirectToSignIn(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === SIGN_IN_PATH) return;
  const next = safeNextPath(`${pathname}${search}`, "");
  window.location.assign(next ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH);
}

/**
 * Bounce to sign-in (401) or to the waiting screen (403, a pending or
 * deactivated account) and abort the caller. Safe to call on any response;
 * everything else passes straight through.
 */
export function assertSignedIn(res: Response): void {
  if (res.status === 401) {
    redirectToSignIn();
    throw new SignInRequiredError();
  }
  if (res.status === 403) {
    if (typeof window !== "undefined" && window.location.pathname !== PENDING_PATH) {
      window.location.assign(PENDING_PATH);
    }
    throw new SignInRequiredError();
  }
}
