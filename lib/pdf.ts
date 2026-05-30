import fs from "node:fs/promises";
import path from "node:path";

import QRCode from "qrcode";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

import type { Card, FooterQrItem } from "@/lib/types";
import type { NormalisedEvent } from "@/lib/eventFeed";
import type { BrandConfig } from "@/lib/brands/types";
import { sanitizeFilenamePart } from "@/lib/utils";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

type RenderOptions = {
  eventDate: string;
  theme?: string;
  footerItems?: FooterQrItem[];
  logoLeftPngBytes?: Uint8Array | null;
  logoRightPngBytes?: Uint8Array | null;
  showCardId?: boolean;
  brandConfig?: BrandConfig | null;
};

type PublicAssetLoadOptions = {
  origin?: string; // e.g. "https://your-app.vercel.app"
};


async function qrPng(url: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
  });
  return new Uint8Array(buf);
}

const fontCharacterSetCache = new WeakMap<PDFFont, Set<number>>();

function getFontCharacterSet(font: PDFFont): Set<number> {
  const cached = fontCharacterSetCache.get(font);
  if (cached) return cached;
  const characterSet = new Set(font.getCharacterSet());
  fontCharacterSetCache.set(font, characterSet);
  return characterSet;
}

function isCombiningMark(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

function appendSingleSpace(text: string): string {
  return text.length === 0 || /[\s\n]$/.test(text) ? text : `${text} `;
}

function sanitizePdfText(text: string, font: PDFFont): string {
  const characterSet = getFontCharacterSet(font);
  const normalized = text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "");

  let safe = "";
  for (const char of normalized) {
    if (char === "\n") {
      safe += "\n";
      continue;
    }
    if (char === "\t") {
      safe = appendSingleSpace(safe);
      continue;
    }

    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    if (characterSet.has(codePoint)) {
      safe += char;
    } else if (!isCombiningMark(codePoint)) {
      safe = appendSingleSpace(safe);
    }
  }

  return safe
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function wrapTextLines(params: {
  text: string;
  maxWidth: number;
  font: PDFFont;
  fontSize: number;
  minFontSize: number;
  maxHeight: number;
  leadingRatio: number;
}): { lines: string[]; fontSize: number; lineHeight: number } {
  const { maxWidth, font, minFontSize, maxHeight, leadingRatio } = params;
  const safeText = sanitizePdfText(params.text, font);
  const paragraphs = safeText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return { lines: [], fontSize: params.fontSize, lineHeight: params.fontSize };
  }

  const truncateToWidth = (s: string, size: number): string => {
    if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
    let cut = s;
    while (cut.length > 0 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut.length ? `${cut}…` : "…";
  };

  const wrapWordsAtSize = (words: string[], size: number): string[] => {
    const out: string[] = [];
    let current = "";
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        current = trial;
        continue;
      }
      if (current) {
        out.push(current);
        current = word;
      } else {
        out.push(truncateToWidth(word, size));
        current = "";
      }
    }
    if (current) out.push(current);
    return out;
  };

  const wrapAtSize = (size: number): string[] => {
    const lines: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      lines.push(...wrapWordsAtSize(words, size));
    }
    return lines;
  };

  let fontSize = params.fontSize;
  let lines = wrapAtSize(fontSize);

  while (fontSize > minFontSize) {
    const lineHeight = font.heightAtSize(fontSize) * leadingRatio;
    if (lines.length * lineHeight <= maxHeight) break;
    fontSize -= 0.5;
    lines = wrapAtSize(fontSize);
  }

  const lineHeight = font.heightAtSize(fontSize) * leadingRatio;
  if (lines.length * lineHeight > maxHeight) {
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    lines = lines.slice(0, maxLines);
    if (lines.length) {
      lines[lines.length - 1] = truncateToWidth(lines[lines.length - 1], fontSize);
    }
  }

  return { lines, fontSize, lineHeight };
}

