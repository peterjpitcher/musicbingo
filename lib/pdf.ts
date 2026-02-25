import fs from "node:fs/promises";
import path from "node:path";

import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

import type { Card, FooterQrItem } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

type RenderOptions = {
  eventDate: string;
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

  const marginX = mmToPt(14);
  const marginY = mmToPt(12);
  const gap = mmToPt(6);
  const headerH = mmToPt(34);
  const footerH = mmToPt(38);
  const qrSizeBase = mmToPt(26);

  const squareSize = Math.min(
    (A4_HEIGHT - 2 * marginY - headerH - footerH - gap) / 2,
    A4_WIDTH - 2 * marginX
  );
  const contentX = (A4_WIDTH - squareSize) / 2;
  const topGridY = A4_HEIGHT - marginY - headerH - squareSize;
  const bottomGridY = topGridY - gap - squareSize;

  const logoLeftImage =
    opts.logoLeftPngBytes && opts.logoLeftPngBytes.length ? await pdf.embedPng(opts.logoLeftPngBytes) : null;
  const logoRightImage =
    opts.logoRightPngBytes && opts.logoRightPngBytes.length ? await pdf.embedPng(opts.logoRightPngBytes) : null;

  const footerItems: FooterQrItem[] = (opts.footerItems ?? []).slice(0, 4);
  if (footerItems.length === 0) {
    footerItems.push({ label: "QR", url: null });
  }

  const footerQrImages = await Promise.all(
    footerItems.map(async (item) => (item.url ? await pdf.embedPng(await qrPng(item.url)) : null))
  );

  const drawCenteredText = (page: any, text: string, y: number, size: number, bold = false) => {
    const f = bold ? fontBold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (A4_WIDTH - w) / 2, y, size, font: f, color: black });
  };

  const drawGrid = (page: any, params: { items: string[]; x: number; y: number; size: number; title: string }) => {
    const { items, x, y, size, title } = params;
    page.drawText(title, { x, y: y + size + 6, size: 11, font: fontBold, color: black });

    page.drawRectangle({ x, y, width: size, height: size, borderColor: black, borderWidth: 1 });
    const cell = size / 5;
    for (let i = 1; i < 5; i++) {
      page.drawLine({ start: { x: x + i * cell, y }, end: { x: x + i * cell, y: y + size }, thickness: 1, color: black });
      page.drawLine({ start: { x, y: y + i * cell }, end: { x: x + size, y: y + i * cell }, thickness: 1, color: black });
    }

    const padding = 2;
    for (let idx = 0; idx < 25; idx++) {
      const row = Math.floor(idx / 5);
      const col = idx % 5;
      const cellX = x + col * cell;
      const cellY = y + (4 - row) * cell;
      const text = items[idx] ?? "";
      const innerW = cell - 2 * padding;
      const innerH = cell - 2 * padding;

      const { lines, fontSize, lineHeight } = wrapTextLines({
        text,
        maxWidth: innerW,
        maxHeight: innerH,
        font,
        fontSize: 9,
        minFontSize: 6,
        leadingRatio: 1.15,
      });

      const totalH = lines.length * lineHeight;
      const blockBottom = cellY + padding + (innerH - totalH) / 2;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const lineW = font.widthOfTextAtSize(line, fontSize);
        const lineX = cellX + padding + (innerW - lineW) / 2;
        const lineY = blockBottom + (lines.length - 1 - li) * lineHeight;
        page.drawText(line, { x: lineX, y: lineY, size: fontSize, font, color: black });
      }
    }
  };

  const drawFooter = (page: any) => {
    const count = footerItems.length;
    const blockW = (A4_WIDTH - 2 * marginX) / count;
    const qrSize = Math.min(qrSizeBase, blockW - mmToPt(10));
    const labelSize = 7;
    const labelBoxBottom = marginY + 2;
    const qrY = marginY + 28;
    const labelBoxHeight = qrY - labelBoxBottom - 2;

    const drawQrBlock = (i: number, label: string, image: any | null) => {
      const blockX0 = marginX + i * blockW;
      const centerX = blockX0 + blockW / 2;
      const qrX = blockX0 + (blockW - qrSize) / 2;

      const { lines, fontSize, lineHeight } = wrapTextLines({
        text: label,
        maxWidth: blockW - 8,
        maxHeight: labelBoxHeight,
        font,
        fontSize: labelSize,
        minFontSize: 5,
        leadingRatio: 1.05,
      });

      const totalH = lines.length * lineHeight;
      const blockBottom = labelBoxBottom + (labelBoxHeight - totalH) / 2;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const lineW = font.widthOfTextAtSize(line, fontSize);
        const lineX = centerX - lineW / 2;
        const lineY = blockBottom + (lines.length - 1 - li) * lineHeight;
        page.drawText(line, { x: lineX, y: lineY, size: fontSize, font, color: black });
      }

      if (!image) {
        page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, borderColor: black, borderWidth: 1 });
        const msg = "QR unavailable";
        const msgSize = 7;
        const msgW = font.widthOfTextAtSize(msg, msgSize);
        page.drawText(msg, { x: centerX - msgW / 2, y: qrY + qrSize / 2 - msgSize / 2, size: msgSize, font, color: black });
        return;
      }

      page.drawImage(image, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    };

    for (let i = 0; i < count; i++) {
      const item = footerItems[i];
      drawQrBlock(i, item.label, footerQrImages[i] ?? null);
    }
  };

  const showCardId = opts.showCardId ?? true;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);

    const headerY0 = A4_HEIGHT - marginY - headerH;

    if (logoLeftImage || logoRightImage) {
      const maxH = headerH * 0.65;
      const eventLogoScale = 1.5;
      const headerLeft = marginX;
      const headerRight = A4_WIDTH - marginX;
      const maxWEach = (headerRight - headerLeft) / 2 - mmToPt(6);

      if (logoLeftImage) {
        const scale = Math.min(maxWEach / logoLeftImage.width, maxH / logoLeftImage.height) * eventLogoScale;
        const w = logoLeftImage.width * scale;
        const h = logoLeftImage.height * scale;
        page.drawImage(logoLeftImage, {
          x: headerLeft,
          y: headerY0 + headerH - h,
          width: w,
          height: h,
        });
      }

      if (logoRightImage) {
        const scale = Math.min(maxWEach / logoRightImage.width, maxH / logoRightImage.height);
        const w = logoRightImage.width * scale;
        const h = logoRightImage.height * scale;
        page.drawImage(logoRightImage, {
          x: headerRight - w,
          y: headerY0 + headerH - h,
          width: w,
          height: h,
        });
      }
    } else {
      drawCenteredText(page, "MUSIC BINGO", headerY0 + headerH * 0.62, 18, true);
    }

    drawCenteredText(page, opts.eventDate, headerY0 + headerH * 0.18, 12, true);

    drawGrid(page, { items: card.artists, x: contentX, y: topGridY, size: squareSize, title: "Artists" });
    drawGrid(page, { items: card.titles, x: contentX, y: bottomGridY, size: squareSize, title: "Song Titles" });

    drawFooter(page);

    if (showCardId) {
      const label = `Card ${String(i + 1).padStart(3, "0")} • ${card.cardId}`;
      const size = 8;
      const w = font.widthOfTextAtSize(label, size);
      // Place the card ID 4 pt above the absolute page bottom to stay inside
      // the printable area on all common A4 laser printers (≥ 4 mm margin).
      page.drawText(label, { x: A4_WIDTH - marginX - w, y: mmToPt(4), size, font, color: black });
    }
  }

  const bytes = await pdf.save();
  return bytes;
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
