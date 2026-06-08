import { describe, it, expect } from "vitest";
import { RUN_OF_SHOW, SHOW_STEPS, isScreenId, normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";

describe("RUN_OF_SHOW", () => {
  it("has the 14 navigable show steps in canonical order (excludes overlays + system)", () => {
    const ids = SHOW_STEPS.map((s) => s.id);
    expect(ids).toEqual([
      "welcome", "order", "quiz1", "title", "rules", "dance",
      "game1", "break", "quiz2", "sing", "game2", "winner-entry", "winners", "thanks",
    ]);
  });
  it("places winner entry between game2 and the winners reveal", () => {
    const ids = SHOW_STEPS.map((s) => s.id);
    expect(ids.indexOf("winner-entry")).toBe(ids.indexOf("game2") + 1);
    expect(ids.indexOf("winners")).toBe(ids.indexOf("winner-entry") + 1);
    expect(isScreenId("winner-entry")).toBe(true);
  });
  it("steps straight from game1 to break (claim is not in the sequence)", () => {
    const ids = SHOW_STEPS.map((s) => s.id);
    expect(ids.indexOf("break")).toBe(ids.indexOf("game1") + 1);
    expect(ids).not.toContain("claim");
  });
  it("keeps claim as a registered overlay screen (not navigable, still rendered)", () => {
    const claim = RUN_OF_SHOW.find((s) => s.id === "claim");
    expect(claim).toBeDefined();
    expect(claim?.overlay).toBe(true);
    expect(SHOW_STEPS.some((s) => s.id === "claim")).toBe(false);
    expect(isScreenId("claim")).toBe(true);
  });
  it("includes the two system screens", () => {
    const ids = RUN_OF_SHOW.map((s) => s.id);
    expect(ids).toContain("sys-load");
    expect(ids).toContain("sys-none");
  });
  it("tags play/intro screens with their game number", () => {
    const game1 = RUN_OF_SHOW.find((s) => s.id === "game1");
    expect(game1?.game).toBe(1);
    expect(game1?.play).toBe(true);
    expect(RUN_OF_SHOW.find((s) => s.id === "dance")?.intro).toBe(true);
  });
  it("has unique ids", () => {
    const ids = RUN_OF_SHOW.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isScreenId / normalizeScreenId", () => {
  it("accepts known ids", () => {
    expect(isScreenId("welcome")).toBe(true);
    expect(isScreenId("claim")).toBe(true);
    expect(isScreenId("nope")).toBe(false);
  });
  it("normalises unknown/absent to welcome", () => {
    expect(normalizeScreenId("game2")).toBe("game2" satisfies ScreenId);
    expect(normalizeScreenId("bogus")).toBe("welcome");
    expect(normalizeScreenId(undefined)).toBe("welcome");
    expect(normalizeScreenId(42)).toBe("welcome");
  });
});