export async function renderCardsPdf(cards: Card[], opts: RenderOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  // Soft grey used for the inner grid rules, mirroring `--p-line-soft` in the
  // After Hours print stylesheet. Still B&W (greyscale) — no block colour.
  const softLine = rgb(0.53, 0.53, 0.53);
  // Muted ink for the card footer caption (`--p-mute` in the stylesheet).
  const muted = rgb(0.33, 0.33, 0.33);

  // Landscape A4: swap width and height
  const pageW = A4_HEIGHT; // 842
  const pageH = A4_WIDTH;  // 595

  const marginX = mmToPt(14);
  const marginY = mmToPt(10);
  // Header band carrying the logo + "MUSIC BINGO" lockup (After Hours .sheet-head).
  const headerH = mmToPt(22);
  const headerRuleW = 1.5;
  const colGap = mmToPt(5);
  const rowGap = mmToPt(5);

  const COLS = 3;
  const ROWS = 2;
  const CARDS_PER_PAGE = COLS * ROWS;
  const GRID_COLS = 5;
  const GRID_ROWS = 3;

  // Each card carries its own header + footer bands inside the border, with the
  // 5×3 number grid filling the middle (After Hours .bcard layout).
  const cardHeaderH = mmToPt(6);
  const cardFooterH = mmToPt(5);

  const availableW = pageW - 2 * marginX - (COLS - 1) * colGap;
  const availableH = pageH - 2 * marginY - headerH - (ROWS - 1) * rowGap;
  const cardW = availableW / COLS;
  const cardH = availableH / ROWS;
  // Grid occupies the space between the card's header and footer bands.
  const gridH = cardH - cardHeaderH - cardFooterH;
  const cellW = cardW / GRID_COLS;
  const cellH = gridH / GRID_ROWS;

  const logoLeftImage =
    opts.logoLeftPngBytes && opts.logoLeftPngBytes.length ? await pdf.embedPng(opts.logoLeftPngBytes) : null;
  const logoRightImage =
    opts.logoRightPngBytes && opts.logoRightPngBytes.length ? await pdf.embedPng(opts.logoRightPngBytes) : null;

  const showCardId = opts.showCardId ?? true;
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);

  // Brand / venue name shown on the right of the sheet header. Falls back to a
  // generic label when no brand is configured.
  const venueName = sanitizePdfText(opts.brandConfig?.name?.trim() || "Music Bingo", fontBold);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdf.addPage([pageW, pageH]);

    // --- Sheet header (After Hours .sheet-head: logo + title left, meta right) ---
    const headerTop = pageH - marginY;
    const headerBottom = headerTop - headerH;
    const headerCenterY = (headerTop + headerBottom) / 2;
    const headerLeft = marginX;
    const headerRight = pageW - marginX;

    // Left lockup: optional logo followed by the "MUSIC BINGO" wordmark.
    let titleX = headerLeft;
    const logoMaxH = headerH * 0.6;
    if (logoLeftImage) {
      const scale = Math.min(mmToPt(40) / logoLeftImage.width, logoMaxH / logoLeftImage.height);
      const w = logoLeftImage.width * scale;
      const h = logoLeftImage.height * scale;
      page.drawImage(logoLeftImage, {
        x: headerLeft,
        y: headerCenterY - h / 2,
        width: w,
        height: h,
      });
      titleX = headerLeft + w + mmToPt(4);
    }

    // "MUSIC BINGO" wordmark (Anton in the design → large HelveticaBold here).
    const titleText = "MUSIC BINGO";
    const titleSize = 22;
    page.drawText(titleText, {
      x: titleX,
      y: headerCenterY - titleSize * 0.36,
      size: titleSize,
      font: fontBold,
      color: black,
    });

    // Optional right-hand logo, drawn flush right; the meta block sits to its
    // left when present so a caller-supplied second logo is never dropped.
    let metaRight = headerRight;
    if (logoRightImage) {
      const scale = Math.min(mmToPt(30) / logoRightImage.width, logoMaxH / logoRightImage.height);
      const w = logoRightImage.width * scale;
      const h = logoRightImage.height * scale;
      page.drawImage(logoRightImage, {
        x: headerRight - w,
        y: headerCenterY - h / 2,
        width: w,
        height: h,
      });
      metaRight = headerRight - w - mmToPt(4);
    }

    // Right-hand meta block: venue name above, theme · date below.
    const metaSize = 9;
    const metaLineGap = 2;
    const themeBits = [opts.theme, opts.eventDate]
      .map((part) => (part ? sanitizePdfText(part, font) : ""))
      .filter(Boolean);
    const metaSubline = themeBits.join("  ·  ");
    const venueNameW = fontBold.widthOfTextAtSize(venueName, metaSize);
    const metaSublineW = metaSubline ? font.widthOfTextAtSize(metaSubline, metaSize) : 0;
    const metaTopY = metaSubline
      ? headerCenterY + metaLineGap / 2 + 1
      : headerCenterY - metaSize * 0.36;
    page.drawText(venueName, {
      x: metaRight - venueNameW,
      y: metaTopY,
      size: metaSize,
      font: fontBold,
      color: black,
    });
    if (metaSubline) {
      page.drawText(metaSubline, {
        x: metaRight - metaSublineW,
        y: metaTopY - metaSize - metaLineGap,
        size: metaSize,
        font,
        color: black,
      });
    }

    // Header rule beneath the lockup.
    page.drawLine({
      start: { x: headerLeft, y: headerBottom },
      end: { x: headerRight, y: headerBottom },
      thickness: headerRuleW,
      color: black,
    });

    // --- Cards ---
    for (let ci = 0; ci < CARDS_PER_PAGE; ci++) {
      const cardIdx = pageIdx * CARDS_PER_PAGE + ci;
      if (cardIdx >= cards.length) break;
      const card = cards[cardIdx];

      const colIdx = ci % COLS;
      const rowIdx = Math.floor(ci / COLS);

      // Card bottom-left corner.
      const cardX = marginX + colIdx * (cardW + colGap);
      const cardY = headerBottom - marginY - rowIdx * (cardH + rowGap) - cardH;

      // Band geometry (header at top, footer at bottom, grid between).
      const headerBandBottom = cardY + cardH - cardHeaderH;
      const footerBandTop = cardY + cardFooterH;
      const gridX = cardX;
      const gridY = footerBandTop; // grid sits directly above the footer band

      // Outer border (After Hours .bcard 1.4pt).
      page.drawRectangle({
        x: cardX,
        y: cardY,
        width: cardW,
        height: cardH,
        borderColor: black,
        borderWidth: 1.4,
      });

      // --- Card header band: theme (left) + #NNN number (right) ---
      const headerPad = mmToPt(3);
      const headerBandCenterY = headerBandBottom + cardHeaderH / 2;

      // Card number is always shown (right-aligned).
      const numberText = `#${String(cardIdx + 1).padStart(3, "0")}`;
      const numberSize = 10;
      const numberW = fontBold.widthOfTextAtSize(numberText, numberSize);
      page.drawText(numberText, {
        x: cardX + cardW - headerPad - numberW,
        y: headerBandCenterY - numberSize * 0.36,
        size: numberSize,
        font: fontBold,
        color: black,
      });

      // Theme label (left), clipped so it never collides with the number.
      if (opts.theme) {
        const themeLabel = sanitizePdfText(opts.theme.toUpperCase(), fontBold);
        const themeSize = 8;
        const themeMaxW = cardW - 2 * headerPad - numberW - mmToPt(3);
        let themeOut = themeLabel;
        while (themeOut.length > 1 && fontBold.widthOfTextAtSize(themeOut, themeSize) > themeMaxW) {
          themeOut = themeOut.slice(0, -1);
        }
        if (themeOut !== themeLabel && themeOut.length > 0) {
          themeOut = `${themeOut.slice(0, -1)}…`;
        }
        page.drawText(themeOut, {
          x: cardX + headerPad,
          y: headerBandCenterY - themeSize * 0.36,
          size: themeSize,
          font: fontBold,
          color: black,
        });
      }
      // Header band bottom rule (1pt).
      page.drawLine({
        start: { x: cardX, y: headerBandBottom },
        end: { x: cardX + cardW, y: headerBandBottom },
        thickness: 1,
        color: black,
      });

      // --- Grid: blank-cell shading first, then soft rules, then text ---
      const padding = 2;
      for (let idx = 0; idx < GRID_COLS * GRID_ROWS; idx++) {
        const row = Math.floor(idx / GRID_COLS);
        const col = idx % GRID_COLS;
        const cX = gridX + col * cellW;
        const cY = gridY + (GRID_ROWS - 1 - row) * cellH; // row 0 at top = highest Y
        const text = card.items[idx] ?? "";

        // Blank cells get a light greyscale shade + a centred note marker,
        // mirroring the hatched "free space" treatment in the design.
        if (text.trim().length === 0) {
          page.drawRectangle({
            x: cX,
            y: cY,
            width: cellW,
            height: cellH,
            color: rgb(0.9, 0.9, 0.9),
          });
          const markerSize = Math.min(cellH, cellW) * 0.4;
          const marker = "•"; // bullet — Helvetica-safe stand-in for the note glyph
          const markerW = font.widthOfTextAtSize(marker, markerSize);
          page.drawText(marker, {
            x: cX + (cellW - markerW) / 2,
            y: cY + (cellH - markerSize) / 2,
            size: markerSize,
            font,
            color: softLine,
          });
        }
      }

      // Inner vertical lines (soft, 0.6pt).
      for (let c = 1; c < GRID_COLS; c++) {
        page.drawLine({
          start: { x: gridX + c * cellW, y: gridY },
          end: { x: gridX + c * cellW, y: gridY + gridH },
          thickness: 0.6,
          color: softLine,
        });
      }

      // Inner horizontal lines (soft, 0.6pt).
      for (let r = 1; r < GRID_ROWS; r++) {
        page.drawLine({
          start: { x: gridX, y: gridY + r * cellH },
          end: { x: gridX + cardW, y: gridY + r * cellH },
          thickness: 0.6,
          color: softLine,
        });
      }

      // Cell text (drawn last so it sits above shading and rules).
      for (let idx = 0; idx < GRID_COLS * GRID_ROWS; idx++) {
        const row = Math.floor(idx / GRID_COLS);
        const col = idx % GRID_COLS;
        const cX = gridX + col * cellW;
        const cY = gridY + (GRID_ROWS - 1 - row) * cellH;
        const text = card.items[idx] ?? "";
        if (text.trim().length === 0) continue;
        const innerW = cellW - 2 * padding;
        const innerH = cellH - 2 * padding;

        const { lines, fontSize, lineHeight } = wrapTextLines({
          text,
          maxWidth: innerW,
          maxHeight: innerH,
          font,
          fontSize: 9,
          minFontSize: 5,
          leadingRatio: 1.15,
        });

        const totalH = lines.length * lineHeight;
        const blockBottom = cY + padding + (innerH - totalH) / 2;

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          const lineW = font.widthOfTextAtSize(line, fontSize);
          const lineX = cX + padding + (innerW - lineW) / 2;
          const lineY = blockBottom + (lines.length - 1 - li) * lineHeight;
          page.drawText(line, { x: lineX, y: lineY, size: fontSize, font, color: black });
        }
      }

      // --- Card footer band: caption (left) + card id (right) ---
      // Footer band top rule (1pt).
      page.drawLine({
        start: { x: cardX, y: footerBandTop },
        end: { x: cardX + cardW, y: footerBandTop },
        thickness: 1,
        color: black,
      });
      const footerPad = mmToPt(3);
      const footerSize = 6;
      const footerCenterY = cardY + cardFooterH / 2;
      page.drawText("Dab a song when you hear it", {
        x: cardX + footerPad,
        y: footerCenterY - footerSize * 0.36,
        size: footerSize,
        font,
        color: muted,
      });
      if (showCardId) {
        const idLabel = sanitizePdfText(card.cardId, font);
        const idW = font.widthOfTextAtSize(idLabel, footerSize);
        page.drawText(idLabel, {
          x: cardX + cardW - footerPad - idW,
          y: footerCenterY - footerSize * 0.36,
          size: footerSize,
          font,
          color: muted,
        });
      }
    }
  }

  const bytes = await pdf.save();
  return bytes;
}

