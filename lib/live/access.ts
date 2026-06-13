import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export type SessionAccessRole = "host" | "display";

const TOKEN_VERSION = "v1";
const ADMIN_COOKIE = "music_bingo_admin";
const ACCESS_COOKIE_PREFIX = "music_bingo_access";

function configuredSecret(): string | null {
  return process.env.APP_ADMIN_SECRET?.trim() || null;
}

function tokenSecret(): string {
  return (
    configuredSecret()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "music-bingo-local-dev-secret"
  );
}

export function isAdminProtectionEnabled(): boolean {
  return Boolean(configuredSecret());
}

function digest(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}

function sign(input: string): string {
  return crypto
    .createHmac("sha256", tokenSecret())
    .update(input, "utf8")
    .digest("base64url");
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

export function createSessionAccessToken(
  sessionId: string,
  role: SessionAccessRole
): string {
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `${TOKEN_VERSION}.${role}.${sessionId}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

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

  return safeEqual(signature, sign(`${version}.${role}.${sessionId}.${nonce}`));
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

export function hasSessionAccess(
  request: NextRequest,
  sessionId: string,
  role: SessionAccessRole,
  tokenOverride?: string | null
): boolean {
  if (!isAdminProtectionEnabled()) return true;
  if (hasAdminAccess(request)) return true;
  const token = tokenOverride ?? request.cookies.get(roleCookieName(sessionId, role))?.value;
  return verifySessionAccessToken({ sessionId, role, token });
}

export function hasAnySessionAccess(
  request: NextRequest,
  sessionId: string,
  roles: SessionAccessRole[],
  tokenOverride?: string | null
): boolean {
  return roles.some((role) => hasSessionAccess(request, sessionId, role, tokenOverride));
}

export function createAdminCookieValue(): string {
  return sign("admin");
}

export function hasAdminAccess(request: NextRequest): boolean {
  if (!isAdminProtectionEnabled()) return true;
  const value = request.cookies.get(ADMIN_COOKIE)?.value;
  return Boolean(value && safeEqual(value, createAdminCookieValue()));
}

export function setAdminCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, createAdminCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

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
