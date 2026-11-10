import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { RouteGate } from "@/lib/auth/routeGuard";
import { createSessionAccessToken } from "@/lib/live/access";
import { authoriseDisplay, type DisplayAccessDeps } from "@/lib/live/displayAccess";
import type { SessionRecord } from "@/lib/live/sessionRepo";
import { makeEmptyRuntimeState, type LiveSessionV1 } from "@/lib/live/types";

/** Who may read a game's TV snapshot (spec M-9). */

const SECRET = "a-live-link-secret-for-tests";
const NOW = new Date("2026-11-07T19:30:00Z");

afterEach(() => {
  vi.unstubAllEnvs();
});

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session: { id: "game-1" } as LiveSessionV1,
    eventDate: "2026-11-07",
    runtime: makeEmptyRuntimeState("game-1"),
    runtimeVersion: 4,
    linkGeneration: 2,
    ...overrides,
  };
}

const refused: RouteGate = { ok: false, response: new Response(JSON.stringify({ error: "Sign in" }), { status: 401 }) };
const staff: RouteGate = { ok: true, via: "staff", userId: "u1", role: "host" };

function deps(overrides: Partial<DisplayAccessDeps> = {}): DisplayAccessDeps & {
  loadRecord: ReturnType<typeof vi.fn>;
  requirePairedTv: ReturnType<typeof vi.fn>;
  requireStaff: ReturnType<typeof vi.fn>;
} {
  return {
    loadRecord: vi.fn(async () => record()),
    requirePairedTv: vi.fn(async () => null),
    requireStaff: vi.fn(async () => refused),
    now: () => NOW,
    ...overrides,
  } as never;
}

/** A snapshot request carrying the cookie a TV link set (or a device cookie). */
async function requestWith(cookies: Record<string, string>): Promise<NextRequest> {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest("https://musicbingo.example.com/api/display/game-1/snapshot", { headers: cookie ? { cookie } : {} });
}

async function linkCookie(generation: number): Promise<Record<string, string>> {
  const { NextResponse } = await import("next/server");
  const { readSessionAccessToken, setSessionAccessCookie } = await import("@/lib/live/access");
  const token = createSessionAccessToken("game-1", "display", { generation });
  const claims = readSessionAccessToken({ sessionId: "game-1", role: "display", token });
  const response = NextResponse.json({});
  setSessionAccessCookie(response, claims!, token);
  const set = response.cookies.getAll()[0];
  return { [set.name]: set.value };
}

describe("authoriseDisplay", () => {
  test("a TV link of the game's current generation opens it", async () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const d = deps();
    const gate = await authoriseDisplay(await requestWith(await linkCookie(2)), "game-1", d);
    expect(gate).toMatchObject({ ok: true, via: "display-token" });
    expect(d.requireStaff).not.toHaveBeenCalled();
  });

  test("a cancelled link (older generation) is refused as cancelled", async () => {
    vi.stubEnv("LIVE_LINK_SECRET", SECRET);
    const gate = await authoriseDisplay(await requestWith(await linkCookie(1)), "game-1", deps());
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      expect(await gate.response.json()).toEqual({ error: "link_cancelled" });
    }
  });

  test("a paired TV reads tonight's game", async () => {
    const d = deps({ requirePairedTv: vi.fn(async () => ({ id: "tv-1", name: "Bar", createdAt: "", lastSeenAt: null })) });
    const gate = await authoriseDisplay(await requestWith({ "anchor-tv": "a".repeat(43) }), "game-1", d);
    expect(gate).toMatchObject({ ok: true, via: "paired-tv" });
  });

  test("a paired TV cannot be pointed at another night's game", async () => {
    const d = deps({
      loadRecord: vi.fn(async () => record({ eventDate: "2026-11-01" })),
      requirePairedTv: vi.fn(async () => ({ id: "tv-1", name: "Bar", createdAt: "", lastSeenAt: null })),
    });
    const gate = await authoriseDisplay(await requestWith({ "anchor-tv": "a".repeat(43) }), "game-1", d);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  test("a signed-in host may open any game; a missing game is 404", async () => {
    const d = deps({ requireStaff: vi.fn(async () => staff) });
    expect(await authoriseDisplay(await requestWith({}), "game-1", d)).toMatchObject({ ok: true, via: "staff" });
    const gone = deps({ requireStaff: vi.fn(async () => staff), loadRecord: vi.fn(async () => null) });
    const gate = await authoriseDisplay(await requestWith({}), "game-1", gone);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(404);
  });

  test("anyone else is refused before the game is read, so they learn nothing", async () => {
    const d = deps();
    const gate = await authoriseDisplay(await requestWith({}), "game-1", d);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
    expect(d.loadRecord).not.toHaveBeenCalled();
    expect(d.requirePairedTv).not.toHaveBeenCalled();
  });
});
