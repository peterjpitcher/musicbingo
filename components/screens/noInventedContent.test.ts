import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { Qr } from "@anchor-nights/kit/qr";
import { ThankYou } from "@/components/screens/ThankYou";
import { PromoContext, type PromoValue } from "@/components/promo/PromoProvider";
import { feedWith, MUSIC_DEC_18, NO_FEED } from "@/lib/test/screenFeedFixtures";
import { Welcome } from "@/components/screens/Welcome";
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

const SAMPLE_VALUES = ["Nikki Manfadge", "27 June", "bar voucher", "house wine", "example.com"];

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
