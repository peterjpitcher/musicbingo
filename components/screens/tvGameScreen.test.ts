import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { TvCornerLogo } from "@/components/motifs/TvCornerLogo";
import { GameLive } from "@/components/screens/GameLive";
import { ScoreToastOverlay } from "@/components/screens/ScoreToastOverlay";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import { makeEmptyRuntimeState, type LiveRuntimeState, type PlayedTrack } from "@/lib/live/types";

const READ_ONLY: EditContextValue = { editing: false, get: (_key, fallback) => fallback ?? "", set: () => {} };

function render(element: ReactElement): string {
  return renderToStaticMarkup(createElement(EditContext.Provider, { value: READ_ONLY }, element));
}

function played(count: number): PlayedTrack[] {
  return Array.from({ length: count }, (_, i) => ({ trackId: `t${i}`, title: `Song ${i}`, artist: `Artist ${i}` }));
}

function liveGame(fields: Partial<LiveRuntimeState> = {}): LiveRuntimeState {
  return {
    ...makeEmptyRuntimeState("s1"),
    mode: "running",
    activeGameNumber: 1,
    screenId: "game1",
    currentTrack: {
      trackId: "now",
      title: "Wonderwall",
      artist: "Oasis",
      albumImageUrl: null,
      progressMs: 5_000,
      durationMs: 200_000,
      isPlaying: false,
    },
    playedTracks: played(12),
    ...fields,
  };
}

/** The footer's right corner: the song count when there is one. */
function songCountText(html: string): string | null {
  const match = html.match(/<span data-song-count="true"[^>]*>(.*?)<\/span><\/div><\/div>/);
  // The words sit in separate spans spaced by the flex gap: read each as a word.
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;
}

describe("the points pop-up on the TV", () => {
  it("shows the points just won but never the team's total", () => {
    const html = render(
      createElement(ScoreToastOverlay, {
        toast: { id: "x", teamId: "a", teamName: "Quizzy Rascals", points: 5, label: "Line", total: 47, createdAtMs: Date.now() },
      }),
    );
    expect(html).toContain("Quizzy Rascals +5 points");
    expect(html).not.toContain("47");
    expect(html.toLowerCase()).not.toContain("total");
  });
});

describe("the game screens' song count", () => {
  it("shows songs played and songs left in the footer", () => {
    const html = render(createElement(GameLive, { brand: DEFAULT_BRAND_CONFIG, runtime: liveGame(), game: 1, songTotal: 50 }));
    expect(songCountText(html)).toBe("12 played · 38 left");
    expect(html).not.toContain("Eyes Down");
  });

  it("shows it on challenge songs too", () => {
    const html = render(
      createElement(GameLive, {
        brand: DEFAULT_BRAND_CONFIG,
        runtime: liveGame({ isChallengeSong: true, challengeType: "dance-along", playedTracks: played(49) }),
        game: 1,
        songTotal: 50,
      }),
    );
    expect(songCountText(html)).toBe("49 played · 1 left");
  });

  it("keeps the footer's own words when the game's size is unknown", () => {
    const html = render(createElement(GameLive, { brand: DEFAULT_BRAND_CONFIG, runtime: liveGame(), game: 1 }));
    expect(songCountText(html)).toBeNull();
    expect(html).toContain("Eyes Down");
  });

  it("shows no count without a live song, nor for the other game", () => {
    const noSong = render(
      createElement(GameLive, { brand: DEFAULT_BRAND_CONFIG, runtime: liveGame({ currentTrack: null }), game: 1, songTotal: 50 }),
    );
    expect(songCountText(noSong)).toBeNull();
    const otherGame = render(createElement(GameLive, { brand: DEFAULT_BRAND_CONFIG, runtime: liveGame(), game: 2, songTotal: 50 }));
    expect(songCountText(otherGame)).toBeNull();
  });
});

describe("the TV's corner logo", () => {
  it("draws the venue's logo", () => {
    const html = renderToStaticMarkup(createElement(TvCornerLogo, { brand: DEFAULT_BRAND_CONFIG }));
    expect(html).toContain('class="tv-corner-logo"');
    expect(html).toContain('src="/the-anchor-pub-logo-white-transparent.png"');
    expect(html).toContain('alt="The Anchor"');
  });
});
