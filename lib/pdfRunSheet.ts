import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

import { formatEventDateWithWeekdayDisplay } from "@/lib/eventDate";
import { normalizeGameTheme } from "@/lib/gameInput";
import { DEFAULT_REVEAL_CONFIG, makeRevealConfigForSongPlayMs } from "@/lib/live/types";
import type { RevealConfig } from "@/lib/live/types";
import type { NormalisedEvent } from "@/lib/eventFeed";
import { sanitizeFilenamePart } from "@/lib/utils";
import type { Song } from "@/lib/types";

/**
 * Standalone host "Run Sheet" PDF generator for the Music Bingo event pack.
 *
 * Mirrors `docs/design/after-hours/Music Bingo Run Sheet.html` in strict
 * black-and-white using only pdf-lib built-in fonts (Helvetica / Helvetica-Bold)
 * so it prints cheaply and needs no custom font embedding (@pdf-lib/fontkit is
 * deliberately not used here).
 *
 * It consumes the SAME input shape as `renderClipboardDocx` (see
 * `lib/clipboardDocx.ts`) so the printed run sheet and the DOCX clipboard stay
 * consistent for the host.
 */

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
};

// ── A4 portrait geometry (points). 1pt = 1/72 inch; 1mm ≈ 2.8346pt. ──
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 18 * MM;
const MARGIN_TOP = 16 * MM;
const MARGIN_BOTTOM = 14 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const BLACK = rgb(0, 0, 0);
const MUTE = rgb(0.33, 0.33, 0.33); // ≈ #555, secondary text only — still pure greyscale (B&W safe).

// Font sizes (points) tuned to echo the HTML hierarchy.
const SIZE_TITLE = 30;
const SIZE_SUB = 8;
const SIZE_META = 9;
const SIZE_BADGE = 8.5;
const SIZE_H3 = 14;
const SIZE_SCHED = 9.5;
const SIZE_SCHED_TIME = 8.5;
const SIZE_BODY = 9.5;
const SIZE_ANS = 8;
const SIZE_CHIP = 6.5;

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

function challengeTypeLabel(type: string): string {
  switch (type) {
    case "dance-along":
      return "Dance Along";
    case "sing-along":
      return "Sing Along";
    default:
      // e.g. "karaoke" -> "Karaoke"
      return type
        .split("-")
        .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(" ");
  }
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

/**
 * pdf-lib's standard (WinAnsi) fonts cannot encode characters outside Latin-1
 * (e.g. smart quotes, em dashes, accented names from event feeds). Replace the
 * common offenders and strip anything else that would throw at draw time.
 */
function sanitizeText(input: string, font: PDFFont): string {
  const replaced = input
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[ ]/g, " ")
    .replace(/[•]/g, "-");
  let safe = "";
  for (const ch of replaced) {
    try {
      font.widthOfTextAtSize(ch, 12);
      safe += ch;
    } catch {
      safe += "?";
    }
  }
  return safe;
}

type FontPair = { regular: PDFFont; bold: PDFFont };

/** Truncate a single line with an ellipsis so it never overflows `maxWidth`. */
function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut.length > 0 ? `${cut}…` : "";
}

/** Greedy word-wrap into lines that fit `maxWidth`. */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      // Hard-break a single word that is wider than the column.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        lines.push(ellipsize(word, font, size, maxWidth));
        current = "";
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * A cursor-based page writer that auto-flows onto new pages. Keeps the run
 * sheet resilient to long song lists / many events without manual pagination.
 */
class Doc {
  private readonly pdf: PDFDocument;
  private readonly fonts: FontPair;
  page: PDFPage;
  y: number;