// ---------------------------------------------------------------------------
// Events back page renderer
// ---------------------------------------------------------------------------

type EventsPageOptions = {
  events: NormalisedEvent[];
  logoLeftPngBytes?: Uint8Array | null;
  logoRightPngBytes?: Uint8Array | null;
  brandConfig?: BrandConfig | null;
};

export async function renderEventsPage(
  pdf: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  opts: EventsPageOptions
): Promise<void> {
  const pageW = A4_HEIGHT; // 842 (landscape)
  const pageH = A4_WIDTH;  // 595

  const marginX = mmToPt(14);
  const marginY = mmToPt(10);

  const black = rgb(0, 0, 0);

  const muted = rgb(0.33, 0.33, 0.33);

  // Optional left logo, mirroring the cards sheet header treatment.
  const logoLeftImage =
    opts.logoLeftPngBytes && opts.logoLeftPngBytes.length ? await pdf.embedPng(opts.logoLeftPngBytes) : null;

  const page = pdf.addPage([pageW, pageH]);

  const contentTop = pageH - marginY;
  const contentBottom = marginY;

  // --- Header (After Hours .ev-head: logo + "What's On" left, meta right) ---
  const headerH = mmToPt(20);
  const headerTop = contentTop;
  const headerBottom = headerTop - headerH;
  const headerCenterY = (headerTop + headerBottom) / 2;
  const headerRight = pageW - marginX;

  let titleX = marginX;
  if (logoLeftImage) {
    const logoMaxH = headerH * 0.6;
    const scale = Math.min(mmToPt(40) / logoLeftImage.width, logoMaxH / logoLeftImage.height);
    const w = logoLeftImage.width * scale;
    const h = logoLeftImage.height * scale;
    page.drawImage(logoLeftImage, {
      x: marginX,
      y: headerCenterY - h / 2,
      width: w,
      height: h,
    });
    titleX = marginX + w + mmToPt(4);
  }

  const titleSize = 22;
  page.drawText("What's On", {
    x: titleX,
    y: headerCenterY - titleSize * 0.36,
    size: titleSize,
    font: fontBold,
    color: black,
  });

  // Right-hand meta: venue name above, strapline below.
  const venueName = sanitizePdfText(opts.brandConfig?.name?.trim() || "The Anchor", fontBold);
  const metaSize = 9;
  const venueNameW = fontBold.widthOfTextAtSize(venueName, metaSize);
  const strapline = "More great nights out";
  const straplineW = font.widthOfTextAtSize(strapline, metaSize);
  page.drawText(venueName, {
    x: headerRight - venueNameW,
    y: headerCenterY + 2,
    size: metaSize,
    font: fontBold,
    color: black,
  });
  page.drawText(strapline, {
    x: headerRight - straplineW,
    y: headerCenterY + 2 - metaSize - 2,
    size: metaSize,
    font,
    color: muted,
  });

  const headerRuleY = headerBottom;
  page.drawLine({
    start: { x: marginX, y: headerRuleY },
    end: { x: pageW - marginX, y: headerRuleY },
    thickness: 1.5,
    color: black,
  });

  // --- Footer (After Hours .ev-foot) ---
  const footerWeb = opts.brandConfig?.website_url?.trim() || "the-anchor.pub";
  const footerText = sanitizePdfText(
    opts.brandConfig?.qr_items?.length
      ? `${opts.brandConfig.qr_items.map((item) => item.label).join("  \u00b7  ")}  \u00b7  Book online at ${footerWeb}`
      : `Book online at ${footerWeb}  \u00b7  or just ask at the bar`,
    font,
  );
  const footerSize = 7;
  const footerRuleY = contentBottom + 14;
  page.drawLine({
    start: { x: marginX, y: footerRuleY },
    end: { x: pageW - marginX, y: footerRuleY },
    thickness: 0.5,
    color: black,
  });
  const footerW = font.widthOfTextAtSize(footerText, footerSize);
  page.drawText(footerText, {
    x: (pageW - footerW) / 2,
    y: contentBottom + 3,
    size: footerSize,
    font,
    color: black,
  });

  const bodyTop = headerRuleY - 8;
  const bodyBottom = footerRuleY + 8;
  const bodyH = bodyTop - bodyBottom;

  // --- No events ---
  if (!opts.events || opts.events.length === 0) {
    const visitUrl = opts.brandConfig?.website_url || "the-anchor.pub";
    const msg = sanitizePdfText(`Visit ${visitUrl} for upcoming events`, font);
    const msgSize = 14;
    const msgW = font.widthOfTextAtSize(msg, msgSize);
    page.drawText(msg, {
      x: (pageW - msgW) / 2,
      y: bodyBottom + bodyH / 2 - msgSize / 2,
      size: msgSize,
      font,
      color: black,
    });
    return;
  }

  const featured = opts.events[0];
  // Timeline capped to at most three upcoming events (After Hours .ev-grid).
  const upcomingEvents = opts.events.slice(1, 4);

  const contentW = pageW - 2 * marginX;

  // --- Featured event card (full-width, After Hours .ev-feature) ---
  const featuredH = upcomingEvents.length > 0 ? bodyH * 0.42 : bodyH;
  const featuredTop = bodyTop;
  const featuredBottom = featuredTop - featuredH;
  const featPad = mmToPt(5);

  page.drawRectangle({
    x: marginX,
    y: featuredBottom,
    width: contentW,
    height: featuredH,
    borderColor: black,
    borderWidth: 1.4,
  });

  // Featured QR sits on the right; the text column fills the remaining width.
  const featQrSize = Math.min(mmToPt(32), featuredH - 2 * featPad - mmToPt(5));
  const featQrX = marginX + contentW - featPad - featQrSize;
  const featTextX = marginX + featPad;
  const featTextMaxW = featQrX - mmToPt(5) - featTextX;

  let featCursorY = featuredTop - featPad;

  // "FEATURED · DON'T MISS" eyebrow label.
  const featLabel = sanitizePdfText("FEATURED · DON'T MISS", fontBold);
  const featLabelSize = 7;
  page.drawText(featLabel, {
    x: featTextX,
    y: featCursorY - featLabelSize,
    size: featLabelSize,
    font: fontBold,
    color: muted,
  });
  featCursorY -= featLabelSize + mmToPt(2.5);

  // Featured name (large, bold, wrapped).
  const featNameResult = wrapTextLines({
    text: featured.name,
    maxWidth: featTextMaxW,
    font: fontBold,
    fontSize: 20,
    minFontSize: 12,
    maxHeight: featuredH * 0.4,
    leadingRatio: 1.05,
  });
  for (let li = 0; li < featNameResult.lines.length; li++) {
    page.drawText(featNameResult.lines[li], {
      x: featTextX,
      y: featCursorY - featNameResult.fontSize - li * featNameResult.lineHeight,
      size: featNameResult.fontSize,
      font: fontBold,
      color: black,
    });
  }
  featCursorY -= featNameResult.lines.length * featNameResult.lineHeight + mmToPt(2);

  // When line: date · time · price (bold).
  const featWhen = sanitizePdfText(
    `${featured.dateFormatted} · ${featured.time} · ${featured.price}`,
    fontBold,
  );
  const featWhenSize = 9;
  page.drawText(featWhen, {
    x: featTextX,
    y: featCursorY - featWhenSize,
    size: featWhenSize,
    font: fontBold,
    color: black,
  });
  featCursorY -= featWhenSize + mmToPt(2.5);

  // Description (with highlights appended), wrapped to fill remaining height.
  const featDescText = featured.highlights.length > 0
    ? `${featured.description}  ·  ${featured.highlights.join("  ·  ")}`
    : featured.description;
  const featDescMaxH = featCursorY - featuredBottom - featPad;
  if (featDescMaxH > 10 && featDescText.trim().length > 0) {
    const featDescResult = wrapTextLines({
      text: featDescText,
      maxWidth: featTextMaxW,
      font,
      fontSize: 8,
      minFontSize: 6,
      maxHeight: featDescMaxH,
      leadingRatio: 1.3,
    });
    for (let li = 0; li < featDescResult.lines.length; li++) {
      page.drawText(featDescResult.lines[li], {
        x: featTextX,
        y: featCursorY - featDescResult.fontSize - li * featDescResult.lineHeight,
        size: featDescResult.fontSize,
        font,
        color: muted,
      });
    }
  }

  // Featured QR (centred vertically) with "SCAN TO BOOK" caption beneath.
  if (featured.eventUrl) {
    const capSize = 6.5;
    const qrBlockY = featuredBottom + (featuredH - featQrSize - capSize - mmToPt(1.5)) / 2;
    try {
      const qrBytes = await qrPng(featured.eventUrl);
      const qrImage = await pdf.embedPng(qrBytes);
      page.drawImage(qrImage, {
        x: featQrX,
        y: qrBlockY + capSize + mmToPt(1.5),
        width: featQrSize,
        height: featQrSize,
      });
      const cap = "SCAN TO BOOK";
      const capW = fontBold.widthOfTextAtSize(cap, capSize);
      page.drawText(cap, {
        x: featQrX + (featQrSize - capW) / 2,
        y: qrBlockY,
        size: capSize,
        font: fontBold,
        color: black,
      });
    } catch {
      // QR generation failed; skip silently.
    }
  }

  // --- Upcoming events grid (up to three cards, After Hours .ev-grid) ---
  if (upcomingEvents.length === 0) return;

  const gridTop = featuredBottom - mmToPt(5);
  const gridBottom = bodyBottom;
  const gridCardH = gridTop - gridBottom;
  const gridGap = mmToPt(5);
  const gridCardW = (contentW - (upcomingEvents.length - 1) * gridGap) / upcomingEvents.length;
  const cardPad = mmToPt(4);

  for (let i = 0; i < upcomingEvents.length; i++) {
    const ev = upcomingEvents[i];
    const cardX = marginX + i * (gridCardW + gridGap);

    // Card border (1pt).
    page.drawRectangle({
      x: cardX,
      y: gridBottom,
      width: gridCardW,
      height: gridCardH,
      borderColor: black,
      borderWidth: 1,
    });

    const innerX = cardX + cardPad;
    const innerMaxW = gridCardW - 2 * cardPad;
    let cardCursorY = gridTop - cardPad;

    // Date line: "FRI 11 JUL" (bold uppercase).
    const dateLine = sanitizePdfText(
      `${ev.dayOfWeek} ${ev.dayNumber} ${ev.monthShort}`.toUpperCase(),
      fontBold,
    );
    const dateSize = 10;
    page.drawText(dateLine, {
      x: innerX,
      y: cardCursorY - dateSize,
      size: dateSize,
      font: fontBold,
      color: black,
    });
    cardCursorY -= dateSize + mmToPt(2);

    // Event name (bold, wrapped).
    const nameResult = wrapTextLines({
      text: ev.name,
      maxWidth: innerMaxW,
      font: fontBold,
      fontSize: 9,
      minFontSize: 7,
      maxHeight: gridCardH * 0.3,
      leadingRatio: 1.1,
    });
    for (let li = 0; li < nameResult.lines.length; li++) {
      page.drawText(nameResult.lines[li], {
        x: innerX,
        y: cardCursorY - nameResult.fontSize - li * nameResult.lineHeight,
        size: nameResult.fontSize,
        font: fontBold,
        color: black,
      });
    }
    cardCursorY -= nameResult.lines.length * nameResult.lineHeight + mmToPt(1.5);

    // Time · price (muted).
    const timePrice = sanitizePdfText(`${ev.time} · ${ev.price}`, font);
    const timePriceSize = 7.5;
    page.drawText(timePrice, {
      x: innerX,
      y: cardCursorY - timePriceSize,
      size: timePriceSize,
      font,
      color: muted,
    });
    cardCursorY -= timePriceSize + mmToPt(2);

    // QR row sits at the bottom of the card; the description fills the gap above.
    const smallQr = mmToPt(14);
    const qrRowY = gridBottom + cardPad;
    const descMaxH = cardCursorY - (qrRowY + smallQr) - mmToPt(1.5);
    if (descMaxH > 8 && ev.description.trim().length > 0) {
      const descResult = wrapTextLines({
        text: ev.description,
        maxWidth: innerMaxW,
        font,
        fontSize: 7.5,
        minFontSize: 6,
        maxHeight: descMaxH,
        leadingRatio: 1.25,
      });
      for (let li = 0; li < descResult.lines.length; li++) {
        page.drawText(descResult.lines[li], {
          x: innerX,
          y: cardCursorY - descResult.fontSize - li * descResult.lineHeight,
          size: descResult.fontSize,
          font,
          color: rgb(0.27, 0.27, 0.27),
        });
      }
    }

    // QR + "Scan to book" caption at the bottom-left of the card.
    if (ev.eventUrl) {
      try {
        const qrBytes = await qrPng(ev.eventUrl);
        const qrImage = await pdf.embedPng(qrBytes);
        page.drawImage(qrImage, { x: innerX, y: qrRowY, width: smallQr, height: smallQr });
        page.drawText("Scan to", {
          x: innerX + smallQr + mmToPt(2),
          y: qrRowY + smallQr / 2 + 1,
          size: 6.5,
          font: fontBold,
          color: muted,
        });
        page.drawText("book", {
          x: innerX + smallQr + mmToPt(2),
          y: qrRowY + smallQr / 2 - 7,
          size: 6.5,
          font: fontBold,
          color: muted,
        });
      } catch {
        // QR generation failed; skip silently.
      }
    }
  }
}

