import { afterEach, describe, expect, test, vi } from "vitest";

import { isCronRequest } from "@/lib/auth/cron";

const createAuthMaintenance = vi.fn();
vi.mock("@anchor-nights/kit/auth", () => ({ createAuthMaintenance: (...args: unknown[]) => createAuthMaintenance(...args) }));
vi.mock("@/lib/auth/server", () => ({ authConfig: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const prunePairing = vi.fn(async () => ({ codes: 2, attempts: 3, revoked_devices: 0 }));
vi.mock("@/lib/tv-pairing", () => ({ tvPairing: () => ({ maintenance: { prunePairing } }) }));
const reportError = vi.fn(async () => undefined);
vi.mock("@/lib/reportError", () => ({ reportError: (...args: unknown[]) => reportError(...(args as [])) }));

const SECRET = "c".repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
  createAuthMaintenance.mockReset();
  reportError.mockClear();
});

describe("isCronRequest", () => {
  test("accepts exactly Bearer <secret>", () => {
    expect(isCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronRequest(SECRET, SECRET)).toBe(false);
    expect(isCronRequest(null, SECRET)).toBe(false);
  });

  test("fails closed without a configured secret, even for an empty bearer", () => {
    expect(isCronRequest("Bearer ", undefined)).toBe(false);
    expect(isCronRequest("Bearer ", "")).toBe(false);
    expect(isCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});

describe("GET /api/cron/auth-maintenance", () => {
  async function call(authorization?: string): Promise<Response> {
    const { GET } = await import("@/app/api/cron/auth-maintenance/route");
    return GET(new Request("https://musicbingo.example.com/api/cron/auth-maintenance", { headers: authorization ? { authorization } : {} }));
  }

  test("refuses everything when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(createAuthMaintenance).not.toHaveBeenCalled();
  });

  test("refuses a caller without the secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(createAuthMaintenance).not.toHaveBeenCalled();
  });

  test("runs the sign-in and TV pairing clean-up steps for Vercel Cron", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const pruneAuthData = vi.fn(async () => ({ audit: 1 }));
    const reconcileInvites = vi.fn(async () => ({ failed: 0 }));
    createAuthMaintenance.mockReturnValue({ pruneAuthData, reconcileInvites });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      pruned: { audit: 1 },
      invites: { failed: 0 },
      pairing: { codes: 2, attempts: 3, revoked_devices: 0 },
    });
    expect(prunePairing).toHaveBeenCalledTimes(1);
  });

  test("a failed pairing clean-up answers 500 and is reported", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    createAuthMaintenance.mockReturnValue({ pruneAuthData: vi.fn(async () => ({})), reconcileInvites: vi.fn(async () => ({})) });
    prunePairing.mockRejectedValueOnce(new Error("pairing clean-up failed: 42501"));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  test("a failure answers 500 and is reported, never a silent 200", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    createAuthMaintenance.mockReturnValue({
      pruneAuthData: vi.fn(async () => {
        throw new Error("database down");
      }),
      reconcileInvites: vi.fn(),
    });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