  constructor(pdf: PDFDocument, fonts: FontPair, page: PDFPage) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.page = page;
    this.y = PAGE_H - MARGIN_TOP;
  }

  private newPage(): void {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_TOP;
  }

  /** Ensure `needed` points of vertical space remain, else start a new page. */
  ensure(needed: number): void {
    if (this.y - needed < MARGIN_BOTTOM) this.newPage();
  }

  moveDown(points: number): void {
    this.y -= points;
  }

  text(
    raw: string,
    opts: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number },
  ): void {
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const safe = sanitizeText(raw, font);
    this.page.drawText(safe, {
      x: opts.x ?? MARGIN_X,
      y: this.y,
      size: opts.size,
      font,
      color: opts.color ?? BLACK,
    });
  }

  /** Draw a horizontal rule at the current baseline gap. */
  rule(opts: { thickness: number; color?: ReturnType<typeof rgb>; gapAbove: number; gapBelow: number }): void {
    this.ensure(opts.gapAbove + opts.gapBelow + opts.thickness);
    this.y -= opts.gapAbove;
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_W - MARGIN_X, y: this.y },
      thickness: opts.thickness,
      color: opts.color ?? BLACK,
    });
    this.y -= opts.gapBelow;
  }

  fontFor(bold: boolean): PDFFont {
    return bold ? this.fonts.bold : this.fonts.regular;
  }
}

/** Section heading (uppercase) with an underline rule, echoing the HTML `h3`. */
function sectionHeading(doc: Doc, label: string): void {
  doc.ensure(SIZE_H3 + 14);
  doc.moveDown(14);
  doc.text(label.toUpperCase(), { size: SIZE_H3, bold: true });
  doc.rule({ thickness: 1, gapAbove: SIZE_H3 * 0.45, gapBelow: 8 });
}

/** A short pill chip ("Intro" / "Challenge") drawn with an outline (no fill). */
function drawChip(doc: Doc, label: string, x: number): number {
  const font = doc.fontFor(true);
  const safe = sanitizeText(label, font);
  const textW = font.widthOfTextAtSize(safe, SIZE_CHIP);
  const padX = 4;
  const padY = 2.2;
  const chipH = SIZE_CHIP + padY * 2;
  const chipW = textW + padX * 2;
  doc.page.drawRectangle({
    x,
    y: doc.y - padY,
    width: chipW,
    height: chipH,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  });
  doc.page.drawText(safe, {
    x: x + padX,
    y: doc.y + 0.5,
    size: SIZE_CHIP,
    font,
    color: BLACK,
  });
  return chipW;
}

type ScheduleRow = { title: string; detail: string; time: string };

/**
 * Build the running order. The intro song and per-game challenge labels are
 * woven in from the live data so the schedule reflects this specific event.
 */
function buildSchedule(params: RenderRunSheetPdfParams, game1Theme: string, game2Theme: string): ScheduleRow[] {
  const intro = params.game1.introSong ?? params.game2.introSong;
  const introDetail = intro
    ? `Nikki enters to ${songLabel(intro)} (plays in full)`
    : "Nikki enters to the intro track (plays in full)";

  const g1Challenge = params.game1.challengeTypes?.[0] ?? "dance-along";
  const g2Challenge = params.game2.challengeTypes?.[0] ?? "sing-along";

  return [
    { title: "Welcome & intro song", detail: introDetail, time: "8:00" },
    { title: "Tonight's running order", detail: "Show the night's plan on screen", time: "8:05" },
    { title: "Switch to Quiz - Round 1", detail: "KaraFun mobile quiz - phones out", time: "8:08" },
    { title: "Music Bingo title", detail: "Logo reveal - hype it up", time: "8:25" },
    { title: "House rules", detail: "Explain how to play & how to win", time: "8:27" },
    { title: `${challengeTypeLabel(g1Challenge)} warm up`, detail: "Full song - get the room moving", time: "8:30" },
    { title: "Music Bingo - Game 1", detail: `${game1Theme} - lines & full house`, time: "8:34" },
    { title: "Interval", detail: "Break - bar refills (~10 min)", time: "9:10" },
    { title: "Switch to Quiz - Round 2", detail: "KaraFun mobile quiz round two", time: "9:20" },
    { title: `${challengeTypeLabel(g2Challenge)} warm up`, detail: "Full song - big sing-along", time: "9:35" },
    { title: "Music Bingo - Game 2", detail: `${game2Theme} - different song list`, time: "9:39" },
    { title: "Winners", detail: "1st place + wooden spoon (2nd from last)", time: "10:15" },
    { title: "Thank you & reviews", detail: "Google review QR + next event", time: "10:20" },
  ];
}

