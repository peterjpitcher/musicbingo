import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { Qr } from "@/components/motifs/Qr";
import { ThankYou } from "@/components/screens/ThankYou";
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
    expect(renderToStaticMarkup(createElement(Qr, { value: "" }))).toBe("");
    expect(renderToStaticMarkup(createElement(Qr, { value: "   " }))).toBe("");
  });

  it("renders the code square for a real value", () => {
    expect(renderToStaticMarkup(createElement(Qr, { value: "https://www.the-anchor.pub/" }))).toContain("<div");
  });
});

describe("ThankYou on the TV", () => {
  it("hides the next event badge when the host left the date blank", () => {
    const html = renderOnTv(createElement(ThankYou, { brand: anchor, runtime: runtimeWith({}) }), runtimeWith({}), anchor);
    expect(html).not.toContain("Next Event");
    expectNoSampleValues(html);
  });

  it("shows the badge when the host typed a date", () => {
    const runtime = runtimeWith({ content: { nextDate: "Fri 4 Dec" } });
    const html = renderOnTv(createElement(ThankYou, { brand: anchor, runtime }), runtime, anchor);
    expect(html).toContain("Next Event");
  });

  it("hides a QR card that has no usable address instead of showing an invented one", () => {
    const noWebsite: BrandConfig = { ...anchor, website_url: null, qr_items: null };
    // A host override of "" keeps the review default; book again then has nothing.
    const html = renderOnTv(createElement(ThankYou, { brand: noWebsite, runtime: runtimeWith({}) }), runtimeWith({}), noWebsite);
    expect(html).toContain("Review Us");
    expect(html).not.toContain("Book Again");
    expectNoSampleValues(html);
  });

  it("keeps Book Again when the brand website is stored without a scheme", () => {
    const html = renderOnTv(createElement(ThankYou, { brand: anchor, runtime: runtimeWith({}) }), runtimeWith({}), anchor);
    expect(html).toContain("Book Again");
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
