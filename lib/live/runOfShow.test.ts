import { describe, it, expect } from "vitest";
import { RUN_OF_SHOW, SHOW_STEPS, adjacentShowStep, isScreenId, normalizeScreenId, showStepsFor, type ScreenId } from "@/lib/live/runOfShow";

describe("RUN_OF_SHOW", () => {
  it("has the 15 navigable show steps in canonical order (excludes overlays + system)", () => {
    const ids = SHOW_STEPS.map((s) => s.id);
    expect(ids).toEqual([
      "welcome", "order", "quiz1", "title", "rules", "dance",
      "game1", "break", "standings", "quiz2", "sing", "game2",
      "winner-entry", "winners", "thanks",
    ]);
  });
  it("shows the half-time standings straight after the interval", () => {
    const ids = SHOW_STEPS.map((s) => s.id);
    expect(ids.indexOf("standings")).toBe(ids.indexOf("break") + 1);
    expect(ids.indexOf("quiz2")).toBe(ids.indexOf("standings") + 1);
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

describe("showStepsFor (optional warm-ups, 13 November 2026)", () => {
  it("keeps both warm-ups when both games have one", () => {
    expect(showStepsFor(() => true).map((s) => s.id)).toEqual(SHOW_STEPS.map((s) => s.id));
  });
  it("drops the dance warm-up when Game 1 has no warm-up song", () => {
    const ids = showStepsFor((n) => n === 2).map((s) => s.id);
    expect(ids).not.toContain("dance");
    expect(ids).toContain("sing");
    expect(ids.indexOf("game1")).toBe(ids.indexOf("rules") + 1);
  });
  it("drops both warm-ups when neither game has one", () => {
    const ids = showStepsFor(() => false).map((s) => s.id);
    expect(ids).not.toContain("dance");
    expect(ids).not.toContain("sing");
    expect(ids.indexOf("game2")).toBe(ids.indexOf("quiz2") + 1);
  });
});

describe("adjacentShowStep", () => {
  const noWarmups = showStepsFor(() => false);
  it("steps past a dropped warm-up", () => {
    expect(adjacentShowStep(noWarmups, "rules", 1)).toBe("game1");
    expect(adjacentShowStep(noWarmups, "game2", -1)).toBe("quiz2");
  });
  it("moves to the neighbour when the TV is still on a dropped warm-up", () => {
    expect(adjacentShowStep(noWarmups, "dance", 1)).toBe("game1");
    expect(adjacentShowStep(noWarmups, "dance", -1)).toBe("rules");
    expect(adjacentShowStep(noWarmups, "sing", 1)).toBe("game2");
  });
  it("stays within the ends of the show", () => {
    expect(adjacentShowStep(noWarmups, "welcome", -1)).toBe("welcome");
    expect(adjacentShowStep(noWarmups, "thanks", 1)).toBe("thanks");
  });
  it("keeps the old behaviour for an overlay screen", () => {
    expect(adjacentShowStep(SHOW_STEPS, "claim", 1)).toBe("order");
  });
});
