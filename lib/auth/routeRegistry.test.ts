import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The app-level proof for spec M-8: every Route Handler in app/api is listed
 * in the registry, and NONE of them lets an anonymous caller through. Each
 * handler is imported for real and called with no session, no token and no
 * cookie; the only things replaced are the kit's session read (so "signed
 * out", "pending" and "Auth is down" can be set) and the data and network
 * layers, which must never be reached by a refused request.
 */

type AuthoriseResult = { ok: true; user: { id: string }; role: "admin" | "host" } | { ok: false; response: Response };
const authoriseRoute = vi.fn<(roles: readonly string[]) => Promise<AuthoriseResult>>();
const dataTouched = vi.fn();

function jsonResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

vi.mock("@/lib/auth/server", () => ({
  STAFF_ROLES: ["admin", "host"],
  ADMIN_ROLES: ["admin"],
  authHelpers: () => ({ authoriseRoute }),
  authConfig: () => {
    dataTouched("authConfig");
    throw new Error("auth config must not be read by a refused request");
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseClient: () => {
    dataTouched("service-role client");
    throw new Error("the service-role client must not be reached by a refused request");
  },
}));
vi.mock("@/lib/reportError", () => ({ reportError: vi.fn(async () => undefined) }));

const { ROUTE_REGISTRY } = await import("@/lib/auth/routeRegistry");

// Every route.ts under app/api, found on disk by Vite.
const modules = import.meta.glob("/app/api/**/route.ts");
const onDisk = Object.keys(modules)
  .map((file) => file.replace(/^\/app/, "").replace(/\/route\.ts$/, ""))
  .sort();

const PARAMS = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001", trackId: "track", playlistId: "playlist" }) };
const ORIGIN = "https://musicbingo.example.com";

function concrete(path: string): string {
  return path.replace("[id]", "00000000-0000-4000-8000-000000000001").replace("[trackId]", "track").replace("[playlistId]", "playlist");
}

function request(path: string, method: string, headers: Record<string, string> = {}): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers: { ...headers } };
  if (method !== "GET" && method !== "HEAD") {
    init.body = "{}";
    init.headers["content-type"] = "application/json";
  }
  return new NextRequest(`${ORIGIN}${concrete(path)}${path.endsWith("/authorize") ? "?token=forged&role=host" : ""}`, init);
}

type Handler = (req: NextRequest, ctx: typeof PARAMS) => Promise<Response>;

async function handlerFor(path: string, method: string): Promise<Handler> {
  const loader = modules[`/app${path}/route.ts`];
  const mod = (await loader()) as Record<string, unknown>;
  const fn = mod[method];
  if (typeof fn !== "function") throw new Error(`${path} exports no ${method}`);
  return fn as Handler;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  authoriseRoute.mockReset();
  dataTouched.mockReset();
  globalThis.fetch = vi.fn(async () => {
    dataTouched("network");
    throw new Error("no network call may be made by a refused request");
  }) as typeof fetch;
  vi.stubEnv("LIVE_LINK_SECRET", "a-live-link-secret-for-tests");
  vi.stubEnv("ERROR_SINK_TOKEN", "e".repeat(40));
  vi.stubEnv("CRON_SECRET", "c".repeat(40));
  // So the error sink is configured and its own bearer check is what answers.
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-for-tests");
});
afterAll(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
});

describe("the route registry", () => {
  test("lists exactly the route.ts files on disk", () => {
    expect(ROUTE_REGISTRY.map((r) => r.path).sort()).toEqual(onDisk);
  });

  test("lists exactly the methods each route exports", async () => {
    for (const entry of ROUTE_REGISTRY) {
      const mod = (await modules[`/app${entry.path}/route.ts`]()) as Record<string, unknown>;
      const exported = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].filter((m) => typeof mod[m] === "function");
      expect([entry.path, exported]).toEqual([entry.path, [...entry.methods].sort((a, b) => exported.indexOf(a) - exported.indexOf(b))]);
    }
  });

  test("the retired admin unlock route is gone", () => {
    expect(onDisk).not.toContain("/api/admin/unlock");
  });

  test("28 routes, 23 of them for signed-in staff only (including all 12 Spotify routes)", () => {
    expect(ROUTE_REGISTRY).toHaveLength(28);
    expect(ROUTE_REGISTRY.filter((r) => r.protection === "staff")).toHaveLength(23);
    const spotify = ROUTE_REGISTRY.filter((r) => r.path.startsWith("/api/spotify/"));
    expect(spotify).toHaveLength(12);
    expect(spotify.every((r) => r.protection === "staff")).toBe(true);
  });
});

