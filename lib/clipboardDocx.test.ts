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

  it("leaves out the warm-up and challenge lines a night does not have", async () => {
    const bytes = await renderClipboardDocx({
      ...baseParams,
      game1: { ...baseParams.game1, challengeSongs: [], challengeTypes: [] },
      game2: { ...baseParams.game2, challengeSongs: [], challengeTypes: [] },
    });
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    expect(xml).not.toContain("WARM-UP SONG");
    expect(xml).not.toContain("BONUS FUN");
    expect(xml).not.toContain("Song TBD");
    expect(xml).not.toContain("Challenge included");
  });

  it("keeps the warm-up section when Game 1 has a warm-up song", async () => {
    const bytes = await renderClipboardDocx({
      ...baseParams,
      game1: { ...baseParams.game1, introSongs: [{ type: "dance-along", artist: "DJ Casper", title: "Cha Cha Slide" }] },
    });
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain("WARM-UP SONG");
    expect(xml).toContain("BONUS FUN");
  });
});
