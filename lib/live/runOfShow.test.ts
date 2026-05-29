import { describe, it, expect } from "vitest";
import { RUN_OF_SHOW, isScreenId, normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";

describe("RUN_OF_SHOW", () => {
  it("has the 13 show screens in canonical order", () => {
    const ids = RUN_OF_SHOW.filter((s) => !s.id.startsWith("sys-")).map((s) => s.id);
    expect(ids).toEqual([
      "welcome", "order", "quiz1", "title", "rules", "dance",
      "game1", "break", "quiz2", "sing", "game2", "winners", "thanks",
    ]);
  });
  it("includes the two system screens", () => {
    const ids = RUN_OF_SHOW.map((s) => s.id);
    expect(ids).toContain("sys-load");
    expect(ids).toContain("sys-none");
  });
  it("marks welcome and title as having variants", () => {
    expect(RUN_OF_SHOW.find((s) => s.id === "welcome")?.hasVariants).toBe(true);
    expect(RUN_OF_SHOW.find((s) => s.id === "title")?.hasVariants).toBe(true);
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
    expect(isScreenId("nope")).toBe(false);
  });
  it("normalises unknown/absent to welcome", () => {
    expect(normalizeScreenId("game2")).toBe("game2" satisfies ScreenId);
    expect(normalizeScreenId("bogus")).toBe("welcome");
    expect(normalizeScreenId(undefined)).toBe("welcome");
    expect(normalizeScreenId(42)).toBe("welcome");
  });
});
