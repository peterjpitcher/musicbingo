import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

// @ts-expect-error: a plain .mjs script with no type declarations.
import { run } from "@/scripts/bootstrap-first-admin.mjs";

const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NEXT_PUBLIC_APP_URL: "https://musicbingo.example.com/",
};
const TOKEN = "t".repeat(43);

interface Fake {
  admins?: { id: string }[];
  roles?: Record<string, string>;
  inviteError?: { message: string; code?: string };
  auditError?: { message: string } | null;
}

function fakeClient(fake: Fake): { createClient: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn(async () => ({ error: fake.auditError ?? null }));
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "kit_staff_role_for") return { data: fake.roles?.[String(args.p_user)] ?? "pending", error: null };
    if (name === "kit_issue_invite") {
      if (fake.inviteError) return { data: null, error: fake.inviteError };
      return { data: [{ id: "i1", email: args.p_email, role: args.p_role, expires_at: "2026-11-14T10:00:00Z", cancelled: 0 }], error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      const chain = { select: () => chain, eq: () => chain, is: async () => ({ data: fake.admins ?? [], error: null }) };
      return chain;
    }
    if (table === "auth_audit") return { insert };
    throw new Error(`unexpected table ${table}`);
  });
  return { createClient: vi.fn(() => ({ from, rpc })), rpc, insert };
}

describe("bootstrap-first-admin", () => {
  test("prints a one-time admin invite link and stores only the token's hash", async () => {
    const fake = fakeClient({});
    const { code, result } = await run({ argv: ["--email", " Owner@Example.com "], env: ENV, createClient: fake.createClient, token: TOKEN });
    expect(code).toBe(0);
    expect(result).toMatchObject({ ok: true, email: "owner@example.com", role: "admin", inviteUrl: `https://musicbingo.example.com/invite#t=${TOKEN}`, audited: true });
    expect(fake.rpc).toHaveBeenCalledWith("kit_issue_invite", {
      p_email: "owner@example.com",
      p_role: "admin",
      p_token_hash: createHash("sha256").update(TOKEN, "utf8").digest("hex"),
      p_invited_by: null,
      p_ttl_seconds: 604800,
    });
    expect(fake.insert).toHaveBeenCalledWith(expect.objectContaining({ event: "invite_sent", outcome: "success", target_email: "owner@example.com" }));
    expect(Object.keys(result)).not.toContain("password");
  });

  test("refuses once an active admin exists", async () => {
    const fake = fakeClient({ admins: [{ id: "a1" }], roles: { a1: "admin" } });
    const { code, result } = await run({ argv: ["--email", "x@example.com"], env: ENV, createClient: fake.createClient, token: TOKEN });
    expect(code).toBe(1);
    expect(result.refused).toBe("admin_exists");
    expect(fake.rpc).not.toHaveBeenCalledWith("kit_issue_invite", expect.anything());
  });

  test("a banned or deactivated admin does not count as active", async () => {
    const fake = fakeClient({ admins: [{ id: "a1" }], roles: { a1: "pending" } });
    expect((await run({ argv: ["--email", "x@example.com"], env: ENV, createClient: fake.createClient, token: TOKEN })).code).toBe(0);
  });

  test("an address that already has an account is refused, not overwritten", async () => {
    const fake = fakeClient({ inviteError: { message: "kit_invite_account_exists", code: "P0001" } });
    const { code, result } = await run({ argv: ["--email", "x@example.com"], env: ENV, createClient: fake.createClient, token: TOKEN });
    expect(code).toBe(1);
    expect(result.refused).toBe("account_exists");
  });

  test("needs an address, and has none built in", async () => {
    const fake = fakeClient({});
    expect((await run({ argv: [], env: ENV, createClient: fake.createClient })).code).toBe(2);
    expect((await run({ argv: ["--email", "not-an-address"], env: ENV, createClient: fake.createClient })).code).toBe(2);
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  test("names every missing setting and touches nothing", async () => {
    const fake = fakeClient({});
    const { code, result } = await run({ argv: ["--email", "x@example.com"], env: {}, createClient: fake.createClient });
    expect(code).toBe(2);
    expect(result.error).toContain("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL");
    expect(fake.createClient).not.toHaveBeenCalled();
  });

  test("a database error is exit 2 with no link", async () => {
    const fake = fakeClient({ inviteError: { message: "connection refused", code: "08006" } });
    const { code, result } = await run({ argv: ["--email", "x@example.com"], env: ENV, createClient: fake.createClient, token: TOKEN });
    expect(code).toBe(2);
    expect(result.inviteUrl).toBeUndefined();
  });
});
