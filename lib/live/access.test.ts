import crypto from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import {
  LIVE_LINK_TTL_MS,
  LiveLinkSecretMissingError,
  buildSessionAccessLinks,
  createSessionAccessToken,
  readRequestLinkClaims,
  readSessionAccessToken,
  setSessionAccessCookie,
  verifySessionAccessToken,
} from "@/lib/live/access";

const SECRET = "a-live-link-secret-for-tests";
const NOW = Date.parse("2026-11-07T19:00:00Z");

afterEach(() => {
  vi.unstubAllEnvs();
});

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

describe("signed host and TV links (spec M-9)", () => {
  test("a fresh token of the current generation verifies for its own game and role only", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const host = createSessionAccessToken("session-1", "host", { generation: 1, nowMs: NOW });
    const display = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: NOW });

    expect(verifySessionAccessToken({ sessionId: "session-1", role: "host", token: host, generation: 1, nowMs: NOW })).toBe(true);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: display, generation: 1, nowMs: NOW })).toBe(true);
    expect(verifySessionAccessToken({ sessionId: "session-2", role: "host", token: host, generation: 1, nowMs: NOW })).toBe(false);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: host, generation: 1, nowMs: NOW })).toBe(false);
  });

  test("an expired link is refused: it works for 24 hours and not a second more", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: NOW });
    const params = { sessionId: "session-1", role: "display" as const, token, generation: 1 };

    expect(verifySessionAccessToken({ ...params, nowMs: NOW + LIVE_LINK_TTL_MS - 1_000 })).toBe(true);
    expect(verifySessionAccessToken({ ...params, nowMs: NOW + LIVE_LINK_TTL_MS })).toBe(false);
    expect(verifySessionAccessToken({ ...params, nowMs: NOW + 2 * LIVE_LINK_TTL_MS })).toBe(false);
  });

  test("a revoked link (an older generation) is refused, and a new link works", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const old = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: NOW });
    // "Cancel links" moved the game to generation 2.
    expect(readSessionAccessToken({ sessionId: "session-1", role: "display", token: old, nowMs: NOW })?.generation).toBe(1);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: old, generation: 2, nowMs: NOW })).toBe(false);

    const fresh = createSessionAccessToken("session-1", "display", { generation: 2, nowMs: NOW });
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: fresh, generation: 2, nowMs: NOW })).toBe(true);
  });

  test("editing the expiry or the generation breaks the signature", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: NOW });
    const parts = token.split(".");
    const laterExpiry = [...parts.slice(0, 4), String(Number(parts[4]) + 86_400), ...parts.slice(5)].join(".");
    const newerGeneration = [...parts.slice(0, 3), "2", ...parts.slice(4)].join(".");
    expect(readSessionAccessToken({ sessionId: "session-1", role: "display", token: laterExpiry, nowMs: NOW })).toBeNull();
    expect(readSessionAccessToken({ sessionId: "session-1", role: "display", token: newerGeneration, nowMs: NOW })).toBeNull();
  });

  test("a token signed with another secret is refused", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: NOW });
    vi.stubEnv("LIVE_LINK_SECRET", "a-different-secret-entirely");
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token, generation: 1, nowMs: NOW })).toBe(false);
  });

  test("version 1 links (no expiry, no generation) are refused, even with the right secret", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    // Exactly how links were signed before M-9.
    const payload = "v1.display.session-1.bm9uY2Utbm9uY2Utbm9uY2U";
    const v1 = `${payload}.${crypto.createHmac("sha256", SECRET).update(payload, "utf8").digest("base64url")}`;
    expect(readSessionAccessToken({ sessionId: "session-1", role: "display", token: v1, nowMs: NOW })).toBeNull();
  });
});

describe("fails closed without LIVE_LINK_SECRET", () => {
  test("no fallback to APP_ADMIN_SECRET, the service-role key or a fixed string: no token verifies", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: NOW });
    vi.stubEnv("LIVE_LINK_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key-service-key");
    vi.stubEnv("APP_ADMIN_SECRET", SECRET);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token, generation: 1, nowMs: NOW })).toBe(false);

    const forged = (key: string): string => {
      const payload = `v2.display.session-1.1.${Math.floor(NOW / 1000) + 3600}.bm9uY2U`;
      return `${payload}.${crypto.createHmac("sha256", key).update(payload, "utf8").digest("base64url")}`;
    };
    for (const key of ["service-key-service-key", SECRET, "music-bingo-local-dev-secret"]) {
      expect(readSessionAccessToken({ sessionId: "session-1", role: "display", token: forged(key), nowMs: NOW })).toBeNull();
    }
  });

  test("no link can be made, and the error says why", () => {
    vi.stubEnv("LIVE_LINK_SECRET", "");
    vi.stubEnv("APP_ADMIN_SECRET", SECRET);
    expect(() => createSessionAccessToken("session-1", "host", { generation: 1 })).toThrow(LiveLinkSecretMissingError);
    expect(() => buildSessionAccessLinks("https://musicbingo.example.com", "session-1", 1)).toThrow(/LIVE_LINK_SECRET/);
  });

  test("a secret shorter than 16 characters counts as missing", () => {
    vi.stubEnv("LIVE_LINK_SECRET", "short");
    expect(() => createSessionAccessToken("session-1", "host", { generation: 1 })).toThrow(LiveLinkSecretMissingError);
  });
});

describe("the links and the cookie they set", () => {
  test("links carry the generation and say when they expire", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const links = buildSessionAccessLinks("https://musicbingo.example.com", "session-1", 3, NOW);
    expect(links.expiresAt).toBe("2026-11-08T19:00:00.000Z");
    expect(links.displayUrl.startsWith("https://musicbingo.example.com/api/display/session-1/authorize?token=")).toBe(true);
    expect(links.hostUrl).toContain("/api/sessions/session-1/authorize?role=host&token=");

    const claims = readSessionAccessToken({ sessionId: "session-1", role: "display", token: tokenFromUrl(links.displayUrl), nowMs: NOW });
    expect(claims).toEqual({ role: "display", sessionId: "session-1", generation: 3, expiresAtMs: NOW + LIVE_LINK_TTL_MS });
  });

  test("the cookie expires with the token, and the request reads it back", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    // The request check reads the real clock, so this token is made now.
    const now = Date.now();
    const token = createSessionAccessToken("session-1", "display", { generation: 1, nowMs: now });
    const claims = readSessionAccessToken({ sessionId: "session-1", role: "display", token, nowMs: now });
    expect(claims).not.toBeNull();

    const response = NextResponse.json({ ok: true });
    setSessionAccessCookie(response, claims!, token, claims!.expiresAtMs - 23 * 60 * 60 * 1000);
    const cookie = response.cookies.getAll()[0];
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.maxAge).toBe(23 * 60 * 60);

    const request = new NextRequest("https://musicbingo.example.com/api/display/session-1/snapshot", {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    expect(readRequestLinkClaims(request, "session-1", "display")?.generation).toBe(1);
    expect(readRequestLinkClaims(request, "session-2", "display")).toBeNull();
    expect(readRequestLinkClaims(request, "session-1", "host")).toBeNull();
  });
});
