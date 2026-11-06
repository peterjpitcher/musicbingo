import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const updateSessionBrand = vi.fn(async () => undefined);
const getBrand = vi.fn();
const resolveScreenBrandConfig = vi.fn(async (id: string) => ({ id }));

vi.mock("@/lib/live/access", () => ({ hasSessionAccess: () => true }));
vi.mock("@/lib/live/sessionRepo", () => ({ updateSessionBrand }));
vi.mock("@/lib/brands/brandRepo", () => ({ getBrand, resolveScreenBrandConfig }));
vi.mock("@/lib/reportError", () => ({ reportError: vi.fn(async () => undefined) }));

const { PUT } = await import("./route");

function put(brandId: string): Promise<Response> {
  const request = new NextRequest("http://127.0.0.1/api/sessions/s1/brand", {
    method: "PUT",
    body: JSON.stringify({ brand_id: brandId }),
    headers: { "content-type": "application/json" },
  });
  return PUT(request, { params: Promise.resolve({ id: "s1" }) });
}

describe("PUT /api/sessions/[id]/brand", () => {
  beforeEach(() => {
    updateSessionBrand.mockClear();
    getBrand.mockReset();
  });

  test("refuses an archived venue and leaves the game alone", async () => {
    getBrand.mockResolvedValue({ id: "barons", archived_at: "2026-11-14T10:00:00Z" });
    const res = await put("barons");
    expect(res.status).toBe(400);
    expect(updateSessionBrand).not.toHaveBeenCalled();
  });

  test("refuses an unknown venue", async () => {
    getBrand.mockResolvedValue(null);
    expect((await put("nope")).status).toBe(404);
    expect(updateSessionBrand).not.toHaveBeenCalled();
  });

  test("moves the game onto a live venue", async () => {
    getBrand.mockResolvedValue({ id: "anchor", archived_at: null });
    const res = await put("anchor");
    expect(res.status).toBe(200);
    expect(updateSessionBrand).toHaveBeenCalledWith("s1", "anchor");
    expect(await res.json()).toEqual({ brand: { id: "anchor" } });
  });
});
