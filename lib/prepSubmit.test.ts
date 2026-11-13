import { describe, expect, it } from "vitest";

import { MAX_SONGS_PER_GAME } from "@/lib/gameInput";
import { canSubmitPrep } from "@/lib/prepSubmit";

const ready = {
  eventDate: "2026-11-20",
  countInput: "40",
  game1: { songCount: 30, poolSize: 60 },
  game2: { songCount: 30, poolSize: 60 },
};

describe("canSubmitPrep", () => {
  it("allows a night with no challenge or warm-up songs", () => {
    expect(canSubmitPrep(ready)).toBe(true);
  });
  it("still needs a date, a card count and enough songs in both games", () => {
    expect(canSubmitPrep({ ...ready, eventDate: " " })).toBe(false);
    expect(canSubmitPrep({ ...ready, countInput: "0" })).toBe(false);
    expect(canSubmitPrep({ ...ready, countInput: "201" })).toBe(false);
    expect(canSubmitPrep({ ...ready, game1: { songCount: 0, poolSize: 0 } })).toBe(false);
    expect(canSubmitPrep({ ...ready, game2: { songCount: 30, poolSize: 24 } })).toBe(false);
    expect(canSubmitPrep({ ...ready, game2: { songCount: MAX_SONGS_PER_GAME + 1, poolSize: 120 } })).toBe(false);
  });
});
