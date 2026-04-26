import fs from "node:fs/promises";
import path from "node:path";

import QRCode from "qrcode";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

import type { Card, FooterQrItem } from "@/lib/types";
import type { EventDetail } from "@/lib/managementApi";
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

function wrapTextLines(params: {
  text: string;
  maxWidth: number;
  font: any;
  fontSize: number;
  minFontSize: number;
  maxHeight: number;
  leadingRatio: number;
}): { lines: string[]; fontSize: number; lineHeight: number } {
  const { text, maxWidth, font, minFontSize, maxHeight, leadingRatio } = params;
  const paragraphs = text
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

  // Landscape A4: swap width and height
  const pageW = A4_HEIGHT; // 842
  const pageH = A4_WIDTH;  // 595

  const marginX = mmToPt(14);
  const marginY = mmToPt(10);
  const headerH = mmToPt(28);
  const colGap = mmToPt(8);
  const rowGap = mmToPt(6);
  const cardIdSpace = mmToPt(4); // space below grid for card ID text

  const COLS = 3;
  const ROWS = 2;
  const CARDS_PER_PAGE = COLS * ROWS;
  const GRID_COLS = 5;
  const GRID_ROWS = 3;

  const availableW = pageW - 2 * marginX - (COLS - 1) * colGap;
  const availableH = pageH - 2 * marginY - headerH - (ROWS - 1) * rowGap - ROWS * cardIdSpace;
  const cardW = availableW / COLS;
  const cardH = availableH / ROWS;
  const cellW = cardW / GRID_COLS;
  const cellH = cardH / GRID_ROWS;

  const logoLeftImage =
    opts.logoLeftPngBytes && opts.logoLeftPngBytes.length ? await pdf.embedPng(opts.logoLeftPngBytes) : null;
  const logoRightImage =
    opts.logoRightPngBytes && opts.logoRightPngBytes.length ? await pdf.embedPng(opts.logoRightPngBytes) : null;

  const showCardId = opts.showCardId ?? true;
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdf.addPage([pageW, pageH]);

    // --- Header ---
    const headerTop = pageH - marginY;
    const headerBottom = headerTop - headerH;

    // Logos
    const logoMaxH = headerH * 0.65;
    const headerLeft = marginX;
    const headerRight = pageW - marginX;
    const logoMaxW = (headerRight - headerLeft) / 2 - mmToPt(20);

    if (logoLeftImage) {
      const scale = Math.min(logoMaxW / logoLeftImage.width, logoMaxH / logoLeftImage.height);
      const w = logoLeftImage.width * scale;
      const h = logoLeftImage.height * scale;
      page.drawImage(logoLeftImage, {
        x: headerLeft,
        y: headerTop - h,
        width: w,
        height: h,
      });
    }

    if (logoRightImage) {
      const scale = Math.min(logoMaxW / logoRightImage.width, logoMaxH / logoRightImage.height);
      const w = logoRightImage.width * scale;
      const h = logoRightImage.height * scale;
      page.drawImage(logoRightImage, {
        x: headerRight - w,
        y: headerTop - h,
        width: w,
        height: h,
      });
    }

    // "MUSIC BINGO" centred 18pt bold
    const titleText = "MUSIC BINGO";
    const titleSize = 18;
    const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
      x: (pageW - titleW) / 2,
      y: headerTop - titleSize - 2,
      size: titleSize,
      font: fontBold,
      color: black,
    });

    // Theme centred 10pt bold
    if (opts.theme) {
      const themeSize = 10;
      const themeW = fontBold.widthOfTextAtSize(opts.theme, themeSize);
      page.drawText(opts.theme, {
        x: (pageW - themeW) / 2,
        y: headerTop - titleSize - themeSize - 4,
        size: themeSize,
        font: fontBold,
        color: black,
      });
    }

    // Date centred 9pt bold
    if (opts.eventDate) {
      const dateSize = 9;
      const dateW = fontBold.widthOfTextAtSize(opts.eventDate, dateSize);
      page.drawText(opts.eventDate, {
        x: (pageW - dateW) / 2,
        y: headerBottom + 2,
        size: dateSize,
        font: fontBold,
        color: black,
      });
    }

    // --- Cards ---
    for (let ci = 0; ci < CARDS_PER_PAGE; ci++) {
      const cardIdx = pageIdx * CARDS_PER_PAGE + ci;
      if (cardIdx >= cards.length) break;
      const card = cards[cardIdx];

      const colIdx = ci % COLS;
      const rowIdx = Math.floor(ci / COLS);

      const gridX = marginX + colIdx * (cardW + colGap);
      const gridY = headerBottom - marginY - rowIdx * (cardH + rowGap + cardIdSpace) - cardH;

      // Outer border 1.5pt
      page.drawRectangle({
        x: gridX,
        y: gridY,
        width: cardW,
        height: cardH,
        borderColor: black,
        borderWidth: 1.5,
      });

      // Inner vertical lines 1pt
      for (let c = 1; c < GRID_COLS; c++) {
        page.drawLine({
          start: { x: gridX + c * cellW, y: gridY },
          end: { x: gridX + c * cellW, y: gridY + cardH },
          thickness: 1,
          color: black,
        });
      }

      // Inner horizontal lines 1pt
      for (let r = 1; r < GRID_ROWS; r++) {
        page.drawLine({
          start: { x: gridX, y: gridY + r * cellH },
          end: { x: gridX + cardW, y: gridY + r * cellH },
          thickness: 1,
          color: black,
        });
      }

      // Cell text
      const padding = 2;
      for (let idx = 0; idx < GRID_COLS * GRID_ROWS; idx++) {
        const row = Math.floor(idx / GRID_COLS);
        const col = idx % GRID_COLS;
        const cX = gridX + col * cellW;
        const cY = gridY + (GRID_ROWS - 1 - row) * cellH; // row 0 at top = highest Y
        const text = card.items[idx] ?? "";
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

      // Card ID below grid
      if (showCardId) {
        const label = `Card ${String(cardIdx + 1).padStart(3, "0")} • ${card.cardId}`;
        const idSize = 6;
        const labelW = font.widthOfTextAtSize(label, idSize);
        const labelX = gridX + (cardW - labelW) / 2;
        page.drawText(label, {
          x: labelX,
          y: gridY - idSize - 2,
          size: idSize,
          font,
          color: black,
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
  events: EventDetail[];
  logoLeftPngBytes?: Uint8Array | null;
  logoRightPngBytes?: Uint8Array | null;
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

  const grey = rgb(0.4, 0.4, 0.4);
  const lightGrey = rgb(0.75, 0.75, 0.75);
  const black = rgb(0, 0, 0);

  const page = pdf.addPage([pageW, pageH]);

  const contentTop = pageH - marginY;
  const contentBottom = marginY;

  // --- Header ---
  const headerTextY = contentTop - 22;
  page.drawText("What's On", {
    x: marginX,
    y: headerTextY,
    size: 22,
    font: fontBold,
    color: black,
  });

  const whatsOnW = fontBold.widthOfTextAtSize("What's On", 22);
  page.drawText("AT THE ANCHOR", {
    x: marginX + whatsOnW + 8,
    y: headerTextY + 4,
    size: 8,
    font: fontBold,
    color: black,
  });

  const siteUrl = "the-anchor.pub";
  const siteUrlW = font.widthOfTextAtSize(siteUrl, 8);
  page.drawText(siteUrl, {
    x: pageW - marginX - siteUrlW,
    y: headerTextY + 4,
    size: 8,
    font,
    color: black,
  });

  // 2pt horizontal rule below header
  const headerRuleY = headerTextY - 6;
  page.drawLine({
    start: { x: marginX, y: headerRuleY },
    end: { x: pageW - marginX, y: headerRuleY },
    thickness: 2,
    color: black,
  });

  // --- Footer ---
  const footerText = "the-anchor.pub  \u00b7  @theanchor.pub  \u00b7  01753 682707  \u00b7  #theanchor";
  const footerSize = 7;
  const footerRuleY = contentBottom + 14;
  page.drawLine({
    start: { x: marginX, y: footerRuleY },
    end: { x: pageW - marginX, y: footerRuleY },
    thickness: 0.5,
    color: lightGrey,
  });
  const footerW = font.widthOfTextAtSize(footerText, footerSize);
  page.drawText(footerText, {
    x: (pageW - footerW) / 2,
    y: contentBottom + 3,
    size: footerSize,
    font,
    color: grey,
  });

  const bodyTop = headerRuleY - 8;
  const bodyBottom = footerRuleY + 8;
  const bodyH = bodyTop - bodyBottom;

  // --- No events ---
  if (!opts.events || opts.events.length === 0) {
    const msg = "Visit the-anchor.pub for upcoming events";
    const msgSize = 14;
    const msgW = font.widthOfTextAtSize(msg, msgSize);
    page.drawText(msg, {
      x: (pageW - msgW) / 2,
      y: bodyBottom + bodyH / 2 - msgSize / 2,
      size: msgSize,
      font,
      color: grey,
    });
    return;
  }

  // --- Left panel: featured event ---
  const leftPanelW = mmToPt(60);
  const leftX = marginX;
  const rightPanelX = leftX + leftPanelW + mmToPt(6);
  const _rightPanelW = pageW - marginX - rightPanelX;

  const featured = opts.events[0];
  const timelineEvents = opts.events.slice(1, 12); // up to 11

  // Left panel border
  page.drawRectangle({
    x: leftX,
    y: bodyBottom,
    width: leftPanelW,
    height: bodyH,
    borderColor: black,
    borderWidth: 1.5,
  });

  const panelPad = 6;
  let cursorY = bodyTop - panelPad;

  // "NEXT EVENT" label
  const nextEvtSize = 6.5;
  page.drawText("NEXT EVENT", {
    x: leftX + panelPad,
    y: cursorY - nextEvtSize,
    size: nextEvtSize,
    font: fontBold,
    color: black,
  });
  // underline
  const neW = fontBold.widthOfTextAtSize("NEXT EVENT", nextEvtSize);
  page.drawLine({
    start: { x: leftX + panelPad, y: cursorY - nextEvtSize - 1 },
    end: { x: leftX + panelPad + neW, y: cursorY - nextEvtSize - 1 },
    thickness: 0.5,
    color: black,
  });
  cursorY -= nextEvtSize + 8;

  // Featured event name (15pt bold, wrapped)
  const featNameMaxW = leftPanelW - 2 * panelPad;
  const featNameResult = wrapTextLines({
    text: featured.name,
    maxWidth: featNameMaxW,
    font: fontBold,
    fontSize: 15,
    minFontSize: 10,
    maxHeight: 60,
    leadingRatio: 1.2,
  });
  for (let li = 0; li < featNameResult.lines.length; li++) {
    const lineY = cursorY - li * featNameResult.lineHeight;
    page.drawText(featNameResult.lines[li], {
      x: leftX + panelPad,
      y: lineY - featNameResult.fontSize,
      size: featNameResult.fontSize,
      font: fontBold,
      color: black,
    });
  }
  cursorY -= featNameResult.lines.length * featNameResult.lineHeight + 6;

  // Date + time (7.5pt bold)
  const featDateTime = `${featured.dateFormatted} \u2022 ${featured.time}`;
  page.drawText(featDateTime, {
    x: leftX + panelPad,
    y: cursorY - 7.5,
    size: 7.5,
    font: fontBold,
    color: black,
  });
  cursorY -= 14;

  // Price (7pt grey)
  page.drawText(featured.price, {
    x: leftX + panelPad,
    y: cursorY - 7,
    size: 7,
    font,
    color: grey,
  });
  cursorY -= 12;

  // Description + highlights
  const descMaxH = cursorY - bodyBottom - panelPad - mmToPt(28); // leave room for larger QR
  if (descMaxH > 10) {
    // Description text
    const descResult = wrapTextLines({
      text: featured.description,
      maxWidth: featNameMaxW,
      font,
      fontSize: 7,
      minFontSize: 5,
      maxHeight: descMaxH * 0.4,
      leadingRatio: 1.3,
    });
    for (let li = 0; li < descResult.lines.length; li++) {
      const lineY = cursorY - li * descResult.lineHeight;
      page.drawText(descResult.lines[li], {
        x: leftX + panelPad,
        y: lineY - descResult.fontSize,
        size: descResult.fontSize,
        font,
        color: black,
      });
    }
    cursorY -= descResult.lines.length * descResult.lineHeight + 6;

    // Highlights as bullet points
    if (featured.highlights.length > 0) {
      const bulletMaxH = cursorY - bodyBottom - panelPad - mmToPt(28);
      const bulletSize = 6.5;
      const bulletLineH = font.heightAtSize(bulletSize) * 1.3;
      const maxBullets = Math.min(featured.highlights.length, Math.floor(bulletMaxH / bulletLineH));
      for (let bi = 0; bi < maxBullets; bi++) {
        const bulletText = `•  ${featured.highlights[bi]}`;
        const bulletResult = wrapTextLines({
          text: bulletText,
          maxWidth: featNameMaxW,
          font,
          fontSize: bulletSize,
          minFontSize: 5,
          maxHeight: bulletLineH * 2,
          leadingRatio: 1.2,
        });
        for (let li = 0; li < bulletResult.lines.length; li++) {
          const lineY = cursorY - li * bulletResult.lineHeight;
          page.drawText(bulletResult.lines[li], {
            x: leftX + panelPad,
            y: lineY - bulletResult.fontSize,
            size: bulletResult.fontSize,
            font,
            color: grey,
          });
        }
        cursorY -= bulletResult.lines.length * bulletResult.lineHeight;
      }
    }
  }

  // QR code at bottom of left panel
  if (featured.eventUrl) {
    const qrSize = mmToPt(22);
    const qrY = bodyBottom + panelPad;
    const qrX = leftX + panelPad;
    try {
      const qrBytes = await qrPng(featured.eventUrl);
      const qrImage = await pdf.embedPng(qrBytes);
      page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      // "Scan to book" label
      page.drawText("Scan to book", {
        x: qrX + qrSize + 4,
        y: qrY + qrSize / 2 - 3,
        size: 6,
        font,
        color: grey,
      });
    } catch {
      // QR generation failed; skip silently
    }
  }

  // --- Right panel: timeline ---
  if (timelineEvents.length === 0) return;

  const rowH = bodyH / Math.min(timelineEvents.length, 11);
  const dateBlockW = mmToPt(16);
  const dividerX = rightPanelX + dateBlockW + 4;
  const detailX = dividerX + 6;
  const qrColW = mmToPt(16);
  const detailMaxW = pageW - marginX - qrColW - detailX - 4;

  for (let i = 0; i < timelineEvents.length; i++) {
    const ev = timelineEvents[i];
    const rowTop = bodyTop - i * rowH;
    const rowBottom = rowTop - rowH;

    // Horizontal divider between rows (not above first)
    if (i > 0) {
      page.drawLine({
        start: { x: rightPanelX, y: rowTop },
        end: { x: pageW - marginX, y: rowTop },
        thickness: 0.5,
        color: lightGrey,
      });
    }

    const rowCenterY = rowBottom + rowH / 2;

    // Date block: day-of-week (5.5pt grey uppercase)
    page.drawText(ev.dayOfWeek.toUpperCase(), {
      x: rightPanelX,
      y: rowCenterY + 10,
      size: 5.5,
      font,
      color: grey,
    });

    // Day number (20pt bold)
    const dayNumW = fontBold.widthOfTextAtSize(ev.dayNumber, 20);
    page.drawText(ev.dayNumber, {
      x: rightPanelX + (dateBlockW - dayNumW) / 2,
      y: rowCenterY - 6,
      size: 20,
      font: fontBold,
      color: black,
    });

    // Month (6.5pt bold uppercase)
    page.drawText(ev.monthShort.toUpperCase(), {
      x: rightPanelX,
      y: rowCenterY - 16,
      size: 6.5,
      font: fontBold,
      color: black,
    });

    // Vertical divider
    page.drawLine({
      start: { x: dividerX, y: rowTop - 4 },
      end: { x: dividerX, y: rowBottom + 4 },
      thickness: 0.5,
      color: lightGrey,
    });

    // Event name (8.5pt bold)
    const nameResult = wrapTextLines({
      text: ev.name,
      maxWidth: detailMaxW,
      font: fontBold,
      fontSize: 8.5,
      minFontSize: 6,
      maxHeight: rowH * 0.4,
      leadingRatio: 1.15,
    });
    for (let li = 0; li < nameResult.lines.length; li++) {
      page.drawText(nameResult.lines[li], {
        x: detailX,
        y: rowCenterY + 8 - li * nameResult.lineHeight,
        size: nameResult.fontSize,
        font: fontBold,
        color: black,
      });
    }

    // Time + price (6.5pt grey)
    const timePriceText = `${ev.time} \u2022 ${ev.price}`;
    page.drawText(timePriceText, {
      x: detailX,
      y: rowCenterY - 4,
      size: 6.5,
      font,
      color: grey,
    });

    // Description + highlights (6.5pt, wrapped)
    const timelineDesc = ev.highlights.length > 0
      ? `${ev.description}  ·  ${ev.highlights.join("  ·  ")}`
      : ev.description;
    const descResult2 = wrapTextLines({
      text: timelineDesc,
      maxWidth: detailMaxW,
      font,
      fontSize: 6.5,
      minFontSize: 5,
      maxHeight: rowH * 0.35,
      leadingRatio: 1.1,
    });
    for (let li = 0; li < descResult2.lines.length; li++) {
      page.drawText(descResult2.lines[li], {
        x: detailX,
        y: rowCenterY - 14 - li * descResult2.lineHeight,
        size: descResult2.fontSize,
        font,
        color: black,
      });
    }

    // QR code (14mm)
    if (ev.eventUrl) {
      const smallQr = mmToPt(14);
      const qrX2 = pageW - marginX - smallQr;
      const qrY2 = rowCenterY - smallQr / 2;
      try {
        const qrBytes = await qrPng(ev.eventUrl);
        const qrImage = await pdf.embedPng(qrBytes);
        page.drawImage(qrImage, { x: qrX2, y: qrY2, width: smallQr, height: smallQr });
      } catch {
        // skip
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
