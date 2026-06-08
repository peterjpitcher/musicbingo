import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { renderCardsPdf, renderEventsPage } from "@/lib/pdf";
import type { Card } from "@/lib/types";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function makeCard(index: number): Card {
  return {
    cardId: `card-${index}`,
    items: Array.from({ length: 18 }, (_, itemIndex) =>
      itemIndex % 6 === index % 6 ? "" : `Item ${index}-${itemIndex}`,
    ),
  };
}

describe("PDF print renderers", () => {
  it("renders bingo card sheets as portrait pages with 3 cards per page", async () => {
    const bytes = await renderCardsPdf(
      [makeCard(1), makeCard(2), makeCard(3), makeCard(4)],
      { eventDate: "Saturday, 30 May 2026", theme: "Pop Anthems" },
    );

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);

    const size = pdf.getPage(0).getSize();
    expect(size.width).toBeCloseTo(A4_WIDTH, 1);
    expect(size.height).toBeCloseTo(A4_HEIGHT, 1);
  });

  it("renders What's On as a portrait duplex back page", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    await renderEventsPage(pdf, font, fontBold, { events: [] });

    const size = pdf.getPage(0).getSize();
    expect(size.width).toBeCloseTo(A4_WIDTH, 1);
    expect(size.height).toBeCloseTo(A4_HEIGHT, 1);
  });
});
