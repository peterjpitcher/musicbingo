import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";

import { formatEventDateWithWeekdayDisplay } from "@/lib/eventDate";
import { normalizeGameTheme } from "@/lib/gameInput";
import { DEFAULT_REVEAL_CONFIG, makeRevealConfigForSongPlayMs } from "@/lib/live/types";
import type { RevealConfig } from "@/lib/live/types";
import type { NormalisedEvent } from "@/lib/eventFeed";
import type { BrandConfig } from "@/lib/brands/types";
import { sanitizeFilenamePart } from "@/lib/utils";
import type { Song } from "@/lib/types";

type IntroSongEntry = {
  type: string;
  artist: string;
  title: string;
};

type RunSheetGame = {
  theme: string;
  songs: Song[];
  challengeSongs: Song[];
  introSong?: Song;
  challengeTypes?: string[];
  introSongs?: IntroSongEntry[];
};

export type RenderRunSheetPdfParams = {
  eventDateInput: string;
  game1: RunSheetGame;
  game2: RunSheetGame;
  upcomingEvents?: NormalisedEvent[];
  normalSongSeconds?: number;
  brandConfig?: BrandConfig | null;
  logoPngBytes?: Uint8Array | null;
  hostName?: string;
  eventName?: string;
  eventTime?: string;
  kitchenCloses?: string;
};

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 18 * MM;
const MARGIN_TOP = 16 * MM;
const MARGIN_BOTTOM = 16 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const BLACK = rgb(0, 0, 0);
const MUTE = rgb(0.33, 0.33, 0.33);
const BODY = rgb(0.1, 0.1, 0.1);
const LIGHT_RULE = rgb(0.72, 0.72, 0.72);
const WHITE = rgb(1, 1, 1);

type FontPair = { regular: PDFFont; bold: PDFFont };

type ScheduleRow = { title: string; note: string; time: string };

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

function challengeTypeLabel(type: string): string {
  switch (type) {
    case "dance-along":
      return "Dance-along";
    case "sing-along":
      return "Sing-along";
    default:
      return type
        .split("-")
        .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join("-");
  }
}

function sanitizeText(input: string, font: PDFFont): string {
  const replaced = input
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[ ]/g, " ")
    .replace(/[•·]/g, "-")
    .replace(/[…]/g, "...");

  let safe = "";
  for (const ch of replaced) {
    try {
      font.widthOfTextAtSize(ch, 12);
      safe += ch;
    } catch {
      safe += " ";
    }
  }

  return safe.replace(/\s+/g, " ").trim();
}

function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = sanitizeText(text, font);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let cut = safe;
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut.length > 0 ? `${cut}...` : "";
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = sanitizeText(text, font);
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    current = font.widthOfTextAtSize(word, size) <= maxWidth
      ? word
      : ellipsize(word, font, size, maxWidth);
  }
  if (current) lines.push(current);
  return lines;
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function gameCountLabel(game1: RunSheetGame, game2: RunSheetGame): string {
  const g1 = game1.songs.length;
  const g2 = game2.songs.length;
  if (g1 > 0 && g1 === g2) return `2 x ${g1} songs`;
  if (g1 > 0 || g2 > 0) return `G1 ${g1 || "-"} / G2 ${g2 || "-"} songs`;
  return "2 x 50 songs";
}

function firstIntroSong(params: RenderRunSheetPdfParams): Song | undefined {
  return params.game1.introSong ?? params.game2.introSong;
}