const everyCall = ROUTE_REGISTRY.flatMap((entry) => entry.methods.map((method) => ({ ...entry, method })));
const staffCalls = everyCall.filter((c) => c.protection === "staff" || c.protection === "staff-or-display-token");

describe("an anonymous caller is refused by every route", () => {
  test.each(everyCall.map((c) => [`${c.method} ${c.path}`, c] as const))("%s", async (_name, call) => {
    authoriseRoute.mockResolvedValue({ ok: false, response: jsonResponse(401, "unauthenticated") });
    const handler = await handlerFor(call.path, call.method);
    const res = await handler(request(call.path, call.method, { origin: ORIGIN }), PARAMS);

    if (call.path === "/api/errors" && call.method === "GET") {
      expect(res.status).toBe(405); // no handler body at all
    } else {
      expect(res.status).toBe(401);
    }
    expect(dataTouched).not.toHaveBeenCalled();
  });
});

describe("a signed-in account without access (pending, deactivated or banned) is refused", () => {
  test.each(staffCalls.map((c) => [`${c.method} ${c.path}`, c] as const))("%s", async (_name, call) => {
    authoriseRoute.mockResolvedValue({ ok: false, response: jsonResponse(403, "unauthorised") });
    const handler = await handlerFor(call.path, call.method);
    const res = await handler(request(call.path, call.method, { origin: ORIGIN }), PARAMS);
    expect(res.status).toBe(403);
    expect(dataTouched).not.toHaveBeenCalled();
  });
});

describe("fails closed when Supabase Auth is down", () => {
  test.each(staffCalls.map((c) => [`${c.method} ${c.path}`, c] as const))("%s answers 503, not signed out", async (_name, call) => {
    authoriseRoute.mockResolvedValue({ ok: false, response: jsonResponse(503, "service_unavailable") });
    const handler = await handlerFor(call.path, call.method);
    const res = await handler(request(call.path, call.method, { origin: ORIGIN }), PARAMS);
    expect(res.status).toBe(503);
    expect(dataTouched).not.toHaveBeenCalled();
  });

  test("a guard that throws (missing auth settings) also answers 503", async () => {
    authoriseRoute.mockRejectedValue(new Error("Auth environment check failed"));
    const handler = await handlerFor("/api/sessions", "GET");
    const res = await handler(request("/api/sessions", "GET"), PARAMS);
    expect(res.status).toBe(503);
    expect(dataTouched).not.toHaveBeenCalled();
  });
});

describe("a signed-in host cannot be made to change anything from another site", () => {
  const mutating = staffCalls.filter((c) => c.method !== "GET");
  test.each(mutating.map((c) => [`${c.method} ${c.path}`, c] as const))("%s from evil.example is refused", async (_name, call) => {
    authoriseRoute.mockResolvedValue({ ok: true, user: { id: "u1" }, role: "host" });
    const handler = await handlerFor(call.path, call.method);
    const res = await handler(request(call.path, call.method, { origin: "https://evil.example" }), PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "cross_origin" });
    expect(dataTouched).not.toHaveBeenCalled();
  });

  test("a state change with no Origin is refused unless the browser says same-origin", async () => {
    authoriseRoute.mockResolvedValue({ ok: true, user: { id: "u1" }, role: "host" });
    const handler = await handlerFor("/api/sessions/[id]", "DELETE");
    expect((await handler(request("/api/sessions/[id]", "DELETE"), PARAMS)).status).toBe(403);
    expect((await handler(request("/api/sessions/[id]", "DELETE", { "sec-fetch-site": "cross-site" }), PARAMS)).status).toBe(403);
  });
});

describe("a signed-in host gets through the gate", () => {
  test("GET /api/sessions reaches the data layer (and so would answer)", async () => {
    authoriseRoute.mockResolvedValue({ ok: true, user: { id: "u1" }, role: "host" });
    const handler = await handlerFor("/api/sessions", "GET");
    const res = await handler(request("/api/sessions", "GET"), PARAMS);
    // The mocked service-role client throws, so the route reports a 500: the
    // point is that the gate let a signed-in host through to it.
    expect(res.status).toBe(500);
    expect(dataTouched).toHaveBeenCalledWith("service-role client");
    expect(authoriseRoute).toHaveBeenCalledWith(["admin", "host"]);
  });

  test("saving and deleting a game need the same thing (the old save versus delete mismatch)", () => {
    const save = ROUTE_REGISTRY.find((r) => r.path === "/api/sessions");
    const remove = ROUTE_REGISTRY.find((r) => r.path === "/api/sessions/[id]");
    expect(save?.protection).toBe("staff");
    expect(remove?.protection).toBe(save?.protection);
  });
});
