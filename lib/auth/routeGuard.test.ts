import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const authoriseRoute = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  STAFF_ROLES: ["admin", "host"],
  ADMIN_ROLES: ["admin"],
  authHelpers: () => ({ authoriseRoute }),
}));

const { allowedOrigins, requireStaff, requireStaffOrDisplayToken } = await import("@/lib/auth/routeGuard");
const { createSessionAccessToken } = await import("@/lib/live/access");

const ORIGIN = "https://musicbingo.example.com";

function refused(status: number, error: string): { ok: false; response: Response } {
  return { ok: false, response: new Response(JSON.stringify({ error }), { status }) };
}

beforeEach(() => {
  authoriseRoute.mockReset();
  vi.stubEnv("LIVE_LINK_SECRET", "a-live-link-secret-for-tests");
});
afterEach(() => vi.unstubAllEnvs());

describe("allowedOrigins", () => {
  test("is the request's own origin plus NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://musicbingo.orangejelly.co.uk/");
    expect(allowedOrigins(new Request("https://music-bingo.vercel.app/api/sessions"))).toEqual([
      "https://music-bingo.vercel.app",
      "https://musicbingo.orangejelly.co.uk",
    ]);
  });

  test("ignores a malformed NEXT_PUBLIC_APP_URL rather than throwing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    expect(allowedOrigins(new Request(`${ORIGIN}/api/sessions`))).toEqual([ORIGIN]);
  });
});

describe("requireStaff", () => {
  test("lets a signed-in host through and passes the staff roles to the kit", async () => {
    authoriseRoute.mockResolvedValue({ ok: true, user: { id: "u1" }, role: "host" });
    const gate = await requireStaff(new Request(`${ORIGIN}/api/sessions`));
    expect(gate).toEqual({ ok: true, via: "staff", userId: "u1", role: "host" });
    expect(authoriseRoute).toHaveBeenCalledWith(["admin", "host"]);
  });

  test("passes on the kit's 401 and 403 unchanged", async () => {
    authoriseRoute.mockResolvedValueOnce(refused(401, "unauthenticated"));
    const signedOut = await requireStaff(new Request(`${ORIGIN}/api/sessions`));
    expect(signedOut.ok ? 0 : signedOut.response.status).toBe(401);

    authoriseRoute.mockResolvedValueOnce(refused(403, "unauthorised"));
    const pending = await requireStaff(new Request(`${ORIGIN}/api/sessions`));
    expect(pending.ok ? 0 : pending.response.status).toBe(403);
  });

  test("a throw (missing auth settings, a client that cannot be built) is a 503, never a pass", async () => {
    authoriseRoute.mockRejectedValue(new Error("boom"));
    const gate = await requireStaff(new Request(`${ORIGIN}/api/sessions`));
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(503);
      expect(await gate.response.json()).toEqual({ error: "service_unavailable" });
    }
  });

  test("a cross-site state change is refused before the session is even read", async () => {
    authoriseRoute.mockResolvedValue({ ok: true, user: { id: "u1" }, role: "admin" });
    const gate = await requireStaff(
      new Request(`${ORIGIN}/api/sessions`, { method: "PUT", headers: { origin: "https://evil.example" } })
    );
    expect(gate.ok ? 0 : gate.response.status).toBe(403);
    expect(authoriseRoute).not.toHaveBeenCalled();
  });

  test("a same-origin state change passes; so does a configured production origin", async () => {
    authoriseRoute.mockResolvedValue({ ok: true, user: { id: "u1" }, role: "admin" });
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://musicbingo.orangejelly.co.uk");
    expect((await requireStaff(new Request(`${ORIGIN}/api/sessions`, { method: "PUT", headers: { origin: ORIGIN } }))).ok).toBe(true);
    expect(
      (await requireStaff(new Request(`${ORIGIN}/api/sessions`, { method: "DELETE", headers: { origin: "https://musicbingo.orangejelly.co.uk" } }))).ok
    ).toBe(true);
  });

  test("an admin-only check refuses a host through the kit", async () => {
    authoriseRoute.mockResolvedValue(refused(403, "unauthorised"));
    await requireStaff(new Request(`${ORIGIN}/admin`), ["admin"]);
    expect(authoriseRoute).toHaveBeenCalledWith(["admin"]);
  });
});

describe("requireStaffOrDisplayToken", () => {
  function displayCookie(sessionId: string): string {
    const hash = crypto.createHash("sha256").update(sessionId, "utf8").digest("base64url").slice(0, 24);
    return `music_bingo_access_display_${hash}=${createSessionAccessToken(sessionId, "display")}`;
  }

  test("the TV's own token cookie passes without a sign-in", async () => {
    const req = new NextRequest(`${ORIGIN}/api/display/s1/snapshot`, { headers: { cookie: displayCookie("s1") } });
    expect(await requireStaffOrDisplayToken(req, "s1")).toEqual({ ok: true, via: "display-token" });
    expect(authoriseRoute).not.toHaveBeenCalled();
  });

  test("another game's TV token does not, and falls back to sign-in", async () => {
    authoriseRoute.mockResolvedValue(refused(401, "unauthenticated"));
    const req = new NextRequest(`${ORIGIN}/api/display/s2/snapshot`, { headers: { cookie: displayCookie("s1") } });
    const gate = await requireStaffOrDisplayToken(req, "s2");
    expect(gate.ok ? 0 : gate.response.status).toBe(401);
  });

  test("a host link token is not a TV token", async () => {
    authoriseRoute.mockResolvedValue(refused(401, "unauthenticated"));
    const hash = crypto.createHash("sha256").update("s1", "utf8").digest("base64url").slice(0, 24);
    const req = new NextRequest(`${ORIGIN}/api/display/s1/snapshot`, {
      headers: { cookie: `music_bingo_access_display_${hash}=${createSessionAccessToken("s1", "host")}` },
    });
    expect((await requireStaffOrDisplayToken(req, "s1")).ok).toBe(false);
  });
});
