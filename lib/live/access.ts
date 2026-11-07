import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * The private host and TV links (signed tokens), spec M-9. Staff access is
 * not here: every game route asks for a signed-in host or admin through
 * lib/auth/routeGuard.ts, and only the TV's own routes accept a TV token.
 * A paired TV (/tv) needs no link at all; these links are the fallback.
 *
 * A token is `v2.<role>.<sessionId>.<generation>.<expiresAt>.<nonce>.<sig>`:
 *   - signed with LIVE_LINK_SECRET and nothing else. There is no fallback to
 *     the service-role key, APP_ADMIN_SECRET or a fixed string. Without it
 *     no link can be made (an error the caller reports) and no token
 *     verifies (fails closed);
 *   - it expires LIVE_LINK_TTL_MS after it was made, and the cookie it sets
 *     expires with it;
 *   - it carries the game's link generation (live_sessions.link_generation).
 *     "Cancel links" on the console adds one, so every older link is refused
 *     at its next request, cookie included.
 * Version 1 tokens (no expiry, no generation) are refused.
 */

export type SessionAccessRole = "host" | "display";

const TOKEN_VERSION = "v2";
const ACCESS_COOKIE_PREFIX = "music_bingo_access";

/** The shortest LIVE_LINK_SECRET accepted, here and in lib/buildEnv.mjs. */
export const LIVE_LINK_SECRET_MIN_LENGTH = 16;

/** How long a host or TV link works after it is made: a day covers the night it was made for. */
export const LIVE_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export class LiveLinkSecretMissingError extends Error {
  constructor() {
    super(
      `LIVE_LINK_SECRET is not set (or is shorter than ${LIVE_LINK_SECRET_MIN_LENGTH} characters), so private host and TV links cannot be made or checked.`
    );
    this.name = "LiveLinkSecretMissingError";
  }
}

/** What a valid token says. The generation still has to match the game's. */
export interface LinkClaims {
  role: SessionAccessRole;
  sessionId: string;
  generation: number;
  expiresAtMs: number;
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

function isGeneration(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/** Throws LiveLinkSecretMissingError when LIVE_LINK_SECRET is not set. */
export function createSessionAccessToken(
  sessionId: string,
  role: SessionAccessRole,
  options: { generation: number; nowMs?: number }
): string {
  if (!isGeneration(options.generation)) throw new Error("A link generation is a whole number from 1.");
  const expiresAtSeconds = Math.floor(((options.nowMs ?? Date.now()) + LIVE_LINK_TTL_MS) / 1000);
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `${TOKEN_VERSION}.${role}.${sessionId}.${options.generation}.${expiresAtSeconds}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * The claims of a token for this session and role whose signature is good
 * and which has not expired, or null (including when LIVE_LINK_SECRET is not
 * set). The caller still compares the generation with the game's.
 */
export function readSessionAccessToken(params: {
  sessionId: string;
  role: SessionAccessRole;
  token: string | null | undefined;
  nowMs?: number;
}): LinkClaims | null {
  const token = params.token?.trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 7) return null;

  const [version, role, sessionId, generationRaw, expiresRaw, nonce, signature] = parts;
  if (version !== TOKEN_VERSION || role !== params.role || sessionId !== params.sessionId || !nonce || !signature) {
    return null;
  }
  if (!/^[0-9]{1,9}$/.test(generationRaw) || !/^[0-9]{1,12}$/.test(expiresRaw)) return null;

  let expected: string;
  try {
    expected = sign(`${version}.${role}.${sessionId}.${generationRaw}.${expiresRaw}.${nonce}`);
  } catch {
    return null;
  }
  if (!safeEqual(signature, expected)) return null;

  const generation = Number(generationRaw);
  const expiresAtMs = Number(expiresRaw) * 1000;
  if (!isGeneration(generation)) return null;
  if (expiresAtMs <= (params.nowMs ?? Date.now())) return null;
  return { role: params.role, sessionId, generation, expiresAtMs };
}

/** True only for a good, unexpired token whose generation is the game's current one. */
export function verifySessionAccessToken(params: {
  sessionId: string;
  role: SessionAccessRole;
  token: string | null | undefined;
  generation: number;
  nowMs?: number;
}): boolean {
  const claims = readSessionAccessToken(params);
  return claims !== null && claims.generation === params.generation;
}

/** Sets the per-game cookie a link carries, expiring with the token. */
export function setSessionAccessCookie(
  response: NextResponse,
  claims: LinkClaims,
  token: string,
  nowMs = Date.now()
): void {
  response.cookies.set(roleCookieName(claims.sessionId, claims.role), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(1, Math.floor((claims.expiresAtMs - nowMs) / 1000)),
  });
}

/**
 * The claims of the link token this request carries for the game and role,
 * from the cookie the link set or from `tokenOverride`, or null. Signature
 * and expiry only: the caller compares the generation with the game's.
 */
export function readRequestLinkClaims(
  request: NextRequest,
  sessionId: string,
  role: SessionAccessRole,
  tokenOverride?: string | null
): LinkClaims | null {
  const token = tokenOverride ?? request.cookies.get(roleCookieName(sessionId, role))?.value;
  return readSessionAccessToken({ sessionId, role, token });
}

/** Throws LiveLinkSecretMissingError when LIVE_LINK_SECRET is not set. */
export function buildSessionAccessLinks(
  origin: string,
  sessionId: string,
  generation: number,
  nowMs = Date.now()
): { hostUrl: string; displayUrl: string; expiresAt: string } {
  const hostToken = createSessionAccessToken(sessionId, "host", { generation, nowMs });
  const displayToken = createSessionAccessToken(sessionId, "display", { generation, nowMs });
  return {
    hostUrl: `${origin}/api/sessions/${encodeURIComponent(sessionId)}/authorize?role=host&token=${encodeURIComponent(hostToken)}`,
    displayUrl: `${origin}/api/display/${encodeURIComponent(sessionId)}/authorize?token=${encodeURIComponent(displayToken)}`,
    expiresAt: new Date(Math.floor((nowMs + LIVE_LINK_TTL_MS) / 1000) * 1000).toISOString(),
  };
}
