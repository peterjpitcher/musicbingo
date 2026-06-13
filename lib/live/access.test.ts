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
});
