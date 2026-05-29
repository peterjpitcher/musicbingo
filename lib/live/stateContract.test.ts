import { describe, it, expect } from "vitest";
import { validateLiveSession } from "@/lib/live/validate";
import { validateRuntimeState } from "@/lib/live/storage";
import { LIVE_SESSION_VERSION, LIVE_RUNTIME_VERSION, makeEmptyRuntimeState } from "@/lib/live/types";

function validGame(n: 1 | 2) {
  return { gameNumber: n, theme: `Theme ${n}`, playlistId: `pl${n}`, playlistName: `Playlist ${n}`, playlistUrl: null, totalSongs: 25, addedCount: 25 };
}
function validSession(extra: Record<string, unknown> = {}) {
  return {
    version: LIVE_SESSION_VERSION,
    id: "s1", name: "Friday Night", createdAt: "2026-05-29T00:00:00.000Z",
    eventDateInput: "2026-06-27", eventDateDisplay: "Fri 27 June",
    games: [validGame(1), validGame(2)], revealConfig: { albumMs: 1, titleMs: 2, artistMs: 3, nextMs: 4 },
    breakPlaylistId: "", ...extra,
  };
}

describe("validateLiveSession — content/variant fields", () => {
  it("sanitises content (drops bogus keys, trims, caps) and keeps valid variants", () => {
    const out = validateLiveSession(validSession({
      content: { hostName: "  Nikki  ", bogusKey: "x", welcomeLede: "x".repeat(1000) },
      welcomeVariant: "B", titleVariant: "Z",
    }));
    expect(out).not.toBeNull();
    expect(out!.content).toEqual({ hostName: "Nikki", welcomeLede: "x".repeat(500) });
    expect(out!.welcomeVariant).toBe("B");
    expect(out!.titleVariant).toBeUndefined(); // "Z" is invalid → omitted
  });
  it("omits content entirely when none provided", () => {
    const out = validateLiveSession(validSession());
    expect(out).not.toBeNull();
    expect(out!.content).toBeUndefined();
  });
});

describe("validateRuntimeState — screen/content/variant fields", () => {
  function validRuntime(extra: Record<string, unknown> = {}) {
    return { ...makeEmptyRuntimeState("s1"), updatedAtMs: 1, ...extra };
  }
  it("defaults screenId to welcome when absent", () => {
    const raw = validRuntime();
    delete (raw as Record<string, unknown>).screenId;
    const out = validateRuntimeState(raw);
    expect(out).not.toBeNull();
    expect(out!.screenId).toBe("welcome");
  });
  it("normalises an unknown screenId to welcome and sanitises content", () => {
    const out = validateRuntimeState(validRuntime({ screenId: "bogus", content: { winTeam: "Curls", junk: 1 }, welcomeVariant: "C" }));
    expect(out!.screenId).toBe("welcome");
    expect(out!.content).toEqual({ winTeam: "Curls" });
    expect(out!.welcomeVariant).toBe("C");
  });
  it("preserves a valid screenId", () => {
    const out = validateRuntimeState(validRuntime({ screenId: "game2" }));
    expect(out!.screenId).toBe("game2");
  });
});
