import { describe, expect, it } from "vitest";

import { parseSongListText, songListWithoutStartTimes, splitStartTime } from "@/lib/parser";

describe("song start times (13 November 2026)", () => {
  it("reads a start time after the title and keeps it out of the title", () => {
    const parsed = parseSongListText("Mud - Tiger Feet @0:40\nBlur - Song 2\nQueen - Bohemian Rhapsody @ 1:05\nABBA - Waterloo @45");
    expect(parsed.songs).toEqual([
      { artist: "Mud", title: "Tiger Feet", startMs: 40_000 },
      { artist: "Blur", title: "Song 2" },
      { artist: "Queen", title: "Bohemian Rhapsody", startMs: 65_000 },
      { artist: "ABBA", title: "Waterloo", startMs: 45_000 },
    ]);
    expect(parsed.combinedPool).toContain("Tiger Feet");
    expect(parsed.combinedPool.some((item) => item.includes("@"))).toBe(false);
  });

  it("treats @0 as the top and ignores a start time past fifteen minutes", () => {
    expect(parseSongListText("Mud - Tiger Feet @0:00").songs[0]).toEqual({ artist: "Mud", title: "Tiger Feet" });
    expect(splitStartTime("Mud - Tiger Feet @16:00")).toEqual({ text: "Mud - Tiger Feet @16:00", startMs: null });
  });

  it("dedupes a song listed with and without a start time", () => {
    expect(parseSongListText("Mud - Tiger Feet @0:40\nMud - Tiger Feet").songs).toHaveLength(1);
  });

  it("leaves a list with no start times exactly as it was", () => {
    const text = "1970s (2)\r\nMud - Tiger Feet\n\nBlur - Song 2\n";
    expect(songListWithoutStartTimes(text)).toBe(text);
    expect(songListWithoutStartTimes("Mud - Tiger Feet @0:40\nBlur - Song 2")).toBe("Mud - Tiger Feet\nBlur - Song 2");
  });
});
