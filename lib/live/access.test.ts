import { describe, expect, test, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  createSessionAccessToken,
  hasSessionAccess,
  verifySessionAccessToken,
} from "@/lib/live/access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session access tokens", () => {
  test("validates signed host and display tokens for the matching session", () => {
    vi.stubEnv("APP_ADMIN_SECRET", "test-secret");
    const hostToken = createSessionAccessToken("session-1", "host");
    const displayToken = createSessionAccessToken("session-1", "display");

    expect(verifySessionAccessToken({ sessionId: "session-1", role: "host", token: hostToken })).toBe(true);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: displayToken })).toBe(true);
    expect(verifySessionAccessToken({ sessionId: "session-2", role: "host", token: hostToken })).toBe(false);
    expect(verifySessionAccessToken({ sessionId: "session-1", role: "display", token: hostToken })).toBe(false);
  });

  test("allows local development when admin protection is not configured", () => {
    vi.stubEnv("APP_ADMIN_SECRET", "");
    const req = new NextRequest("http://localhost/api/sessions/session-1/runtime");

    expect(hasSessionAccess(req, "session-1", "host")).toBe(true);
  });

  test("fails closed in production when APP_ADMIN_SECRET is missing", () => {
    vi.stubEnv("APP_ADMIN_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new NextRequest("https://example.com/api/sessions/session-1/runtime");

    // No admin bypass and no cookie/token: access is denied, not open.
    expect(hasSessionAccess(req, "session-1", "host")).toBe(false);

    errorSpy.mockRestore();
  });

  test("signed tokens still work in production without the admin secret", () => {
    vi.stubEnv("APP_ADMIN_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const token = createSessionAccessToken("session-1", "display");
    const req = new NextRequest("https://example.com/api/display/session-1/snapshot");
    expect(hasSessionAccess(req, "session-1", "display", token)).toBe(true);

    errorSpy.mockRestore();
  });
});