function drawSchedule(doc: Doc, rows: ScheduleRow[]): void {
  const numW = 7 * MM;
  const timeW = 14 * MM;
  const detailX = MARGIN_X + numW;
  const detailMaxW = CONTENT_W - numW - timeW - 6;

  rows.forEach((row, i) => {
    const titleText = `${row.title} — `;
    const titleW = Math.min(
      doc.fontFor(true).widthOfTextAtSize(titleText, SIZE_SCHED),
      detailMaxW,
    );
    const detailText = ellipsize(row.detail, doc.fontFor(false), SIZE_SCHED, Math.max(0, detailMaxW - titleW));

    doc.ensure(SIZE_SCHED + 7);
    doc.moveDown(SIZE_SCHED + 3);

    doc.text(String(i + 1).padStart(2, "0"), { size: SIZE_SCHED, bold: true });
    doc.text(titleText, { size: SIZE_SCHED, bold: true, x: detailX });
    doc.text(detailText, { size: SIZE_SCHED, x: detailX + titleW });

    const timeStr = row.time;
    const timeStrW = doc.fontFor(false).widthOfTextAtSize(timeStr, SIZE_SCHED_TIME);
    doc.text(timeStr, {
      size: SIZE_SCHED_TIME,
      color: MUTE,
      x: PAGE_W - MARGIN_X - timeStrW,
    });

    // dotted divider
    doc.moveDown(4);
    drawDottedRule(doc);
  });
}

