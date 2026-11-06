import crypto from "node:crypto";
import { describe, expect, test, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  LiveLinkSecretMissingError,
  buildSessionAccessLinks,
  createSessionAccessToken,
  hasSessionTokenAccess,
  verifySessionAccessToken,
} from "@/lib/live/access";

const SECRET = "a-live-link-secret-for-tests";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session access tokens", () => {
  test("validates signed host and display tokens for the matching session", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const hostToken = createSessionAccessToken("session-1", "host");
    const displayToken = createSessionAccessToken("session-1", "display");

    expect(verifySessionAccessToken({ sessionId: "session-1", role: "host", token: hostToken })).toBe(true);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: displayToken })).toBe(true);
    expect(verifySessionAccessToken({ sessionId: "session-2", role: "host", token: hostToken })).toBe(false);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: hostToken })).toBe(false);
  });

  test("a token signed with another secret is refused", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display");
    vi.stubEnv("LIVE_LINK_SECRET", "a-different-secret-entirely");
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token })).toBe(false);
  });

  test("links handed out under APP_ADMIN_SECRET keep working when LIVE_LINK_SECRET takes the same value", () => {
    const oldAdminSecret = "the old admin secret";
    // Exactly how lib/live/access.ts signed links before M-8 (HMAC-SHA256 with APP_ADMIN_SECRET).
    const payload = "v1.display.session-1.bm9uY2Utbm9uY2Utbm9uY2U";
    const oldToken = `${payload}.${crypto.createHmac("sha256", oldAdminSecret).update(payload, "utf8").digest("base64url")}`;
    vi.stubEnv("LIVE_LINK_SECRET", oldAdminSecret);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: oldToken })).toBe(true);
  });
});

describe("fails closed without LIVE_LINK_SECRET", () => {
  test("no fallback to the service-role key or a fixed string: no token verifies", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display");
    vi.stubEnv("LIVE_LINK_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("APP_ADMIN_SECRET", SECRET);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token })).toBe(false);
    const forged = (key: string): string => {
      const payload = "v1.display.session-1.bm9uY2U";
      return `${payload}.${crypto.createHmac("sha256", key).update(payload, "utf8").digest("base64url")}`;
    };
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: forged("service-key") })).toBe(false);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: forged("music-bingo-local-dev-secret") })).toBe(false);
  });

  test("no link can be made, and the error says why", () => {
    vi.stubEnv("LIVE_LINK_SECRET", "");
    expect(() => createSessionAccessToken("session-1", "host")).toThrow(LiveLinkSecretMissingError);
    expect(() => buildSessionAccessLinks("https://musicbingo.example.com", "session-1")).toThrow(/LIVE_LINK_SECRET/);
  });

  test("a secret shorter than 16 characters counts as missing", () => {
    vi.stubEnv("LIVE_LINK_SECRET", "short");
    expect(() => createSessionAccessToken("session-1", "host")).toThrow(LiveLinkSecretMissingError);
  });
});

describe("hasSessionTokenAccess", () => {
  test("accepts the display token from the cookie its link set", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const token = createSessionAccessToken("session-1", "display");
    const { displayUrl } = buildSessionAccessLinks("https://musicbingo.example.com", "session-1");
    expect(displayUrl).toContain("/api/display/session-1/authorize?token=");

    const cookieName = `music_bingo_access_display_${crypto.createHash("sha256").update("session-1", "utf8").digest("base64url").slice(0, 24)}`;
    const req = new NextRequest("https://musicbingo.example.com/api/display/session-1/snapshot", {
      headers: { cookie: `${cookieName}=${token}` },
    });
    expect(hasSessionTokenAccess(req, "session-1", "display")).toBe(true);
    expect(hasSessionTokenAccess(req, "session-2", "display")).toBe(false);
  });

  test("refuses a request with no token: there is no admin bypass any more", () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const req = new NextRequest("https://musicbingo.example.com/api/display/session-1/snapshot", {
      headers: { cookie: "music_bingo_admin=anything" },
    });
    expect(hasSessionTokenAccess(req, "session-1", "display")).toBe(false);
    expect(hasSessionTokenAccess(req, "session-1", "host")).toBe(false);
  });
});
