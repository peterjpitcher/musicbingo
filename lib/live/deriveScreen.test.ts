import { describe, it, expect } from "vitest";
import { deriveScreenId } from "@/lib/live/deriveScreen";
import { makeEmptyRuntimeState, type LiveRuntimeState } from "@/lib/live/types";

function rt(extra: Partial<LiveRuntimeState>): LiveRuntimeState {
  return { ...makeEmptyRuntimeState("s1"), ...extra };
}

describe("deriveScreenId", () => {
  const cases: Array<[string, Partial<LiveRuntimeState>, string]> = [
    ["idle → welcome", { mode: "idle" }, "welcome"],
    ["break → break", { mode: "break" }, "break"],
    ["ended → thanks", { mode: "ended" }, "thanks"],
    ["running game 1 → game1", { mode: "running", activeGameNumber: 1 }, "game1"],
    ["running game 2 → game2", { mode: "running", activeGameNumber: 2 }, "game2"],
    ["running game 1 intro → dance", { mode: "running", activeGameNumber: 1, isIntroSong: true }, "dance"],
    ["running game 2 intro → sing", { mode: "running", activeGameNumber: 2, isIntroSong: true }, "sing"],
    ["running, no active game → welcome", { mode: "running", activeGameNumber: null }, "welcome"],
    ["paused game 1 → game1", { mode: "paused", activeGameNumber: 1 }, "game1"],
    ["paused game 2 intro → sing", { mode: "paused", activeGameNumber: 2, isIntroSong: true }, "sing"],
  ];

  for (const [name, extra, expected] of cases) {
    it(name, () => {
      expect(deriveScreenId(rt(extra))).toBe(expected);
    });
  }
});
