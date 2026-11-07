import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEmptyRuntimeState } from "@/lib/live/types";

/**
 * The live write routes (spec M-9): only a save that landed is ok; a missing
 * game is 404, another console's lock or a stale version is 409, and none
 * of them writes anything without the console's device id. The database
 * functions behind them are proved in supabase/tests/live-checks.sh.
 */

const saveLiveRuntime = vi.fn();
const controlSession = vi.fn();
const revokeSessionLinks = vi.fn();
const getRuntimeWithVersion = vi.fn();

// The staff gate itself is proved in lib/auth/routeRegistry.test.ts.
vi.mock("@/lib/auth/routeGuard", () => ({
  requireStaff: vi.fn(async () => ({ ok: true, via: "staff", userId: "user-1", role: "host" })),
}));
vi.mock("@/lib/live/sessionRepo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/live/sessionRepo")>("@/lib/live/sessionRepo");
  return {
    SessionNotFoundError: actual.SessionNotFoundError,
    saveLiveRuntime,
    controlSession,
    revokeSessionLinks,
    getRuntimeWithVersion,
    getSessionRecord: vi.fn(),
  };
});
vi.mock("@/lib/reportError", () => ({ reportError: vi.fn(async () => undefined) }));

const commands = await import("./[id]/commands/route");
const runtimeRoute = await import("./[id]/runtime/route");
const control = await import("./[id]/control/route");
const links = await import("./[id]/links/route");
const { SessionNotFoundError } = await import("@/lib/live/sessionRepo");

const DEVICE = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ctx = { params: Promise.resolve({ id: "game-1" }) };

function request(method: string, path: string, body?: unknown, device: string | null = DEVICE): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (device) headers["x-host-device"] = device;
  return new NextRequest(`http://127.0.0.1/api/sessions/game-1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function command(expectedVersion = 3) {
  return {
    type: "runtime_snapshot",
    clientEventId: "runtime-1",
    payload: { mode: "running" },
    runtime: { ...makeEmptyRuntimeState("game-1"), mode: "running" },
    expectedVersion,
  };
}

beforeEach(() => {
  saveLiveRuntime.mockReset();
  controlSession.mockReset();
  revokeSessionLinks.mockReset();
  getRuntimeWithVersion.mockReset();
});

describe("POST /api/sessions/[id]/commands", () => {
  test("a landed save answers ok with the new version, saving the event with it", async () => {
    saveLiveRuntime.mockResolvedValue({ ok: true, version: 4 });
    const res = await commands.POST(request("POST", "commands", command(3)), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 4 });
    expect(saveLiveRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "game-1",
        deviceId: DEVICE,
        userId: "user-1",
        expectedVersion: 3,
        event: expect.objectContaining({ type: "runtime_snapshot", clientEventId: "runtime-1" }),
      })
    );
  });

  test("a missing game is a 404, never ok", async () => {
    saveLiveRuntime.mockResolvedValue({ ok: false, reason: "missing", version: null, secondsSinceSeen: null });
    const res = await commands.POST(request("POST", "commands", command()), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: "missing" });
  });

  test("a second device without the lock is refused with 409 not_controller", async () => {
    saveLiveRuntime.mockResolvedValue({ ok: false, reason: "not_controller", version: 3, secondsSinceSeen: 4 });
    const res = await commands.POST(request("POST", "commands", command()), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: "not_controller", secondsSinceSeen: 4 });
  });

  test("a stale version is refused with 409 conflict and the current version", async () => {
    saveLiveRuntime.mockResolvedValue({ ok: false, reason: "conflict", version: 9, secondsSinceSeen: null });
    const res = await commands.POST(request("POST", "commands", command(2)), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: "conflict", version: 9 });
  });

  test("no device id, no expected version or no runtime: refused before any write", async () => {
    expect((await commands.POST(request("POST", "commands", command(), null), ctx)).status).toBe(400);
    const { expectedVersion: _drop, ...noVersion } = command();
    void _drop;
    expect((await commands.POST(request("POST", "commands", noVersion), ctx)).status).toBe(400);
    const { runtime: _runtime, ...noRuntime } = command();
    void _runtime;
    expect((await commands.POST(request("POST", "commands", noRuntime), ctx)).status).toBe(400);
    expect(saveLiveRuntime).not.toHaveBeenCalled();
  });

  test("a database failure is a 500, never ok", async () => {
    saveLiveRuntime.mockRejectedValue(new Error("connection refused"));
    expect((await commands.POST(request("POST", "commands", command()), ctx)).status).toBe(500);
  });
});

describe("/api/sessions/[id]/runtime", () => {
  test("GET answers the runtime with its version, and 404 for a missing game", async () => {
    getRuntimeWithVersion.mockResolvedValueOnce({ runtime: null, version: 0 });
    const res = await runtimeRoute.GET(request("GET", "runtime"), ctx);
    expect(await res.json()).toEqual({ runtime: null, version: 0 });
    getRuntimeWithVersion.mockResolvedValueOnce(null);
    expect((await runtimeRoute.GET(request("GET", "runtime"), ctx)).status).toBe(404);
  });

  test("PUT is held to the lock and the version as well", async () => {
    saveLiveRuntime.mockResolvedValue({ ok: false, reason: "conflict", version: 5, secondsSinceSeen: null });
    const body = { runtime: makeEmptyRuntimeState("game-1"), expectedVersion: 1 };
    expect((await runtimeRoute.PUT(request("PUT", "runtime", body), ctx)).status).toBe(409);
    expect((await runtimeRoute.PUT(request("PUT", "runtime", body, null), ctx)).status).toBe(400);
  });
});

describe("/api/sessions/[id]/control", () => {
  test("take, heartbeat and release go to the lock with the device id", async () => {
    controlSession.mockResolvedValue({ ok: true, version: 2 });
    expect((await control.POST(request("POST", "control"), ctx)).status).toBe(200);
    expect((await control.PUT(request("PUT", "control"), ctx)).status).toBe(200);
    expect((await control.DELETE(request("DELETE", "control"), ctx)).status).toBe(200);
    expect(controlSession.mock.calls.map(([args]) => args.action)).toEqual(["take", "heartbeat", "release"]);
    expect(controlSession.mock.calls[0][0]).toMatchObject({ sessionId: "game-1", deviceId: DEVICE, userId: "user-1" });
  });

  test("taking control while another console holds it is a 409", async () => {
    controlSession.mockResolvedValue({ ok: false, reason: "not_controller", version: null, secondsSinceSeen: 12 });
    const res = await control.POST(request("POST", "control"), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "not_controller", secondsSinceSeen: 12 });
  });
});

describe("DELETE /api/sessions/[id]/links", () => {
  test("cancels the links and answers the new generation", async () => {
    revokeSessionLinks.mockResolvedValue(3);
    const res = await links.DELETE(request("DELETE", "links"), ctx);
    expect(await res.json()).toEqual({ ok: true, generation: 3 });
    expect(revokeSessionLinks).toHaveBeenCalledWith("game-1", "user-1");
  });

  test("a missing game is a 404", async () => {
    revokeSessionLinks.mockRejectedValue(new SessionNotFoundError("game-1"));
    expect((await links.DELETE(request("DELETE", "links"), ctx)).status).toBe(404);
  });
});