export async function loadDefaultLogoPngBytes(opts: PublicAssetLoadOptions = {}): Promise<Uint8Array | null> {
  return loadFirstExistingPublicImageAsBwPngBytes([
    "logo.png",
    "logo.jpg",
    "logo.jpeg",
    "logo.PNG",
    "logo.JPG",
    "logo.JPEG",
  ], opts);
}

export async function loadDefaultEventLogoPngBytes(opts: PublicAssetLoadOptions = {}): Promise<Uint8Array | null> {
  return loadFirstExistingPublicImageAsBwPngBytes([
    "event_logo.jpeg",
    "event_logo.jpg",
    "event_logo.png",
    "event_logo.webp",
    "event_logo.JPEG",
    "event_logo.JPG",
    "event_logo.PNG",
    "event_logo.WEBP",
  ], opts);
}

export function makeDefaultFilename(eventDate: string): string {
  return `music-bingo-${sanitizeFilenamePart(eventDate, "event")}.pdf`;
}

async function loadFirstExistingPublicImageAsBwPngBytes(
  names: string[],
  opts: PublicAssetLoadOptions = {}
): Promise<Uint8Array | null> {
  const publicDir = path.join(process.cwd(), "public");
  let caseInsensitiveMap: Map<string, string> | null = null;
  try {
    const entries = await fs.readdir(publicDir);
    caseInsensitiveMap = new Map(entries.map((name) => [name.toLowerCase(), name]));
  } catch {
    caseInsensitiveMap = null;
  }

  for (const name of names) {
    const actualName = caseInsensitiveMap?.get(name.toLowerCase()) ?? name;
    const logoPath = path.join(publicDir, actualName);
    try {
      const buf = await fs.readFile(logoPath);
      const processed = await convertLogoToPrintablePngBytes(buf);
      if (!processed) {
        console.warn(`[music-bingo] Logo looks blank after processing: public/${actualName}`);
        continue;
      }
      console.info(`[music-bingo] Loaded logo from filesystem: public/${actualName}`);
      return processed;
    } catch {
      // Don't warn here; this is expected if the file doesn't exist in a particular env.
      // We'll warn only if all candidates fail.
      // try next
    }
  }

  // Vercel/serverless note: `public/` may not be present in the function filesystem bundle.
  // Fallback: fetch static assets via the current origin and rasterize with sharp.
  const origin = (opts.origin ?? "").trim();
  if (origin) {
    for (const name of names) {
      const url = new URL(`/${name}`, origin);
      try {
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        const buf = Buffer.from(arr);
        const processed = await convertLogoToPrintablePngBytes(buf);
        if (!processed) {
          console.warn(`[music-bingo] Logo looks blank after processing: ${url.toString()}`);
          continue;
        }
        console.info(`[music-bingo] Loaded logo via fetch: ${url.toString()}`);
        return processed;
      } catch {
        // try next
      }
    }
  }

  console.warn(
    `[music-bingo] No logo found. Checked public/ (${names.join(", ")})${origin ? ` and ${origin}/...` : ""}`
  );
  return null;
}

