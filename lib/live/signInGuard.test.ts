import { afterEach, describe, expect, test, vi } from "vitest";

import { SignInRequiredError, assertSignedIn, redirectToSignIn } from "@/lib/live/signInGuard";

function fakeWindow(pathname: string, search = ""): { assign: ReturnType<typeof vi.fn> } {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { pathname, search, assign } });
  return { assign };
}

afterEach(() => vi.unstubAllGlobals());

describe("assertSignedIn", () => {
  test("a 401 sends the browser to sign in, keeping where it was, and aborts the caller", () => {
    const { assign } = fakeWindow("/host/abc", "?tab=live");
    expect(() => assertSignedIn(new Response(null, { status: 401 }))).toThrow(SignInRequiredError);
    expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/host/abc?tab=live")}`);
  });

  test("a 403 (pending or deactivated) goes to the waiting screen and aborts", () => {
    const { assign } = fakeWindow("/host");
    expect(() => assertSignedIn(new Response(null, { status: 403 }))).toThrow(SignInRequiredError);
    expect(assign).toHaveBeenCalledWith("/pending");
  });

  test("anything else passes straight through", () => {
    const { assign } = fakeWindow("/host");
    for (const status of [200, 404, 500, 503]) {
      expect(() => assertSignedIn(new Response(null, { status }))).not.toThrow();
    }
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("redirectToSignIn", () => {
  test("never builds an open redirect from the current location", () => {
    const { assign } = fakeWindow("//evil.example/path");
    redirectToSignIn();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  test("does nothing on the sign-in page itself (no loop)", () => {
    const { assign } = fakeWindow("/login");
    redirectToSignIn();
    expect(assign).not.toHaveBeenCalled();
  });
});
