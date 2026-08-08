import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminUnlockRequiredError } from "@/lib/live/adminGuard";

import {
  BrandListRequestError,
  invalidateBrandList,
  loadBrandList,
  refreshBrandList,
  resetBrandListForTests,
} from "../brandList";

const BRANDS = [{ id: "brand-1", name: "The Anchor", is_default: true }];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("brandList", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetBrandListForTests();
    fetchMock = vi.fn(async () => jsonResponse(BRANDS));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetBrandListForTests();
  });

  it("shares one request across callers that arrive together", async () => {
    // The /host table mounts a selector per game row in a single commit.
    const results = await Promise.all([loadBrandList(), loadBrandList(), loadBrandList()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/brands");
    for (const result of results) expect(result).toEqual(BRANDS);
  });

  it("serves callers that arrive afterwards from the cache", async () => {
    await loadBrandList();
    await expect(loadBrandList()).resolves.toEqual(BRANDS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("goes back to the server after an invalidation", async () => {
    await loadBrandList();
    invalidateBrandList();
    await loadBrandList();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches on refresh so an edit reaches every mounted selector", async () => {
    await loadBrandList();
    await refreshBrandList();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets the admin gate's 401 through so the unlock redirect still fires", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Admin access required." }, 401));

    // Sharing the request must not swallow the 401 into an empty brand list.
    await expect(loadBrandList()).rejects.toBeInstanceOf(AdminUnlockRequiredError);
  });

  it("reports the status for a refusal that is not an expired unlock", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Boom" }, 500));

    await expect(loadBrandList()).rejects.toBeInstanceOf(BrandListRequestError);
    await expect(loadBrandList()).rejects.toMatchObject({ status: 500 });
  });

  it("never caches a failure, so a lapsed admin cookie is re-checked", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Admin access required." }, 401));

    await expect(loadBrandList()).rejects.toBeInstanceOf(AdminUnlockRequiredError);
    // Cookie restored: the very next load must hit the server again.
    await expect(loadBrandList()).resolves.toEqual(BRANDS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let a request superseded by an invalidation write its result back", async () => {
    const stale = [{ id: "stale", name: "Stale", is_default: false }];
    let releaseStale!: (res: Response) => void;
    const stalePending = new Promise<Response>((resolve) => {
      releaseStale = resolve;
    });
    fetchMock.mockImplementationOnce(async () => stalePending);

    const first = loadBrandList();
    invalidateBrandList();
    const second = loadBrandList();
    releaseStale(jsonResponse(stale));

    await expect(first).resolves.toEqual(stale);
    await expect(second).resolves.toEqual(BRANDS);
    // The cache holds the newer list, not the one the superseded request returned.
    await expect(loadBrandList()).resolves.toEqual(BRANDS);
  });
});