function buildSchedule(params: RenderRunSheetPdfParams, game1Theme: string, game2Theme: string): ScheduleRow[] {
  const intro = firstIntroSong(params);
  const introDetail = intro
    ? `Nikki enters to ${songLabel(intro)} (plays in full)`
    : "Nikki enters to the intro track (plays in full)";

  const g1Challenge = params.game1.challengeTypes?.[0] ?? "dance-along";
  const g2Challenge = params.game2.challengeTypes?.[0] ?? "sing-along";

  return [
    { title: "Welcome & intro song", note: introDetail, time: "8:00 pm" },
    { title: "Tonight's running order", note: "Show the night's plan on screen", time: "8:05 pm" },
    { title: "Quiz - Round 1", note: "KaraFun mobile quiz - phones out", time: "8:08 pm" },
    { title: "Music Bingo title", note: "Logo reveal - hype it up", time: "8:25 pm" },
    { title: "House rules", note: "Explain how to play & how to win", time: "8:27 pm" },
    { title: `${challengeTypeLabel(g1Challenge)} warm up`, note: "Full song - get the room moving", time: "8:30 pm" },
    { title: "Music Bingo - Game 1", note: `${game1Theme} - lines & full house`, time: "8:34 pm" },
    { title: "Interval", note: "Break - bar refills (~10 min)", time: "9:10 pm" },
    { title: "Quiz - Round 2", note: "KaraFun mobile quiz round two", time: "9:20 pm" },
    { title: `${challengeTypeLabel(g2Challenge)} warm up`, note: "Full song - big sing-along", time: "9:35 pm" },
    { title: "Music Bingo - Game 2", note: `${game2Theme} - different song list`, time: "9:39 pm" },
    { title: "Winners", note: "1st place + wooden spoon (2nd from last)", time: "10:15 pm" },
    { title: "Thank you & reviews", note: "Google review QR + next event", time: "10:20 pm" },
  ];
}

class Doc {
  private readonly pdf: PDFDocument;
  private readonly fonts: FontPair;
  page: PDFPage;
  y: number;

  constructor(pdf: PDFDocument, fonts: FontPair) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.page = pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_TOP;
  }

  newPage(): void {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_TOP;
  }

  ensure(needed: number): void {
    if (this.y - needed < MARGIN_BOTTOM) this.newPage();
  }

  moveDown(points: number): void {
    this.y -= points;
  }

  fontFor(bold: boolean): PDFFont {
    return bold ? this.fonts.bold : this.fonts.regular;
  }

  text(raw: string, opts: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number }): void {
    const font = this.fontFor(Boolean(opts.bold));
    const safe = sanitizeText(raw, font);
    this.page.drawText(safe, {
      x: opts.x ?? MARGIN_X,
      y: this.y,
      size: opts.size,
      font,
      color: opts.color ?? BLACK,
    });
  }

  rule(opts: { y?: number; thickness?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number }): void {
    const y = opts.y ?? this.y;
    const x = opts.x ?? MARGIN_X;
    const width = opts.width ?? CONTENT_W;
    this.page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: opts.thickness ?? 1,
      color: opts.color ?? BLACK,
    });
  }
}

function drawLogo(page: PDFPage, logo: PDFImage | null, x: number, y: number, maxW: number, maxH: number): void {
  if (!logo) return;
  const scale = Math.min(maxW / logo.width, maxH / logo.height);
  const w = logo.width * scale;
  const h = logo.height * scale;
  page.drawImage(logo, { x: x - w, y, width: w, height: h });
}

function drawHeader(doc: Doc, params: RenderRunSheetPdfParams, logo: PDFImage | null, eventDate: string): void {
  const hostName = sanitizeText(params.hostName?.trim() || "Nikki", doc.fontFor(true));
  const eventName = sanitizeText(params.eventName?.trim() || "Music Bingo with Nikki", doc.fontFor(true));
  const venueName = sanitizeText(params.brandConfig?.name?.trim() || "The Anchor", doc.fontFor(true));
  const eventTime = sanitizeText(params.eventTime?.trim() || "8:00 pm - 12:00 am", doc.fontFor(true));

  const titleY = PAGE_H - 34 * MM;
  doc.y = titleY;
  doc.text("EVENT CLIPBOARD", { size: 36, bold: true });
  doc.y -= 16;
  doc.text(`${eventName} - ${hostName}`.toUpperCase(), { size: 8.5, bold: true, color: MUTE });

  drawLogo(doc.page, logo, PAGE_W - MARGIN_X, titleY - 10, 36 * MM, 16 * MM);

  const metaY = titleY - 34;
  const labels = [
    { label: "VENUE", value: venueName, x: MARGIN_X },
    { label: "DATE", value: eventDate || "-", x: MARGIN_X + 36 * MM },
    { label: "TIME", value: eventTime, x: MARGIN_X + 100 * MM },
  ];
  for (const item of labels) {
    doc.page.drawText(item.label, {
      x: item.x,
      y: metaY,
      size: 6.5,
      font: doc.fontFor(true),
      color: MUTE,
    });
    doc.page.drawText(ellipsize(item.value, doc.fontFor(true), 9, 58 * MM), {
      x: item.x,
      y: metaY - 12,
      size: 9,
      font: doc.fontFor(true),
      color: BLACK,
    });
  }

  const ruleY = metaY - 22;
  doc.rule({ y: ruleY, thickness: 2.5 });
  doc.y = ruleY - 26;
}

