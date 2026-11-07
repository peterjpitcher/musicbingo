import { afterEach, describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { Qr } from "@anchor-nights/kit/qr";
import { ThankYou } from "@/components/screens/ThankYou";
import { PromoContext, type PromoValue } from "@/components/promo/PromoProvider";
import { feedWith, MUSIC_DEC_18, MUSIC_NOV_20, NO_FEED } from "@/lib/test/screenFeedFixtures";
import { Welcome } from "@/components/screens/Welcome";
import { Warmup } from "@/components/screens/Warmup";
import { GameLive } from "@/components/screens/GameLive";
import { Winners } from "@/components/screens/Winners";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { BrandConfig } from "@/lib/brands/types";
import { getContent, type ContentKey } from "@/lib/live/content";
import type { LiveRuntimeState } from "@/lib/live/types";

// The same EditContext the TV display mounts (app/display/[sessionId]/page.tsx).
function displayContext(runtime: LiveRuntimeState | null, brand: BrandConfig): EditContextValue {
  return {
    editing: false,
    get: (key, fallback) => getContent(key as ContentKey, { runtime, session: null, brand }) || (fallback ?? ""),
    set: () => {},
  };
}

function renderOnTv(element: ReactElement, runtime: LiveRuntimeState | null, brand: BrandConfig): string {
  return renderToStaticMarkup(
    createElement(EditContext.Provider, { value: displayContext(runtime, brand) }, element),
  );
}

const SAMPLE_VALUES = [
  "Nikki Manfadge", "27 June", "bar voucher", "house wine", "example.com", "\u00a325",
  // The design samples removed on 7 November 2026.
  "Friday · 8:00 PM", "8:00 PM", "EST.", "Yes Sir, I Can Boogie", "Baccara", "Dancing Queen", "ABBA",
  "Don&#x27;t Look Back", "Oasis", "Mr. Brightside", "The Killers", "Take On Me", "Pop Anthems", "Throwback Bangers",
];

function expectNoSampleValues(html: string): void {
  for (const sample of SAMPLE_VALUES) expect(html).not.toContain(sample);
}

const anchor: BrandConfig = { ...DEFAULT_BRAND_CONFIG, website_url: "www.the-anchor.pub" };

function runtimeWith(fields: Partial<LiveRuntimeState>): LiveRuntimeState {
  return fields as unknown as LiveRuntimeState;
}

describe("Qr", () => {
  it("renders nothing for an empty value, never a placeholder code", () => {
    expect(renderToStaticMarkup(createElement(Qr, { value: "", title: "QR code" }))).toBe("");
    expect(renderToStaticMarkup(createElement(Qr, { value: "   ", title: "QR code" }))).toBe("");
  });

  it("renders the code square for a real value", () => {
    expect(renderToStaticMarkup(createElement(Qr, { value: "https://www.the-anchor.pub/", title: "QR code" }))).toContain("<svg");
  });
});

describe("ThankYou on the TV (spec M-7: the kit's promo ThankYou)", () => {
  const REVIEW = "https://l.the-anchor.pub/jls0mu";
  function renderThankYou(value: PromoValue, content: Record<string, string> = {}): string {
    const runtime = runtimeWith({ content } as Partial<LiveRuntimeState>);
    return renderOnTv(
      createElement(PromoContext.Provider, { value }, createElement(ThankYou, { brand: anchor, runtime })),
      runtime,
      anchor,
    );
  }

  it("with the feed down shows \"See what's on\" and no date, never an invented one", () => {
    for (const feed of [null, NO_FEED]) {
      const html = renderThankYou({ feed, reviewUrl: REVIEW });
      expect(html).toContain("See what&#x27;s on");
      expect(html).not.toContain("What&#x27;s on next");
      expect(html).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
      expectNoSampleValues(html);
    }
  });

  it("shows the next Music Bingo from the feed with its London date", () => {
    const html = renderThankYou({ feed: feedWith([MUSIC_DEC_18]), reviewUrl: REVIEW });
    expect(html).toContain("What&#x27;s on next");
    expect(html).toContain("Test Music Bingo Christmas");
    expect(html).toContain("18");
  });

  it("asks for feedback without asking for a rating or steering to Google", () => {
    const html = renderThankYou({ feed: null, reviewUrl: REVIEW });
    expect(html).toContain("Review us");
    expect(html).not.toMatch(/google/i);
    expect(html).not.toContain("\u2605");
    expect(html).not.toMatch(/rate us|stars?\b/i);
  });

  it("shows no review card for a Google link", () => {
    const html = renderThankYou({ feed: null, reviewUrl: "https://g.page/r/the-anchor/review" });
    expect(html).not.toContain("Review us");
  });

  it("hides a card the host switched off for tonight", () => {
    const html = renderThankYou({ feed: feedWith([MUSIC_DEC_18]), reviewUrl: REVIEW }, { tyHideReview: "1", tyHideNext: "1" });
    expect(html).not.toContain("Review us");
    expect(html).not.toContain("What&#x27;s on next");
    expect(html).not.toContain("See what&#x27;s on");
  });

  it("ignores a next date or QR link a host typed before this release", () => {
    const html = renderThankYou({ feed: null, reviewUrl: REVIEW }, { nextDate: "Fri 4 Dec", bookQrUrl: "https://example.com/book" });
    expect(html).not.toContain("Fri 4 Dec");
    expect(html).not.toContain("example.com");
  });
});

describe("Welcome on the TV", () => {
  it("never shows a sample host name when the host left it blank", () => {
    for (const variant of ["A", "B", "C"] as const) {
      const html = renderOnTv(createElement(Welcome, { brand: anchor, runtime: null, variant }), null, anchor);
      expectNoSampleValues(html);
      expect(html).not.toContain('data-placeholder="Host name"');
    }
  });

  it("reads naturally without a host name on the default layout", () => {
    const html = renderOnTv(createElement(Welcome, { brand: anchor, runtime: null, variant: "A" }), null, anchor);
    expect(html).toContain("your host");
  });
});

describe("Welcome's date and time (spec M-7: real or nothing)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderWelcome(feed: PromoValue["feed"], eventDateInput: string | null, variant: "A" | "B" | "C" = "A"): string {
    const runtime = runtimeWith({ content: {} } as Partial<LiveRuntimeState>);
    return renderOnTv(
      createElement(
        PromoContext.Provider,
        { value: { feed, reviewUrl: null } },
        createElement(Welcome, { brand: anchor, runtime, variant, eventDateInput }),
      ),
      runtime,
      anchor,
    );
  }

  it("shows tonight's real start time from the feed", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T18:00:00.000Z") });
    for (const variant of ["A", "B"] as const) {
      expect(renderWelcome(feedWith([MUSIC_NOV_20]), "2026-11-20", variant)).toContain("Tonight · 8pm");
    }
  });

  it("shows no time at all when there is none, and nothing invented", () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T18:00:00.000Z") });
    for (const variant of ["A", "B", "C"] as const) {
      for (const feed of [null, NO_FEED]) {
        const html = renderWelcome(feed, null, variant);
        expect(html).not.toMatch(/\d(am|pm)\b|\d:\d\d/i);
        expect(html).not.toMatch(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
        expect(html).not.toContain("Tonight ·");
        expectNoSampleValues(html);
      }
    }
  });

  it("with a session date but no feed shows the date without a time", () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T12:00:00.000Z") });
    const html = renderWelcome(null, "2026-11-20");
    expect(html).toContain("Friday 20 November");
    expect(html).not.toMatch(/\d(am|pm)\b|\d:\d\d/i);
  });

  it("the venue page's preview (no runtime) shows no date and no sample song", () => {
    const html = renderOnTv(createElement(Welcome, { brand: anchor, runtime: null, variant: "A" }), null, anchor);
    expect(html).not.toContain("Now Playing");
    expectNoSampleValues(html);
  });

  it("names the welcome song only while it is really playing", () => {
    const song = { trackId: "t1", uri: "spotify:track:t1", title: "Test Welcome Song", artist: "Test Artist" };
    const playing = runtimeWith({
      content: {},
      welcomeSong: song,
      currentTrack: { trackId: "t1", title: "Test Welcome Song", artist: "Test Artist", albumImageUrl: null, progressMs: 0, durationMs: 1, isPlaying: true },
    } as Partial<LiveRuntimeState>);
    const html = renderOnTv(createElement(Welcome, { brand: anchor, runtime: playing, variant: "A" }), playing, anchor);
    expect(html).toContain("Test Welcome Song");
    expect(html).toContain("Test Artist");
  });
});