async function convertLogoToPrintablePngBytes(input: Buffer): Promise<Uint8Array | null> {
  try {
    const base = sharp(input, { failOnError: false }).ensureAlpha();

    const baseStats = await base.clone().stats().catch(() => null);
    const alphaMean = baseStats?.channels?.[3]?.mean ?? 255;

    // Primary attempt: flatten onto white background.
    const onWhite = base.clone().flatten({ background: "#ffffff" }).grayscale().removeAlpha();
    const whiteStats = await onWhite.clone().stats().catch(() => null);
    const whiteMin = whiteStats?.channels?.[0]?.min ?? null;
    const whiteMax = whiteStats?.channels?.[0]?.max ?? null;
    const whiteMean = whiteStats?.channels?.[0]?.mean ?? null;

    // If the logo is white-on-transparent, flattening on white makes it invisible.
    // Detect "basically blank" by low contrast AND very bright mean.
    const looksBlankOnWhite =
      whiteMin !== null &&
      whiteMax !== null &&
      whiteMean !== null &&
      whiteMax - whiteMin < 8 &&
      whiteMean > 245;

    // If it's blank on white but also fully opaque, treat as unusable (likely white-on-white export).
    if (looksBlankOnWhite && alphaMean >= 250) return null;

    if (!looksBlankOnWhite) {
      const out = await onWhite.normalize().png().toBuffer();
      return new Uint8Array(out);
    }

    // Fallback: flatten on black and negate -> black logo on white page.
    const onBlackNegated = base
      .clone()
      .flatten({ background: "#000000" })
      .grayscale()
      .negate({ alpha: false })
      .removeAlpha();

    const blackStats = await onBlackNegated.clone().stats().catch(() => null);
    const blackMin = blackStats?.channels?.[0]?.min ?? null;
    const blackMax = blackStats?.channels?.[0]?.max ?? null;
    const blackMean = blackStats?.channels?.[0]?.mean ?? null;

    const looksBlankAfterNegate =
      blackMin !== null &&
      blackMax !== null &&
      blackMean !== null &&
      blackMax - blackMin < 8 &&
      blackMean > 245;

    if (looksBlankAfterNegate) return null;

    const out = await onBlackNegated.normalize().png().toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