function drawBadgeRow(doc: Doc, params: RenderRunSheetPdfParams, normalReveal: RevealConfig): void {
  const challengeReveal = makeRevealConfigForSongPlayMs(90_000);
  const badges = [
    { label: "Games", value: gameCountLabel(params.game1, params.game2) },
    { label: "Song length", value: `~${formatSeconds(normalReveal.nextMs)}` },
    {
      label: "Reveals",
      value: `album ${formatSeconds(normalReveal.albumMs)} - title ${formatSeconds(normalReveal.titleMs)} - artist ${formatSeconds(normalReveal.artistMs)}`,
    },
    { label: "Challenge song", value: formatSeconds(challengeReveal.nextMs) },
    { label: "Kitchen closes", value: params.kitchenCloses?.trim() || "9 pm" },
  ];

  const colW = CONTENT_W / badges.length;
  const labelSize = 7.2;
  const valueSize = 8;
  doc.ensure(34);
  for (let i = 0; i < badges.length; i++) {
    const x = MARGIN_X + i * colW;
    doc.page.drawText(`${badges[i]!.label}:`, {
      x,
      y: doc.y,
      size: labelSize,
      font: doc.fontFor(true),
      color: BLACK,
    });
    const lines = wrapLines(badges[i]!.value, doc.fontFor(false), valueSize, colW - 5);
    for (let li = 0; li < Math.min(lines.length, 2); li++) {
      doc.page.drawText(lines[li]!, {
        x,
        y: doc.y - 10 - li * 9,
        size: valueSize,
        font: doc.fontFor(false),
        color: BODY,
      });
    }
  }
  doc.moveDown(36);
}

