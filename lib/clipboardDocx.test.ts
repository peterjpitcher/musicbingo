import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { renderClipboardDocx } from "@/lib/clipboardDocx";
import type { Song } from "@/lib/types";

const song = (artist: string, title: string): Song => ({ artist, title });

const baseParams = {
  eventDateInput: "2026-06-05",
  game1: {
    theme: "90s",
    // CHALLENGESONGONE is also the challenge song; UNLISTED* exist only in the pool.
    songs: [
      song("Artist A", "CHALLENGESONGONE"),
      song("Artist B", "UNLISTEDSONGONE"),
      song("Artist C", "UNLISTEDSONGTWO"),
    ],
    challengeSongs: [song("Artist A", "CHALLENGESONGONE")],
    challengeTypes: ["dance-along"],
  },
  game2: {
    theme: "Pop",
    songs: [song("Artist D", "CHALLENGESONGTWO"), song("Artist E", "UNLISTEDSONGTHREE")],
    challengeSongs: [song("Artist D", "CHALLENGESONGTWO")],
    challengeTypes: ["sing-along"],
  },
  upcomingEvents: [],
  normalSongSeconds: 20,
};

async function renderDocumentXml(): Promise<string> {
  const bytes = await renderClipboardDocx(baseParams);
  // A valid .docx is a ZIP archive — first two bytes are the "PK" signature.
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);

  const zip = await JSZip.loadAsync(bytes);
  const documentFile = zip.file("word/document.xml");
  expect(documentFile, "DOCX missing word/document.xml").not.toBeNull();
  return documentFile!.async("string");
}

describe("renderClipboardDocx", () => {
  it("renders a valid DOCX with the run-of-show sections", async () => {
    const xml = await renderDocumentXml();
    expect(xml).toContain("Music Bingo with Nikki");
    expect(xml).toContain("SCHEDULE");
    expect(xml).toContain("GAME RULES AND POINTS");
  });

  it("does not list the playlist songs", async () => {
    const xml = await renderDocumentXml();
    // The full song-list section (and its headings) must be gone.
    expect(xml).not.toContain("UNLISTEDSONGONE");
    expect(xml).not.toContain("UNLISTEDSONGTWO");
    expect(xml).not.toContain("UNLISTEDSONGTHREE");
    expect(xml).not.toContain("MUSIC BINGO GAME 1 (");
    expect(xml).not.toContain("MUSIC BINGO GAME 2 (");
  });

  it("still names the challenge songs as operational cues", async () => {
    const xml = await renderDocumentXml();
    expect(xml).toContain("CHALLENGESONGONE");
    expect(xml).toContain("CHALLENGESONGTWO");
  });
});
