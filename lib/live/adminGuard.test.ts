import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AdminUnlockRequiredError,
  assertAdminUnlocked,
  redirectToAdminUnlock,
  safeNextPath,
} from "@/lib/live/adminGuard";

function stubWindow(pathname: string, search = ""): ReturnType<typeof vi.fn> {
  const assign = vi.fn();
  (globalThis as { window?: unknown }).window = {
    location: { pathname, search, assign },
  };
  return assign;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("safeNextPath", () => {
  test("keeps same-origin paths, including the query string", () => {
    expect(safeNextPath("/host")).toBe("/host");
    expect(safeNextPath("/prep?sessionId=abc")).toBe("/prep?sessionId=abc");
  });

  test("falls back when the value is missing or points off-site", () => {
    expect(safeNextPath(null)).toBe("/host");
    expect(safeNextPath("")).toBe("/host");
    // Protocol-relative: starts with "/" but would leave the origin.
    expect(safeNextPath("//evil.example")).toBe("/host");
    expect(safeNextPath("https://evil.example")).toBe("/host");
  });
});

describe("assertAdminUnlocked", () => {
  test("passes non-401 responses straight through", () => {
    const assign = stubWindow("/host");

    expect(() => assertAdminUnlocked(new Response(null, { status: 200 }))).not.toThrow();
    expect(() => assertAdminUnlocked(new Response(null, { status: 500 }))).not.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  test("redirects to the unlock page and aborts the caller on a 401", () => {
    const assign = stubWindow("/host", "?tab=games");

    expect(() => assertAdminUnlocked(new Response(null, { status: 401 })))
      .toThrow(AdminUnlockRequiredError);
    expect(assign).toHaveBeenCalledWith(`/admin?next=${encodeURIComponent("/host?tab=games")}`);
  });
});

describe("redirectToAdminUnlock", () => {
  test("does not loop when already on the unlock page", () => {
    const assign = stubWindow("/admin");

    redirectToAdminUnlock();

    expect(assign).not.toHaveBeenCalled();
  });

  test("is a no-op on the server, where there is no window", () => {
    expect(() => redirectToAdminUnlock()).not.toThrow();
  });
});