function drawRunningOrder(doc: Doc, rows: ScheduleRow[]): void {
  doc.ensure(235);
  const headingY = doc.y;
  doc.text("RUNNING", { size: 17, bold: true });
  doc.y -= 16;
  doc.text("ORDER", { size: 17, bold: true });
  const source = "PULLED LIVE FROM EVENTS";
  const sourceW = doc.fontFor(true).widthOfTextAtSize(source, 7);
  doc.page.drawCircle({
    x: PAGE_W - MARGIN_X - sourceW - 10,
    y: headingY - 2,
    size: 2.2,
    color: BLACK,
  });
  doc.page.drawText(source, {
    x: PAGE_W - MARGIN_X - sourceW,
    y: headingY - 5,
    size: 7,
    font: doc.fontFor(true),
    color: MUTE,
  });
  doc.rule({ y: headingY - 23, thickness: 1 });
  doc.y = headingY - 38;

  const numW = 9 * MM;
  const timeW = 18 * MM;
  const textX = MARGIN_X + numW;
  const textW = CONTENT_W - numW - timeW - 4 * MM;
  const rowSize = 8.2;
  const lineH = 10;

  rows.forEach((row, index) => {
    const combined = `${row.title} - ${row.note}`;
    const lines = wrapLines(combined, doc.fontFor(false), rowSize, textW);
    const rowH = Math.max(17, Math.min(2, lines.length) * lineH + 7);
    doc.ensure(rowH + 4);

    doc.page.drawText(String(index + 1).padStart(2, "0"), {
      x: MARGIN_X,
      y: doc.y,
      size: rowSize,
      font: doc.fontFor(true),
      color: BLACK,
    });
    const title = `${row.title} -`;
    const titleW = doc.fontFor(true).widthOfTextAtSize(title, rowSize);
    doc.page.drawText(ellipsize(title, doc.fontFor(true), rowSize, textW), {
      x: textX,
      y: doc.y,
      size: rowSize,
      font: doc.fontFor(true),
      color: BLACK,
    });
    const noteFirstLine = ellipsize(row.note, doc.fontFor(false), rowSize, Math.max(0, textW - titleW - 3));
    if (noteFirstLine) {
      doc.page.drawText(noteFirstLine, {
        x: textX + titleW + 3,
        y: doc.y,
        size: rowSize,
        font: doc.fontFor(false),
        color: BODY,
      });
    }
    for (let li = 1; li < Math.min(lines.length, 2); li++) {
      doc.page.drawText(lines[li]!, {
        x: textX,
        y: doc.y - li * lineH,
        size: rowSize,
        font: doc.fontFor(false),
        color: BODY,
      });
    }

    const timeWActual = doc.fontFor(false).widthOfTextAtSize(row.time, 7.5);
    doc.page.drawText(row.time, {
      x: PAGE_W - MARGIN_X - timeWActual,
      y: doc.y,
      size: 7.5,
      font: doc.fontFor(false),
      color: MUTE,
    });

    doc.y -= rowH - 4;
    doc.rule({ y: doc.y, thickness: 0.45, color: LIGHT_RULE });
    doc.y -= 4;
  });

  doc.moveDown(8);
}

function numberedHeading(doc: Doc, number: number, title: string, cue?: string): void {
  doc.ensure(42);
  const y = doc.y;
  doc.page.drawCircle({
    x: MARGIN_X + 6,
    y: y + 3,
    size: 12,
    borderColor: BLACK,
    borderWidth: 1.3,
    color: WHITE,
  });
  const numberText = String(number);
  const numberW = doc.fontFor(true).widthOfTextAtSize(numberText, 8);
  doc.page.drawText(numberText, {
    x: MARGIN_X + 6 - numberW / 2,
    y: y - 0.5,
    size: 8,
    font: doc.fontFor(true),
    color: BLACK,
  });
  doc.page.drawText(title.toUpperCase(), {
    x: MARGIN_X + 18 * MM,
    y,
    size: 17,
    font: doc.fontFor(true),
    color: BLACK,
  });
  if (cue) {
    const cueText = cue.toUpperCase();
    const cueW = doc.fontFor(true).widthOfTextAtSize(cueText, 7);
    doc.page.drawText(cueText, {
      x: PAGE_W - MARGIN_X - cueW,
      y: y + 2,
      size: 7,
      font: doc.fontFor(true),
      color: MUTE,
    });
  }
  doc.rule({ y: y - 13, thickness: 1 });
  doc.y = y - 30;
}

function paragraph(doc: Doc, text: string, opts: { boldLead?: string; indent?: number; size?: number } = {}): void {
  const size = opts.size ?? 9.2;
  const indent = opts.indent ?? 0;
  const maxW = CONTENT_W - indent;
  const lines = wrapLines(text, doc.fontFor(false), size, maxW);
  doc.ensure(lines.length * 11 + 4);
  for (const line of lines) {
    doc.page.drawText(line, {
      x: MARGIN_X + indent,
      y: doc.y,
      size,
      font: opts.boldLead && line.startsWith(opts.boldLead) ? doc.fontFor(true) : doc.fontFor(false),
      color: BODY,
    });
    doc.y -= 11;
  }
  doc.y -= 2;
}