describe("Warm-up and game screens without a live song", () => {
  it("show no sample song or theme", () => {
    const runtime = runtimeWith({ content: {}, currentTrack: null, mode: "running", activeGameNumber: 1 } as Partial<LiveRuntimeState>);
    for (const runtimeOrNull of [null, runtime]) {
      for (const el of [
        createElement(Warmup, { brand: anchor, runtime: runtimeOrNull, type: "dance" }),
        createElement(Warmup, { brand: anchor, runtime: runtimeOrNull, type: "sing" }),
        createElement(GameLive, { brand: anchor, runtime: runtimeOrNull, game: 1 }),
        createElement(GameLive, { brand: anchor, runtime: runtimeOrNull, game: 2 }),
      ]) {
        const html = renderOnTv(el, runtimeOrNull, anchor);
        expectNoSampleValues(html);
        expect(html).not.toContain("Theme:");
      }
    }
  });
});

describe("Winners on the TV", () => {
  const teams = [
    { id: "a", name: "Anchors", score: 90 },
    { id: "b", name: "Bar Flies", score: 50 },
    { id: "c", name: "Dabbers", score: 20 },
  ];

  it("names the winner and wooden spoon without inventing prizes", () => {
    const runtime = runtimeWith({ teamScores: teams, winnersRevealCount: 3 } as Partial<LiveRuntimeState>);
    const html = renderOnTv(createElement(Winners, { brand: anchor, runtime }), runtime, anchor);
    expectNoSampleValues(html);
    expect(html).toContain("Winner");
    expect(html).toContain("Wooden Spoon");
    expect(html).not.toContain("Wins ");
  });

  it("shows the prizes the host typed", () => {
    const runtime = runtimeWith({
      teamScores: teams,
      winnersRevealCount: 3,
      content: { winPrize: "Bar tab", spoonPrize: "Spoon" },
    } as Partial<LiveRuntimeState>);
    const html = renderOnTv(createElement(Winners, { brand: anchor, runtime }), runtime, anchor);
    expect(html).toContain("Wins Bar tab");
    expect(html).toContain("Wooden Spoon · Spoon");
  });
});
