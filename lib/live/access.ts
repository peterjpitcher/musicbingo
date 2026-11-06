import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * The private host and TV links (signed tokens). Staff access is no longer
 * here: every game route now asks for a signed-in host or admin through
 * lib/auth/routeGuard.ts, and only the TV's own routes still accept a TV
 * token on its own. Expiry and revocation for these links are spec M-9.
 *
 * The signing key is LIVE_LINK_SECRET and nothing else: there is no fallback
 * to the service-role key or to a fixed string. Without it no link can be
 * made (an error the caller reports) and no token verifies (fails closed).
 * Setting LIVE_LINK_SECRET to the value APP_ADMIN_SECRET had keeps every link
 * already handed out working, because those were signed with that value.
 */

export type SessionAccessRole = "host" | "display";

const TOKEN_VERSION = "v1";
const ACCESS_COOKIE_PREFIX = "music_bingo_access";

/** The shortest LIVE_LINK_SECRET accepted, here and in lib/buildEnv.mjs. */
export const LIVE_LINK_SECRET_MIN_LENGTH = 16;

export class LiveLinkSecretMissingError extends Error {
  constructor() {
    super(
      `LIVE_LINK_SECRET is not set (or is shorter than ${LIVE_LINK_SECRET_MIN_LENGTH} characters), so private host and TV links cannot be made or checked.`
    );
    this.name = "LiveLinkSecretMissingError";
  }
}

function linkSecret(): string {
  const value = process.env.LIVE_LINK_SECRET?.trim() ?? "";
  if (value.length < LIVE_LINK_SECRET_MIN_LENGTH) throw new LiveLinkSecretMissingError();
  return value;
}

function digest(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}

function sign(input: string): string {
  return crypto.createHmac("sha256", linkSecret()).update(input, "utf8").digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.timingSafeEqual(left, right);
}

function roleCookieName(sessionId: string, role: SessionAccessRole): string {
  return `${ACCESS_COOKIE_PREFIX}_${role}_${digest(sessionId).slice(0, 24)}`;
}

/** Throws LiveLinkSecretMissingError when LIVE_LINK_SECRET is not set. */
export function createSessionAccessToken(sessionId: string, role: SessionAccessRole): string {
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `${TOKEN_VERSION}.${role}.${sessionId}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/** False for anything that is not a valid token for this session and role, including when LIVE_LINK_SECRET is not set. */
export function verifySessionAccessToken(params: {
  sessionId: string;
  role: SessionAccessRole;
  token: string | null | undefined;
}): boolean {
  const token = params.token?.trim();
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 5) return false;

  const [version, role, sessionId, nonce, signature] = parts;
  if (version !== TOKEN_VERSION || role !== params.role || sessionId !== params.sessionId || !nonce || !signature) {
    return false;
  }

  let expected: string;
  try {
    expected = sign(`${version}.${role}.${sessionId}.${nonce}`);
  } catch {
    return false;
  }
  return safeEqual(signature, expected);
}

export function setSessionAccessCookie(
  response: NextResponse,
  sessionId: string,
  role: SessionAccessRole,
  token: string
): void {
  response.cookies.set(roleCookieName(sessionId, role), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

/**
 * True when the request carries a valid link token for this session and role,
 * from the role cookie the link set or from `tokenOverride`. Only the TV's own
 * routes accept this on its own (a display token); everything else needs a
 * signed-in host or admin.
 */
export function hasSessionTokenAccess(
  request: NextRequest,
  sessionId: string,
  role: SessionAccessRole,
  tokenOverride?: string | null
): boolean {
  const token = tokenOverride ?? request.cookies.get(roleCookieName(sessionId, role))?.value;
  return verifySessionAccessToken({ sessionId, role, token });
}

/** Throws LiveLinkSecretMissingError when LIVE_LINK_SECRET is not set. */
export function buildSessionAccessLinks(origin: string, sessionId: string): {
  hostUrl: string;
  displayUrl: string;
} {
  const hostToken = createSessionAccessToken(sessionId, "host");
  const displayToken = createSessionAccessToken(sessionId, "display");
  return {
    hostUrl: `${origin}/api/sessions/${encodeURIComponent(sessionId)}/authorize?role=host&token=${encodeURIComponent(hostToken)}`,
    displayUrl: `${origin}/api/display/${encodeURIComponent(sessionId)}/authorize?token=${encodeURIComponent(displayToken)}`,
  };
}