function bullet(doc: Doc, text: string): void {
  const size = 8.8;
  const bulletX = MARGIN_X + 4 * MM;
  const textX = MARGIN_X + 10 * MM;
  const maxW = PAGE_W - MARGIN_X - textX;
  const lines = wrapLines(text, doc.fontFor(false), size, maxW);
  doc.ensure(Math.max(12, lines.length * 10) + 2);
  doc.page.drawRectangle({ x: bulletX, y: doc.y + 2, width: 3, height: 3, color: BLACK });
  for (const line of lines) {
    doc.page.drawText(line, {
      x: textX,
      y: doc.y,
      size,
      font: doc.fontFor(false),
      color: BODY,
    });
    doc.y -= 10;
  }
  doc.y -= 2;
}

function scriptBlock(doc: Doc, cue: string, line: string): void {
  const cueSize = 7;
  const lineSize = 9.2;
  const x = MARGIN_X + 6 * MM;
  const maxW = PAGE_W - MARGIN_X - x;
  const lines = wrapLines(`"${line}"`, doc.fontFor(true), lineSize, maxW);
  const blockH = 14 + lines.length * 12 + 6;
  doc.ensure(blockH);
  const topY = doc.y + 6;
  doc.page.drawLine({
    start: { x: MARGIN_X, y: topY },
    end: { x: MARGIN_X, y: topY - blockH + 6 },
    thickness: 2.5,
    color: BLACK,
  });
  doc.page.drawText(cue.toUpperCase(), {
    x,
    y: doc.y,
    size: cueSize,
    font: doc.fontFor(true),
    color: BLACK,
  });
  doc.y -= 13;
  for (const wrapped of lines) {
    doc.page.drawText(wrapped, {
      x,
      y: doc.y,
      size: lineSize,
      font: doc.fontFor(true),
      color: BLACK,
    });
    doc.y -= 12;
  }
  doc.y -= 7;
}

function callAndResponse(doc: Doc): void {
  const h = 36;
  doc.ensure(h + 8);
  doc.page.drawRectangle({
    x: MARGIN_X,
    y: doc.y - h + 8,
    width: CONTENT_W,
    height: h,
    borderColor: BLACK,
    borderWidth: 1.4,
  });
  doc.page.drawText("CARDS DOWN?", {
    x: MARGIN_X + 10,
    y: doc.y - 8,
    size: 15,
    font: doc.fontFor(true),
    color: BLACK,
  });
  doc.page.drawText("EYES UP!", {
    x: MARGIN_X + 10,
    y: doc.y - 24,
    size: 15,
    font: doc.fontFor(true),
    color: BLACK,
  });
  paragraph(
    doc,
    'Call-and-response: when you say "Cards down", the room says "Eyes up". Use it to pull focus before every Party Mode moment.',
    { indent: 52 * MM, size: 8.3 },
  );
  doc.y -= 3;
}

function drawScoreCard(doc: Doc, x: number, y: number, w: number, title: string, rows: Array<[string, string]>): void {
  const h = 102;
  doc.page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: BLACK, borderWidth: 1.2 });
  doc.page.drawText(title.toUpperCase(), { x: x + 10, y: y - 17, size: 12, font: doc.fontFor(true), color: BLACK });
  let rowY = y - 36;
  for (const [label, points] of rows) {
    doc.page.drawText(label, { x: x + 10, y: rowY, size: 8.5, font: doc.fontFor(true), color: BLACK });
    const pointsW = doc.fontFor(true).widthOfTextAtSize(points, 11);
    doc.page.drawText(points, { x: x + w - 10 - pointsW, y: rowY, size: 11, font: doc.fontFor(true), color: BLACK });
    rowY -= 16;
    if (rowY > y - h + 10) {
      doc.page.drawLine({
        start: { x: x + 10, y: rowY + 7 },
        end: { x: x + w - 10, y: rowY + 7 },
        thickness: 0.45,
        color: LIGHT_RULE,
        dashArray: [1, 2],
      });
    }
  }
}

function scoreCards(doc: Doc): void {
  const gap = 6 * MM;
  const w = (CONTENT_W - gap) / 2;
  const h = 112;
  doc.ensure(h + 8);
  const top = doc.y;
  drawScoreCard(doc, MARGIN_X, top, w, "Music Bingo", [
    ["1 line", "15"],
    ["2 lines", "25"],
    ["Full house", "50"],
    ["First to call gets the points", ""],
  ]);
  drawScoreCard(doc, MARGIN_X + w + gap, top, w, "KaraFun Quiz", [
    ["1st place", "30"],
    ["2nd place", "20"],
    ["3rd place", "10"],
    ["Mobile quiz - two rounds", ""],
  ]);
  doc.y -= h + 22;
}