function drawDottedRule(doc: Doc): void {
  const dash = 0.6;
  const gap = 1.8;
  doc.page.drawLine({
    start: { x: MARGIN_X, y: doc.y },
    end: { x: PAGE_W - MARGIN_X, y: doc.y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
    dashArray: [dash, gap],
  });
}

/** Bullet line (wrapped) used for note sections. */
function bulletLine(doc: Doc, text: string): void {
  const indent = 4 * MM;
  const maxW = CONTENT_W - indent;
  const lines = wrapLines(text, doc.fontFor(false), SIZE_BODY, maxW);
  lines.forEach((line, idx) => {
    doc.ensure(SIZE_BODY + 4);
    doc.moveDown(SIZE_BODY + 3);
    if (idx === 0) {
      doc.text("-", { size: SIZE_BODY, bold: true });
    }
    doc.text(line, { size: SIZE_BODY, x: MARGIN_X + indent });
  });
}

/** Two-column answer list with per-song Intro / Challenge chips. */
function drawAnswerList(doc: Doc, game: RunSheetGame, challengeRevealMs: number): void {
  const songs = game.songs;
  if (songs.length === 0) {
    doc.ensure(SIZE_BODY + 4);
    doc.moveDown(SIZE_BODY + 3);
    doc.text("(No songs listed yet)", { size: SIZE_BODY, color: MUTE });
    return;
  }

  const introSet = new Set<string>();
  if (game.introSong) introSet.add(songLabel(game.introSong));
  for (const intro of game.introSongs ?? []) {
    introSet.add(`${intro.artist} - ${intro.title}`);
  }
  const challengeSet = new Set(game.challengeSongs.map(songLabel));

  const colGap = 10 * MM;
  const colW = (CONTENT_W - colGap) / 2;
  const idxW = 6 * MM;
  const rowH = SIZE_ANS + 5;
  const rows = Math.ceil(songs.length / 2);

  // Reserve a contiguous block: keep the column header band tidy on one page.
  // Track the top so both columns share the same baseline grid.
  const colTopY = doc.y - (SIZE_ANS + 3);
  // If the whole block does not fit, push the start onto a fresh page.
  if (colTopY - rows * rowH < MARGIN_BOTTOM) {
    doc.ensure(rows * rowH + rowH);
  }
  const startY = doc.y - (SIZE_ANS + 3);

  songs.forEach((song, i) => {
    const col = i < rows ? 0 : 1;
    const rowInCol = i < rows ? i : i - rows;
    const colX = MARGIN_X + col * (colW + colGap);
    const lineY = startY - rowInCol * rowH;

    const numberLabel = `${i + 1}`;
    const font = doc.fontFor(false);
    doc.page.drawText(sanitizeText(numberLabel, doc.fontFor(true)), {
      x: colX + (idxW - doc.fontFor(true).widthOfTextAtSize(numberLabel, SIZE_ANS)),
      y: lineY,
      size: SIZE_ANS,
      font: doc.fontFor(true),
      color: BLACK,
    });

    const label = songLabel(song);
    const isIntro = introSet.has(label);
    const isChallenge = challengeSet.has(label);
    // Reserve room for chips at the right edge of the column.
    const chipReserve = (isIntro ? 30 : 0) + (isChallenge ? 56 : 0);
    const textMaxW = colW - idxW - 3 - chipReserve;
    const textStr = ellipsize(sanitizeText(label, font), font, SIZE_ANS, Math.max(0, textMaxW));
    doc.page.drawText(textStr, {
      x: colX + idxW,
      y: lineY,
      size: SIZE_ANS,
      font,
      color: BLACK,
    });

    let chipX = colX + colW - chipReserve;
    const savedY = doc.y;
    doc.y = lineY;
    if (isIntro) chipX += drawChip(doc, "Intro", chipX) + 4;
    if (isChallenge) drawChip(doc, `Challenge ${formatSeconds(challengeRevealMs)}`, chipX);
    doc.y = savedY;
  });

  // Advance the cursor past the taller of the two columns.
  doc.y = startY - rows * rowH;
}

export async function renderRunSheetPdf(params: RenderRunSheetPdfParams): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: FontPair = { regular, bold };

  const firstPage = pdf.addPage([PAGE_W, PAGE_H]);
  const doc = new Doc(pdf, fonts, firstPage);

  const eventDate =
    formatEventDateWithWeekdayDisplay(params.eventDateInput) || params.eventDateInput || "";
  const game1Theme = normalizeGameTheme(params.game1.theme);
  const game2Theme = normalizeGameTheme(params.game2.theme);

  const normalSongMs =
    Number.isFinite(params.normalSongSeconds) && (params.normalSongSeconds as number) > 0
      ? Math.round((params.normalSongSeconds as number) * 1000)
      : DEFAULT_REVEAL_CONFIG.nextMs;
  const normalReveal: RevealConfig = makeRevealConfigForSongPlayMs(normalSongMs);
  // Challenge songs play longer with their own reveal curve (see lib/live/types.ts).
  const challengeReveal = makeRevealConfigForSongPlayMs(90_000);

  // ── HEADER ──
  doc.text("Run Sheet", { size: SIZE_TITLE, bold: true });
  // Event name + date sit to the right of the title, top-aligned.
  const metaName = "Music Bingo";
  const metaNameW = doc.fontFor(true).widthOfTextAtSize(metaName, SIZE_META);
  doc.text(metaName, { size: SIZE_META, bold: true, x: PAGE_W - MARGIN_X - metaNameW });
  if (eventDate) {
    const dateW = doc.fontFor(false).widthOfTextAtSize(eventDate, SIZE_META);
    const savedY = doc.y;
    doc.y -= SIZE_META + 3;
    doc.text(eventDate, { size: SIZE_META, x: PAGE_W - MARGIN_X - dateW });
    doc.y = savedY;
  }
  doc.moveDown(SIZE_TITLE * 0.55);
  doc.text("THE ANCHOR · HOST", { size: SIZE_SUB, bold: true, color: MUTE });
  doc.rule({ thickness: 2.5, gapAbove: 8, gapBelow: 10 });

  // ── BADGE ROW (key facts) ──
  const cardCount = `Cards: ${params.game1.songs.length || 0}-song / ${params.game2.songs.length || 0}-song games`;
  const badges = [
    cardCount,
    `Song length: ${formatSeconds(normalReveal.nextMs)}`,
    `Reveals: album ${formatSeconds(normalReveal.albumMs)} · title ${formatSeconds(
      normalReveal.titleMs,
    )} · artist ${formatSeconds(normalReveal.artistMs)}`,
    `Challenge: ${formatSeconds(challengeReveal.nextMs)}`,
  ];
  doc.ensure(SIZE_BADGE + 6);
  doc.moveDown(SIZE_BADGE + 2);
  {
    const gap = 6 * MM;
    let bx = MARGIN_X;
    const font = doc.fontFor(false);
    for (const badge of badges) {
      const safe = sanitizeText(badge, font);
      const w = font.widthOfTextAtSize(safe, SIZE_BADGE);
      if (bx + w > PAGE_W - MARGIN_X && bx > MARGIN_X) {
        doc.moveDown(SIZE_BADGE + 4);
        bx = MARGIN_X;
      }
      doc.page.drawText(safe, { x: bx, y: doc.y, size: SIZE_BADGE, font, color: BLACK });
      bx += w + gap;
    }
  }

  // ── SCHEDULE ──
  sectionHeading(doc, "Schedule");
  drawSchedule(doc, buildSchedule(params, game1Theme, game2Theme));

  // ── GAME 1 SONG LIST ──
  sectionHeading(doc, `Game 1 - ${game1Theme}`);
  drawAnswerList(doc, params.game1, challengeReveal.nextMs);

  // ── GAME 2 SONG LIST ──
  sectionHeading(doc, `Game 2 - ${game2Theme}`);
  drawAnswerList(doc, params.game2, challengeReveal.nextMs);

  // ── CHALLENGE & INTRO SONGS ──
  sectionHeading(doc, "Challenge & Intro Songs");
  drawGameCallouts(doc, "Game 1", params.game1, "dance-along", challengeReveal.nextMs);
  drawGameCallouts(doc, "Game 2", params.game2, "sing-along", challengeReveal.nextMs);

  // ── UPCOMING EVENTS ──
  if (params.upcomingEvents && params.upcomingEvents.length > 0) {
    sectionHeading(doc, "Upcoming Events to Announce");
    for (const evt of params.upcomingEvents) {
      const detail = evt.description ? `${evt.name} (${evt.dateFormatted}) - ${evt.description}` : `${evt.name} (${evt.dateFormatted})`;
      bulletLine(doc, detail);
    }
  }

  // ── HOST NOTES ──
  sectionHeading(doc, "Host Notes");
  bulletLine(doc, `${formatSeconds(normalReveal.nextMs)} per song unless audience participation is high.`);
  bulletLine(doc, "Keep it simple: hear the song, mark the song, shout when you win.");
  bulletLine(doc, "Choose 3 to 5 big songs as bonus bangers - play the chorus longer for a quick room moment.");
  bulletLine(doc, "Let Nikki drive the fun, not the rules - the more complicated the scoring feels, the more energy drops.");

  return new Uint8Array(await pdf.save());
}

