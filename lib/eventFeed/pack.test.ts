import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { hasAdminAccess } from "@/lib/live/access";
import { POST } from "@/app/api/generate/route";
import { getBrandFeedConfig, resolveBrandConfig } from "@/lib/brands/brandRepo";
import { fetchEventsForBrand } from "./index";
import { promotionHeaders, promotionNotice } from "./promotionStatus";
import type { BrandFeedConfig } from "@/lib/brands/types";

vi.mock("@/lib/brands/brandRepo", () => ({
  resolveBrandConfig: vi.fn(), getBrandFeedConfig: vi.fn(),
}));
vi.mock("@/lib/brands/brandStorage", () => ({ fetchBrandLogoPngBytes: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/live/access", () => ({ hasAdminAccess: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/pdf", async (original) => ({
  ...await original<typeof import("@/lib/pdf")>(),
  loadDefaultLogoPngBytes: vi.fn().mockResolvedValue(null),
}));

const config: BrandFeedConfig = {
  type: "anchor_management", baseUrl: "https://management.example.test",
  apiKey: "test-key", websiteUrl: "https://venue.example.test", venueId: null,
};
const events = Array.from({ length: 12 }, (_, i) => ({
  name: `Event ${i}`, slug: `event-${i}`, startDate: "2026-09-11T18:00:00Z", price: 5,
}));

beforeEach(() => {
  vi.mocked(hasAdminAccess).mockReturnValue(true);
  vi.mocked(resolveBrandConfig).mockResolvedValue(null);
  vi.mocked(getBrandFeedConfig).mockResolvedValue(config);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { events } }))));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function generatePack() {
  // Keep the database boundary mocked, but exercise the real route, feed adapter and PDF/ZIP renderers.
  vi.mocked(resolveBrandConfig).mockResolvedValue({ id: "test-brand" } as Awaited<ReturnType<typeof resolveBrandConfig>>);
  const form = new FormData();
  form.set("event_date", "2026-09-05"); form.set("count", "1"); form.set("seed", "feed-test");
  const songs = Array.from({ length: 26 }, (_, i) => `Artist ${i} - Song ${i}`).join("\n");
  for (const game of [1, 2]) {
    form.set(`game${game}_songs`, songs);
    form.set(`game${game}_challenge_song`, "Artist 0|||Song 0");
  }
  const response = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: form }));
  expect(response.status, response.status === 200 ? undefined : await response.text()).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/zip");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const files = Object.values(zip.files);
  expect(files).toHaveLength(3);
  for (const file of files) {
    const pdf = await PDFDocument.load(await file.async("uint8array"));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  }
  return response;
}

describe("pack feed status", () => {
  test("successful real pack reports the four displayed events, not twelve run-sheet events", async () => {
    const response = await generatePack();
    expect(response.headers.get("x-music-bingo-qr-status")).toBe("ok");
    expect(response.headers.get("x-music-bingo-events-count")).toBe("4");
    expect(response.headers.get("x-music-bingo-events-with-url")).toBe("4");
    expect(promotionNotice(response.headers)).toBe("");
  });
  test("configuration outage still creates a real pack and a visible warning", async () => {
    vi.mocked(getBrandFeedConfig).mockRejectedValue(new Error("private database detail"));
    const response = await generatePack();
    expect(response.headers.get("x-music-bingo-qr-status")).toBe("error");
    expect(promotionNotice(response.headers)).toContain("could not be loaded");
    expect(JSON.stringify([...response.headers])).not.toContain("private database detail");
  });
  test("provider rejection still creates a real pack without leaking its response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("secret response", { status: 401 }));
    const response = await generatePack();
    expect(response.headers.get("x-music-bingo-qr-status")).toBe("error");
    expect(promotionNotice(response.headers)).toContain("Try generating it again");
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("secret response"));
  });
  test.each(["anchor_management", "baronshub"] as const)("missing %s credentials avoid a request and remain distinguishable", async (type) => {
    const result = await fetchEventsForBrand({ ...config, type, apiKey: null }, "2026-09-05");
    expect(result.status).toBe("missing_config");
    expect(fetch).not.toHaveBeenCalled();
    expect(promotionNotice(new Headers(promotionHeaders(result)))).toContain("not configured");
  });
  test("deliberately disabled feed is quiet", async () => {
    const result = await fetchEventsForBrand({ ...config, type: "none" }, "2026-09-05");
    expect(result.status).toBe("disabled");
    expect(promotionNotice(new Headers(promotionHeaders(result)))).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
  test("empty feed is different from outage", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ events: [] })));
    const result = await fetchEventsForBrand(config, "2026-09-05");
    expect(result.status).toBe("no_events");
    expect(promotionNotice(new Headers(promotionHeaders(result)))).toContain("No upcoming events");
  });
  test.each(["anchor_management", "baronshub"] as const)("malformed %s responses are failures, not empty calendars", async (type) => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: true })));
    const result = await fetchEventsForBrand({ ...config, type }, "2026-09-05");
    expect(result.status).toBe("error");
    expect(promotionNotice(new Headers(promotionHeaders(result)))).toContain("could not be loaded");
  });
  test("partial event and URL counts produce accurate warnings", async () => {
    const result = await fetchEventsForBrand(config, "2026-09-05");
    result.events = result.events.slice(0, 2);
    expect(promotionNotice(new Headers(promotionHeaders(result)))).toContain("2/4");
    result.events[0].eventUrl = null;
    expect(promotionNotice(new Headers(promotionHeaders(result)))).toContain("1/2");
  });
});