export async function renderRunSheetPdf(params: RenderRunSheetPdfParams): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: FontPair = { regular, bold };
  const doc = new Doc(pdf, fonts);

  const logo = params.logoPngBytes && params.logoPngBytes.length
    ? await pdf.embedPng(params.logoPngBytes)
    : null;

  const eventDate = formatEventDateWithWeekdayDisplay(params.eventDateInput) || params.eventDateInput || "";
  const game1Theme = normalizeGameTheme(params.game1.theme);
  const game2Theme = normalizeGameTheme(params.game2.theme);

  const normalSongMs =
    Number.isFinite(params.normalSongSeconds) && (params.normalSongSeconds as number) > 0
      ? Math.round((params.normalSongSeconds as number) * 1000)
      : DEFAULT_REVEAL_CONFIG.nextMs;
  const normalReveal: RevealConfig = makeRevealConfigForSongPlayMs(normalSongMs);
  const schedule = buildSchedule(params, game1Theme, game2Theme);
  const venueName = params.brandConfig?.name?.trim() || "The Anchor";

  drawHeader(doc, params, logo, eventDate);
  drawBadgeRow(doc, params, normalReveal);
  drawRunningOrder(doc, schedule);

  numberedHeading(doc, 1, "Core idea for the night");
  paragraph(
    doc,
    "Music bingo is a party with a game running through it. The music comes first - the bingo gives the night structure.",
  );
  bullet(doc, "People should listen enough to mark their cards, then sing, laugh, dance in their seats and get involved.");
  bullet(doc, "Run two clear modes: PLAY MODE for listening and marking cards, and PARTY MODE for card-down moments.");
  bullet(doc, "The aim is not quiet bingo - it is a high-energy, interactive music night where the room feels involved from start to finish.");

  numberedHeading(doc, 2, "Opening remarks", "Say at the start");
  scriptBlock(
    doc,
    "Opening line",
    `Welcome to Music Bingo at ${venueName}. This is not quiet bingo. This is a party with a game running through it - so sing along, dance in your seats, get involved and make some noise.`,
  );
  scriptBlock(
    doc,
    "How to play",
    "You'll hear a clip of a song. If that song is on your card, mark it off. When you get 1 line, 2 lines or a full house, shout loudly and quickly. First person to call gets the points - so don't be shy.",
  );
  scriptBlock(
    doc,
    "Energy rule",
    "Most songs are quick so the game keeps moving. But when I call CARD DOWN, EYES UP, the game pauses for a big singalong, dance moment or room challenge - that means you're not missing anything on your card.",
  );
  callAndResponse(doc);

  numberedHeading(doc, 3, "Game rules & points");
  bullet(doc, "Two separate Music Bingo games, each using a different song list.");
  bullet(doc, `${formatSeconds(normalReveal.nextMs)} per song unless audience participation is high. Keep it moving unless there is a big room moment.`);
  bullet(doc, "Each game is capped at 50 songs.");
  bullet(doc, "Keep bonus points simple - don't over-explain the scoring during the night.");
  scoreCards(doc);

  numberedHeading(doc, 4, "Energy control - keep the room up");
  bullet(doc, "PLAY MODE for normal music bingo: listen, mark your sheet, build tension.");
  bullet(doc, "PARTY MODE for planned energy spikes: card down, eyes up, everyone joins in.");
  bullet(doc, "Don't make people dance and mark sheets at once - give them permission to pause the card.");
  bullet(doc, "Use short stand-up or hands-up prompts. The room doesn't need a full dancefloor moment every time.");

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

export function makeRunSheetFilename(eventDate: string): string {
  return `run-sheet-${sanitizeFilenamePart(eventDate, "event")}.pdf`;
}