/** Per-game challenge + intro song callouts (text block, wrapped). */
function drawGameCallouts(
  doc: Doc,
  gameLabel: string,
  game: RunSheetGame,
  defaultChallengeType: string,
  challengeRevealMs: number,
): void {
  doc.ensure(SIZE_BODY + 8);
  doc.moveDown(SIZE_BODY + 6);
  doc.text(gameLabel, { size: SIZE_BODY + 1, bold: true });

  // Challenge songs
  if (game.challengeSongs.length > 0) {
    game.challengeSongs.forEach((song, i) => {
      const type = game.challengeTypes?.[i] ?? defaultChallengeType;
      bulletLine(
        doc,
        `${challengeTypeLabel(type)} Challenge (20 pts, plays ${formatSeconds(challengeRevealMs)}): ${songLabel(song)}`,
      );
    });
  } else {
    bulletLine(doc, `${challengeTypeLabel(defaultChallengeType)} Challenge (20 pts): song TBD`);
  }

  // Intro song(s)
  const intros: string[] = [];
  if (game.introSong) intros.push(songLabel(game.introSong));
  for (const intro of game.introSongs ?? []) {
    intros.push(`${challengeTypeLabel(intro.type)}: ${intro.artist} - ${intro.title}`);
  }
  if (intros.length > 0) {
    for (const intro of intros) {
      bulletLine(doc, `Intro / warm-up: ${intro}`);
    }
  }
}

export function makeRunSheetFilename(eventDate: string): string {
  return `run-sheet-${sanitizeFilenamePart(eventDate, "event")}.pdf`;
}
