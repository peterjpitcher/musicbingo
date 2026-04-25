# Game Card Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure game cards to 5×3 mixed-content landscape layout with 6 per page, add events back page for double-sided printing, update song duration to 40s, and align the clipboard DOCX with the reference document.

**Architecture:** Five independent workstreams: (1) types + parser for mixed pool, (2) generator for 5×3 grid, (3) PDF renderer for landscape 6-up + events back page, (4) timing config + tests, (5) clipboard DOCX alignment. The generate API route orchestrates everything.

**Tech Stack:** TypeScript, pdf-lib, docx, QRCode, Vitest/node:test, Next.js API routes

**Spec:** `docs/superpowers/specs/2026-04-25-game-card-overhaul-design.md`

---

### Task 1: Update Types and Parser for Mixed Pool

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/parser.ts`
- Modify: `lib/gameInput.ts`

- [ ] **Step 1: Update `Card` type in `lib/types.ts`**

Replace the `Card` type:

```typescript
export type Card = {
  items: string[];
  cardId: string;
};
```

Add `combinedPool` to `ParseResult`:

```typescript
export type ParseResult = {
  songs: Song[];
  uniqueArtists: string[];
  uniqueTitles: string[];
  combinedPool: string[];
  ignoredLines: string[];
};
```

- [ ] **Step 2: Update `parseSongListText` in `lib/parser.ts` to compute `combinedPool`**

After the existing loop that builds `songs`, `artistByKey`, and `titleByKey`, add the combined pool computation before the return statement:

```typescript
  // Build combined pool: union of unique artists and titles, deduplicated case-insensitively
  const poolSet = new Map<string, string>();
  for (const artist of artistByKey.values()) {
    const key = artist.toLowerCase();
    if (!poolSet.has(key)) poolSet.set(key, artist);
  }
  for (const title of titleByKey.values()) {
    const key = title.toLowerCase();
    if (!poolSet.has(key)) poolSet.set(key, title);
  }

  return {
    songs,
    uniqueArtists: [...artistByKey.values()],
    uniqueTitles: [...titleByKey.values()],
    combinedPool: [...poolSet.values()],
    ignoredLines,
  };
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing ones unrelated to this change)

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/parser.ts
git commit -m "feat: add combinedPool to ParseResult and update Card type for mixed grid"
```

---

### Task 2: Update Generator for 5×3 Mixed Grid

**Files:**
- Modify: `lib/generator.ts`

- [ ] **Step 1: Rewrite `generateCards` to use combined pool and 5×3 grid**

Replace the entire contents of `lib/generator.ts`:

```typescript
import crypto from "node:crypto";
import seedrandom from "seedrandom";

import type { Card } from "@/lib/types";

type GenerateCardsParams = {
  combinedPool: string[];
  count: number;
  seed?: string;
  maxAttemptsPerCard?: number;
};

const COLS = 5;
const ROWS = 3;
const CELLS = COLS * ROWS; // 15
const FILLED_PER_ROW = 4; // 1 blank per row
const FILLED_PER_CARD = ROWS * FILLED_PER_ROW; // 12

function makeRng(seed?: string): () => number {
  if (seed && seed.trim()) return seedrandom(seed.trim());
  return Math.random;
}

function sampleWithoutReplacement<T>(arr: readonly T[], k: number, rng: () => number): T[] {
  if (k > arr.length) throw new Error("sample size exceeds population");
  const copy = arr.slice();
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

function hashSignature(items: readonly string[]): string {
  const sig = items.join("\n");
  return crypto.createHash("sha256").update(sig, "utf8").digest("hex");
}

/**
 * Pick 1 blank per row, ensuring each blank is in a distinct column.
 * With 3 rows and 5 columns, pick 3 distinct columns (random 3-of-5).
 */
function blankIndicesOnePerRowDistinctCols(rng: () => number): number[] {
  const cols = sampleWithoutReplacement([0, 1, 2, 3, 4], ROWS, rng);
  const blanks: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    blanks.push(row * COLS + cols[row]);
  }
  return blanks;
}

function fillGridWithBlanks(params: {
  items: string[];
  blankIndices: number[];
  rng: () => number;
}): string[] {
  const blankSet = new Set<number>(params.blankIndices);
  const filledCount = CELLS - blankSet.size;
  const sampled = sampleWithoutReplacement(params.items, filledCount, params.rng);

  const grid = Array.from({ length: CELLS }, () => "");
  let j = 0;
  for (let i = 0; i < CELLS; i++) {
    if (blankSet.has(i)) continue;
    grid[i] = sampled[j] ?? "";
    j++;
  }
  return grid;
}

export function generateCards(params: GenerateCardsParams): Card[] {
  const { combinedPool, count } = params;
  const maxAttemptsPerCard = params.maxAttemptsPerCard ?? 1000;

  if (combinedPool.length < 25) {
    throw new Error(`Need at least 25 unique items in the combined pool, got ${combinedPool.length}`);
  }
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("count must be a positive number");
  }

  const rng = makeRng(params.seed);
  const seen = new Set<string>();
  const cards: Card[] = [];

  for (let i = 0; i < count; i++) {
    let created: Card | null = null;
    for (let attempt = 0; attempt < maxAttemptsPerCard; attempt++) {
      const blankIndices = blankIndicesOnePerRowDistinctCols(rng);
      const items = fillGridWithBlanks({ items: combinedPool, blankIndices, rng });
      const hash = hashSignature(items);
      if (seen.has(hash)) continue;
      seen.add(hash);
      created = { items, cardId: hash.slice(0, 10) };
      break;
    }
    if (!created) {
      throw new Error(
        "Unable to generate a unique card set. Try increasing your song list or using fewer cards."
      );
    }
    cards.push(created);
  }

  return cards;
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: Compilation errors in `app/api/generate/route.ts` (it still references `uniqueArtists`/`uniqueTitles` — we fix that in Task 6). No errors in `lib/generator.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add lib/generator.ts
git commit -m "feat: rewrite generator for 5x3 mixed-pool grid with column-constrained blanks"
```

---

### Task 3: Update Song Duration and Reveal Timing

**Files:**
- Modify: `lib/live/types.ts`
- Modify: `lib/live/reveal.test.ts`
- Modify: `app/host/[sessionId]/page.tsx`

- [ ] **Step 1: Update `DEFAULT_REVEAL_CONFIG` in `lib/live/types.ts`**

Replace the existing config:

```typescript
export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  albumMs: 13_000,
  titleMs: 27_000,
  artistMs: 33_000,
  nextMs: 40_000,
};
```

- [ ] **Step 2: Update the JSDoc above `CHALLENGE_REVEAL_CONFIG`**

```typescript
/** Challenge songs play for 90 seconds instead of 40. */
```

- [ ] **Step 3: Update reveal tests in `lib/live/reveal.test.ts`**

Replace the full contents of the file:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRevealState,
  getRevealPhase,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";

test("getRevealPhase follows 13s/27s/33s/40s thresholds", () => {
  assert.equal(getRevealPhase(0), "hidden");
  assert.equal(getRevealPhase(12_999), "hidden");
  assert.equal(getRevealPhase(13_000), "album");
  assert.equal(getRevealPhase(26_999), "album");
  assert.equal(getRevealPhase(27_000), "title");
  assert.equal(getRevealPhase(32_999), "title");
  assert.equal(getRevealPhase(33_000), "artist");
  assert.equal(getRevealPhase(39_999), "artist");
  assert.equal(getRevealPhase(40_000), "advance");
});

test("computeRevealState maps phases to reveal booleans", () => {
  assert.deepEqual(computeRevealState(0), {
    showAlbum: false,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(13_000), {
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(27_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(33_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(40_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: true,
  });
});

test("shouldTriggerNextForTrack fires once per track", () => {
  const reveal = computeRevealState(40_000);
  assert.equal(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: null,
    }),
    true
  );

  assert.equal(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: "abc",
    }),
    false
  );
});

test("updateAdvanceTrackMarker clears marker when track changes", () => {
  assert.equal(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" }), "abc");
  assert.equal(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" }), null);
  assert.equal(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" }), null);
});
```

- [ ] **Step 4: Run reveal tests**

Run: `npx tsx --test lib/live/reveal.test.ts`
Expected: All 4 tests pass

- [ ] **Step 5: Update host UI copy in `app/host/[sessionId]/page.tsx`**

Find line 1108 and replace:

```
"Plays for 90s instead of 30s"
```

with:

```
"Plays for 90s instead of 40s"
```

- [ ] **Step 6: Commit**

```bash
git add lib/live/types.ts lib/live/reveal.test.ts app/host/[sessionId]/page.tsx
git commit -m "feat: update default song duration from 30s to 40s with proportional reveal phases"
```

---

### Task 4: Update Validation UI for Combined Pool

**Files:**
- Modify: `app/prep/StepGameConfig.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update `StepGameConfig.tsx` validation**

Change the `ParsedResult` type at the top of the file:

```typescript
type ParsedResult = {
  songs: Song[];
  uniqueArtists: string[];
  uniqueTitles: string[];
  combinedPool: string[];
};
```

Replace the `notEnough` and `canNext` logic (lines 57-66):

```typescript
  const tooMany = parsed.songs.length > MAX_SONGS_PER_GAME;
  const notEnough =
    parsed.songs.length < 25 ||
    parsed.combinedPool.length < 25;
  const canNext =
    parsed.songs.length >= 25 &&
    !tooMany &&
    parsed.combinedPool.length >= 25 &&
    Boolean(challengeSong);
```

Replace the unique count display (lines 113-116):

```typescript
              Unique pool items: {parsed.combinedPool.length}
              {notEnough && parsed.songs.length > 0 ? " (need ≥25)" : ""}
```

- [ ] **Step 2: Update `app/page.tsx` validation**

Find the `canSubmit` useMemo (around lines 152-177). Replace the uniqueArtists/uniqueTitles checks:

Replace:
```typescript
    if (parsedGame1.uniqueArtists.length < 25 || parsedGame1.uniqueTitles.length < 25) return false;
    if (parsedGame2.uniqueArtists.length < 25 || parsedGame2.uniqueTitles.length < 25) return false;
```

With:
```typescript
    if (parsedGame1.combinedPool.length < 25) return false;
    if (parsedGame2.combinedPool.length < 25) return false;
```

Update the dependency array — replace:
```typescript
    parsedGame1.uniqueArtists.length,
    parsedGame1.uniqueTitles.length,
    parsedGame2.uniqueArtists.length,
    parsedGame2.uniqueTitles.length,
```

With:
```typescript
    parsedGame1.combinedPool.length,
    parsedGame2.combinedPool.length,
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors in these files (generator route still has errors — fixed in Task 6)

- [ ] **Step 4: Commit**

```bash
git add app/prep/StepGameConfig.tsx app/page.tsx
git commit -m "feat: update validation UI to use combined pool count instead of separate artist/title"
```

---

### Task 5: Add Events Data Fetching to Management API

**Files:**
- Modify: `lib/managementApi.ts`

- [ ] **Step 1: Add `EventDetail` type and `fetchUpcomingEventDetails` function**

Add these exports at the bottom of `lib/managementApi.ts`, before the closing of the file:

```typescript
export type EventDetail = {
  name: string;
  date: Date;
  time: string;
  dayOfWeek: string;
  dayNumber: string;
  monthShort: string;
  dateFormatted: string;
  price: string;
  description: string;
  eventUrl: string | null;
};

function formatTime12h(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(date).toLowerCase().replace(/\s+/g, " ");
}

function formatEventPrice(event: ManagementApiEvent): string {
  const isFree = (event as any).is_free === true || (event as any).isFree === true;
  if (isFree) return "Free entry";

  const price = (event as any).price;
  if (price !== undefined && price !== null) {
    const num = Number(price);
    if (Number.isFinite(num) && num > 0) {
      const currency = getString((event as any).price_currency) ?? "GBP";
      if (currency === "GBP") return `£${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)} per person`;
      return `${num.toFixed(2)} per person`;
    }
  }

  return "Free entry";
}

function getEventDescription(event: ManagementApiEvent): string {
  const short = getString((event as any).short_description);
  if (short) return short;
  const long = getString((event as any).long_description);
  if (long) {
    // Strip HTML tags if present and truncate
    const plain = long.replace(/<[^>]*>/g, "").trim();
    return plain.length > 200 ? `${plain.slice(0, 197)}...` : plain;
  }
  return getEventName(event) ?? "Upcoming event";
}

function toEventDetail(event: ManagementApiEvent, baseUrl: string, publicEventsBaseUrl: string): EventDetail | null {
  const name = getEventName(event);
  const start = getEventStart(event);
  if (!name || !start) return null;

  return {
    name,
    date: start,
    time: formatTime12h(start),
    dayOfWeek: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/London" }).format(start),
    dayNumber: new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Europe/London" }).format(start),
    monthShort: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" }).format(start),
    dateFormatted: new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/London",
    }).format(start),
    price: formatEventPrice(event),
    description: getEventDescription(event),
    eventUrl: getEventUrl(event, baseUrl, publicEventsBaseUrl),
  };
}

export async function fetchUpcomingEventDetails(params: {
  eventDateDisplay: string;
}): Promise<EventDetail[]> {
  const config = getManagementApiConfig();
  if (!config) return [];

  const isoDate = parseDisplayDateToIsoDate(params.eventDateDisplay);
  if (!isoDate) return [];

  // Use day after event to exclude the current Music Bingo event
  const eventDate = new Date(`${isoDate}T00:00:00Z`);
  const dayAfter = new Date(eventDate.getTime() + 86_400_000);
  const dayAfterIso = isoDateInLondon(dayAfter);
  const fromDate = dayAfterIso ?? isoDate;

  try {
    const result = await fetchEvents({
      ...config,
      fromDate,
      availableOnly: true,
      status: "scheduled",
      limit: 20,
    });

    const details = (result.events ?? [])
      .map((e) => toEventDetail(e, config.baseUrl, config.publicEventsBaseUrl))
      .filter((d): d is EventDetail => d !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // If no events found with day-after, try same day as fallback
    if (details.length === 0 && fromDate !== isoDate) {
      const fallback = await fetchEvents({
        ...config,
        fromDate: isoDate,
        availableOnly: true,
        status: "scheduled",
        limit: 20,
      });
      return (fallback.events ?? [])
        .map((e) => toEventDetail(e, config.baseUrl, config.publicEventsBaseUrl))
        .filter((d): d is EventDetail => d !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    return details;
  } catch (err) {
    console.warn("[music-bingo] Failed to fetch event details for events page:", err);
    return [];
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from this file

- [ ] **Step 3: Commit**

```bash
git add lib/managementApi.ts
git commit -m "feat: add EventDetail type and fetchUpcomingEventDetails for events back page"
```

---

### Task 6: Rewrite PDF Renderer for Landscape 6-Up Layout

**Files:**
- Modify: `lib/pdf.ts`

- [ ] **Step 1: Rewrite `renderCardsPdf` for landscape A4 with 6 cards per page**

This is a large change. Replace the `renderCardsPdf` function and update `RenderOptions`. Keep all other functions (`loadDefaultLogoPngBytes`, `loadDefaultEventLogoPngBytes`, `makeDefaultFilename`, `wrapTextLines`, `qrPng`, etc.) unchanged.

Update the `RenderOptions` type:

```typescript
type RenderOptions = {
  eventDate: string;
  theme: string;
  footerItems?: FooterQrItem[];
  logoLeftPngBytes?: Uint8Array | null;
  logoRightPngBytes?: Uint8Array | null;
  showCardId?: boolean;
};
```

Replace the `renderCardsPdf` function. The key changes:
- Page dimensions: `[A4_HEIGHT, A4_WIDTH]` (landscape)
- Layout: 3 columns × 2 rows of cards
- Single grid per card (items, not separate artists/titles)
- Theme in page header
- Per-card IDs
- No QR footer
- `minFontSize` lowered to 5

```typescript
export async function renderCardsPdf(cards: Card[], opts: RenderOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const PAGE_W = A4_HEIGHT; // 842 landscape
  const PAGE_H = A4_WIDTH;  // 595 landscape

  const marginX = mmToPt(14);
  const marginY = mmToPt(10);
  const headerH = mmToPt(28);
  const colGap = mmToPt(8);
  const rowGap = mmToPt(6);
  const cardIdH = 10; // space for card ID text below grid

  const GRID_COLS = 5;
  const GRID_ROWS = 3;
  const CARDS_PER_ROW = 3;
  const CARD_ROWS = 2;
  const CARDS_PER_PAGE = CARDS_PER_ROW * CARD_ROWS;

  const contentW = PAGE_W - 2 * marginX;
  const contentH = PAGE_H - 2 * marginY - headerH;
  const cardW = (contentW - (CARDS_PER_ROW - 1) * colGap) / CARDS_PER_ROW;
  const cardH = (contentH - (CARD_ROWS - 1) * rowGap - CARD_ROWS * cardIdH) / CARD_ROWS;
  const cellW = cardW / GRID_COLS;
  const cellH = cardH / GRID_ROWS;

  const logoLeftImage =
    opts.logoLeftPngBytes && opts.logoLeftPngBytes.length ? await pdf.embedPng(opts.logoLeftPngBytes) : null;
  const logoRightImage =
    opts.logoRightPngBytes && opts.logoRightPngBytes.length ? await pdf.embedPng(opts.logoRightPngBytes) : null;

  const showCardId = opts.showCardId ?? true;

  const drawHeader = (page: any) => {
    const headerY0 = PAGE_H - marginY - headerH;

    if (logoLeftImage || logoRightImage) {
      const maxH = headerH * 0.55;
      const headerLeft = marginX;
      const headerRight = PAGE_W - marginX;
      const maxWEach = (headerRight - headerLeft) / 2 - mmToPt(6);

      if (logoLeftImage) {
        const eventLogoScale = 1.5;
        const scale = Math.min(maxWEach / logoLeftImage.width, maxH / logoLeftImage.height) * eventLogoScale;
        const w = logoLeftImage.width * scale;
        const h = logoLeftImage.height * scale;
        page.drawImage(logoLeftImage, { x: headerLeft, y: headerY0 + headerH - h, width: w, height: h });
      }

      if (logoRightImage) {
        const scale = Math.min(maxWEach / logoRightImage.width, maxH / logoRightImage.height);
        const w = logoRightImage.width * scale;
        const h = logoRightImage.height * scale;
        page.drawImage(logoRightImage, { x: headerRight - w, y: headerY0 + headerH - h, width: w, height: h });
      }
    }

    // Title
    const titleText = "MUSIC BINGO";
    const titleSize = 18;
    const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
      x: (PAGE_W - titleW) / 2,
      y: headerY0 + headerH * 0.62,
      size: titleSize,
      font: fontBold,
      color: black,
    });

    // Theme
    if (opts.theme) {
      const themeSize = 10;
      const themeW = fontBold.widthOfTextAtSize(opts.theme, themeSize);
      page.drawText(opts.theme, {
        x: (PAGE_W - themeW) / 2,
        y: headerY0 + headerH * 0.38,
        size: themeSize,
        font: fontBold,
        color: black,
      });
    }

    // Date
    const dateSize = 9;
    const dateW = fontBold.widthOfTextAtSize(opts.eventDate, dateSize);
    page.drawText(opts.eventDate, {
      x: (PAGE_W - dateW) / 2,
      y: headerY0 + headerH * 0.15,
      size: dateSize,
      font: fontBold,
      color: black,
    });
  };

  const drawCardGrid = (page: any, params: {
    items: string[];
    x: number;
    y: number;
    w: number;
    h: number;
    cardLabel: string;
  }) => {
    const { items, x, y, w, h, cardLabel } = params;
    const cW = w / GRID_COLS;
    const cH = h / GRID_ROWS;

    // Outer border
    page.drawRectangle({ x, y, width: w, height: h, borderColor: black, borderWidth: 1.5 });

    // Grid lines
    for (let i = 1; i < GRID_COLS; i++) {
      page.drawLine({ start: { x: x + i * cW, y }, end: { x: x + i * cW, y: y + h }, thickness: 1, color: black });
    }
    for (let i = 1; i < GRID_ROWS; i++) {
      page.drawLine({ start: { x, y: y + i * cH }, end: { x: x + w, y: y + i * cH }, thickness: 1, color: black });
    }

    // Cell text
    const padding = 2;
    for (let idx = 0; idx < GRID_COLS * GRID_ROWS; idx++) {
      const row = Math.floor(idx / GRID_COLS);
      const col = idx % GRID_COLS;
      const cellX = x + col * cW;
      const cellY = y + (GRID_ROWS - 1 - row) * cH;
      const text = items[idx] ?? "";
      const innerW = cW - 2 * padding;
      const innerH = cH - 2 * padding;

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
      const blockBottom = cellY + padding + (innerH - totalH) / 2;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const lineW = font.widthOfTextAtSize(line, fontSize);
        const lineX = cellX + padding + (innerW - lineW) / 2;
        const lineY = blockBottom + (lines.length - 1 - li) * lineHeight;
        page.drawText(line, { x: lineX, y: lineY, size: fontSize, font, color: black });
      }
    }

    // Card ID below grid
    if (showCardId) {
      const idSize = 6;
      const idW = font.widthOfTextAtSize(cardLabel, idSize);
      page.drawText(cardLabel, { x: x + w - idW, y: y - cardIdH + 2, size: idSize, font, color: black });
    }
  };

  // Render pages, 6 cards each
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    drawHeader(page);

    const cardsOnPage = cards.slice(pageIdx * CARDS_PER_PAGE, (pageIdx + 1) * CARDS_PER_PAGE);

    for (let ci = 0; ci < cardsOnPage.length; ci++) {
      const card = cardsOnPage[ci];
      const colIdx = ci % CARDS_PER_ROW;
      const rowIdx = Math.floor(ci / CARDS_PER_ROW);

      const cardX = marginX + colIdx * (cardW + colGap);
      const cardY = PAGE_H - marginY - headerH - (rowIdx + 1) * cardH - rowIdx * (rowGap + cardIdH) - (rowIdx > 0 ? cardIdH : 0);

      const globalCardIdx = pageIdx * CARDS_PER_PAGE + ci;
      const cardLabel = `Card ${String(globalCardIdx + 1).padStart(3, "0")} • ${card.cardId}`;

      drawCardGrid(page, {
        items: card.items,
        x: cardX,
        y: cardY,
        w: cardW,
        h: cardH,
        cardLabel,
      });
    }
  }

  const bytes = await pdf.save();
  return bytes;
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: Errors in `app/api/generate/route.ts` (fixed in Task 8) but not in `lib/pdf.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/pdf.ts
git commit -m "feat: rewrite PDF renderer for landscape A4, 6 cards per page, mixed grid"
```

---

### Task 7: Add Events Back Page PDF Renderer

**Files:**
- Modify: `lib/pdf.ts`

- [ ] **Step 1: Add `renderEventsPage` function to `lib/pdf.ts`**

Add this new exported function after the `renderCardsPdf` function:

```typescript
import type { EventDetail } from "@/lib/managementApi";
```

Add this import at the top of the file alongside the existing imports. Then add the function:

```typescript
type EventsPageOptions = {
  events: EventDetail[];
  logoLeftPngBytes?: Uint8Array | null;
  logoRightPngBytes?: Uint8Array | null;
};

export async function renderEventsPage(
  pdf: typeof PDFDocument extends new () => infer T ? T : never,
  font: any,
  fontBold: any,
  opts: EventsPageOptions
): Promise<void> {
  const black = rgb(0, 0, 0);
  const grey = rgb(0.4, 0.4, 0.4);
  const lightGrey = rgb(0.75, 0.75, 0.75);
  const PAGE_W = A4_HEIGHT; // landscape
  const PAGE_H = A4_WIDTH;
  const marginX = mmToPt(14);
  const marginY = mmToPt(10);
  const headerH = mmToPt(18);
  const footerH = mmToPt(10);

  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const events = opts.events;
  const hasEvents = events.length > 0;

  // === HEADER ===
  const headerY = PAGE_H - marginY;

  // "What's On"
  const titleText = "What's On";
  const titleSize = 22;
  page.drawText(titleText, {
    x: marginX,
    y: headerY - titleSize,
    size: titleSize,
    font: fontBold,
    color: black,
  });

  // "AT THE ANCHOR"
  const tagText = "AT THE ANCHOR";
  const tagSize = 8;
  const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(tagText, {
    x: marginX + titleW + 10,
    y: headerY - titleSize + 2,
    size: tagSize,
    font,
    color: grey,
  });

  // "the-anchor.pub" right-aligned
  const webText = "the-anchor.pub";
  const webSize = 8;
  const webW = font.widthOfTextAtSize(webText, webSize);
  page.drawText(webText, {
    x: PAGE_W - marginX - webW,
    y: headerY - titleSize + 2,
    size: webSize,
    font,
    color: grey,
  });

  // Header line
  const headerLineY = headerY - headerH;
  page.drawLine({
    start: { x: marginX, y: headerLineY },
    end: { x: PAGE_W - marginX, y: headerLineY },
    thickness: 2,
    color: black,
  });

  // === FOOTER ===
  const footerY = marginY + footerH;
  page.drawLine({
    start: { x: marginX, y: footerY },
    end: { x: PAGE_W - marginX, y: footerY },
    thickness: 0.5,
    color: lightGrey,
  });

  const footerText = "the-anchor.pub  ·  @theanchor.pub  ·  01753 682707  ·  #theanchor";
  const footerSize = 7;
  const footerW = font.widthOfTextAtSize(footerText, footerSize);
  page.drawText(footerText, {
    x: (PAGE_W - footerW) / 2,
    y: marginY + 4,
    size: footerSize,
    font,
    color: grey,
  });

  if (!hasEvents) {
    // Fallback: centred message
    const msg = "Visit the-anchor.pub for upcoming events";
    const msgSize = 14;
    const msgW = font.widthOfTextAtSize(msg, msgSize);
    const midY = (headerLineY + footerY) / 2;
    page.drawText(msg, {
      x: (PAGE_W - msgW) / 2,
      y: midY,
      size: msgSize,
      font,
      color: grey,
    });
    return;
  }

  // === CONTENT AREA ===
  const contentTop = headerLineY - 8;
  const contentBottom = footerY + 8;
  const contentH = contentTop - contentBottom;

  // Featured event (left panel)
  const featured = events[0];
  const timelineEvents = events.slice(1, 12); // max 11 timeline events
  const panelW = mmToPt(60);
  const panelX = marginX;
  const panelH = contentH;
  const panelY = contentBottom;

  // Panel border
  page.drawRectangle({
    x: panelX,
    y: panelY,
    width: panelW,
    height: panelH,
    borderColor: black,
    borderWidth: 1.5,
  });

  // "NEXT EVENT" label
  const labelText = "NEXT EVENT";
  const labelSize = 6.5;
  const labelY = contentTop - 14;
  page.drawText(labelText, { x: panelX + 10, y: labelY, size: labelSize, font: fontBold, color: black });
  page.drawLine({
    start: { x: panelX + 10, y: labelY - 3 },
    end: { x: panelX + 10 + fontBold.widthOfTextAtSize(labelText, labelSize), y: labelY - 3 },
    thickness: 0.5,
    color: black,
  });

  // Featured event name
  const fNameY = labelY - 20;
  const fNameLines = wrapTextLines({
    text: featured.name,
    maxWidth: panelW - 20,
    maxHeight: 36,
    font: fontBold,
    fontSize: 15,
    minFontSize: 10,
    leadingRatio: 1.2,
  });
  let fTextY = fNameY;
  for (const line of fNameLines.lines) {
    page.drawText(line, { x: panelX + 10, y: fTextY, size: fNameLines.fontSize, font: fontBold, color: black });
    fTextY -= fNameLines.lineHeight;
  }

  // Date + time
  const fDateText = `${featured.dateFormatted} · ${featured.time}`;
  fTextY -= 6;
  page.drawText(fDateText, { x: panelX + 10, y: fTextY, size: 7.5, font: fontBold, color: black });

  // Price
  fTextY -= 12;
  page.drawText(featured.price, { x: panelX + 10, y: fTextY, size: 7, font, color: grey });

  // Description
  fTextY -= 14;
  const fDescLines = wrapTextLines({
    text: featured.description,
    maxWidth: panelW - 20,
    maxHeight: panelH * 0.35,
    font,
    fontSize: 7,
    minFontSize: 5.5,
    leadingRatio: 1.5,
  });
  for (const line of fDescLines.lines) {
    page.drawText(line, { x: panelX + 10, y: fTextY, size: fDescLines.fontSize, font, color: black });
    fTextY -= fDescLines.lineHeight;
  }

  // QR code
  if (featured.eventUrl) {
    const qrSize = mmToPt(14);
    const qrBytes = await qrPng(featured.eventUrl);
    const qrImage = await pdf.embedPng(qrBytes);
    const qrX = panelX + 10;
    const qrY = panelY + 18;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    // "Scan to book"
    page.drawText("Scan to book", {
      x: qrX + qrSize + 6,
      y: qrY + qrSize / 2 - 3,
      size: 5.5,
      font,
      color: grey,
    });
  }

  // === TIMELINE (right panel) ===
  if (timelineEvents.length === 0) return;

  const timelineX = panelX + panelW + mmToPt(8);
  const timelineW = PAGE_W - marginX - timelineX;
  const rowH = contentH / timelineEvents.length;

  for (let i = 0; i < timelineEvents.length; i++) {
    const ev = timelineEvents[i];
    const rowY = contentTop - (i + 1) * rowH;

    // Date block
    const dateBlockW = mmToPt(14);
    const dateBlockX = timelineX;
    const dateCenterY = rowY + rowH / 2;

    // Day of week
    const dowSize = 5.5;
    const dowW = font.widthOfTextAtSize(ev.dayOfWeek, dowSize);
    page.drawText(ev.dayOfWeek.toUpperCase(), {
      x: dateBlockX + (dateBlockW - dowW) / 2,
      y: dateCenterY + 10,
      size: dowSize,
      font,
      color: grey,
    });

    // Day number
    const daySize = 20;
    const dayW = fontBold.widthOfTextAtSize(ev.dayNumber, daySize);
    page.drawText(ev.dayNumber, {
      x: dateBlockX + (dateBlockW - dayW) / 2,
      y: dateCenterY - 4,
      size: daySize,
      font: fontBold,
      color: black,
    });

    // Month
    const monthText = ev.monthShort.toUpperCase();
    const monthSize = 6.5;
    const monthW = fontBold.widthOfTextAtSize(monthText, monthSize);
    page.drawText(monthText, {
      x: dateBlockX + (dateBlockW - monthW) / 2,
      y: dateCenterY - 16,
      size: monthSize,
      font: fontBold,
      color: black,
    });

    // Vertical divider
    const divX = dateBlockX + dateBlockW + 4;
    page.drawLine({
      start: { x: divX, y: rowY + 4 },
      end: { x: divX, y: rowY + rowH - 4 },
      thickness: 0.5,
      color: lightGrey,
    });

    // Event details
    const detailX = divX + 8;
    const detailW = timelineW - dateBlockW - 12 - mmToPt(10); // leave room for QR

    // Name
    page.drawText(ev.name, {
      x: detailX,
      y: dateCenterY + 8,
      size: 8.5,
      font: fontBold,
      color: black,
    });

    // Time + price
    const metaText = `${ev.time} · ${ev.price}`;
    page.drawText(metaText, {
      x: detailX,
      y: dateCenterY - 2,
      size: 6.5,
      font,
      color: grey,
    });

    // Description
    const descLines = wrapTextLines({
      text: ev.description,
      maxWidth: detailW,
      maxHeight: 14,
      font,
      fontSize: 6.5,
      minFontSize: 5,
      leadingRatio: 1.3,
    });
    let descY = dateCenterY - 12;
    for (const line of descLines.lines) {
      page.drawText(line, { x: detailX, y: descY, size: descLines.fontSize, font, color: black });
      descY -= descLines.lineHeight;
    }

    // Small QR
    if (ev.eventUrl) {
      const qrSize = mmToPt(8);
      const qrBytes = await qrPng(ev.eventUrl);
      const qrImage = await pdf.embedPng(qrBytes);
      page.drawImage(qrImage, {
        x: PAGE_W - marginX - qrSize,
        y: dateCenterY - qrSize / 2,
        width: qrSize,
        height: qrSize,
      });
    }

    // Row divider
    if (i < timelineEvents.length - 1) {
      page.drawLine({
        start: { x: timelineX, y: rowY },
        end: { x: PAGE_W - marginX, y: rowY },
        thickness: 0.5,
        color: lightGrey,
      });
    }
  }
}
```

- [ ] **Step 2: Update the function signature to accept a PDFDocument instance**

The `renderEventsPage` function needs to accept the already-created PDF document and fonts so it can add pages to the same document. Update the type to use the actual pdf-lib types:

```typescript
export async function renderEventsPage(
  pdf: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  opts: EventsPageOptions
): Promise<void> {
```

Add `PDFFont` to the import at the top of the file:

```typescript
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from pdf.ts

- [ ] **Step 4: Commit**

```bash
git add lib/pdf.ts
git commit -m "feat: add renderEventsPage for B&W editorial events back page"
```

---

### Task 8: Update Clipboard DOCX

**Files:**
- Modify: `lib/clipboardDocx.ts`

- [ ] **Step 1: Update clipboard content to match reference document**

Replace the entire contents of `lib/clipboardDocx.ts`:

```typescript
import { Document, Packer, Paragraph, TextRun } from "docx";

import { formatEventDateWithWeekdayDisplay } from "@/lib/eventDate";
import { normalizeGameTheme } from "@/lib/gameInput";
import type { EventDetail } from "@/lib/managementApi";
import type { Song } from "@/lib/types";

type ClipboardGame = {
  theme: string;
  songs: Song[];
  challengeSong: Song;
};

type RenderClipboardDocxParams = {
  eventDateInput: string;
  game1: ClipboardGame;
  game2: ClipboardGame;
  upcomingEvents?: EventDetail[];
};

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

function blankLine(): Paragraph {
  return new Paragraph({ text: "" });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 180, after: 100 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    text: `- ${text}`,
    spacing: { after: 80 },
  });
}

function subBullet(text: string): Paragraph {
  return new Paragraph({
    text: `  o ${text}`,
    spacing: { after: 60 },
  });
}

function numbered(text: string): Paragraph {
  return new Paragraph({
    text,
    spacing: { after: 80 },
  });
}

function songsBlock(songs: Song[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i] as Song;
    out.push(numbered(`${i + 1}. ${songLabel(song)}`));
  }
  return out;
}

function eventParagraphs(events: EventDetail[]): Paragraph[] {
  if (!events.length) {
    return [
      bullet("** Update this section before printing — add the next 3–4 upcoming events with dates, times, and short descriptions. **"),
    ];
  }
  const out: Paragraph[] = [];
  for (const event of events) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${event.name}, ${event.dateFormatted}: `, bold: true }),
          new TextRun({ text: event.description }),
        ],
        spacing: { after: 100 },
        bullet: { level: 0 },
      })
    );
  }
  return out;
}

export async function renderClipboardDocx(params: RenderClipboardDocxParams): Promise<Uint8Array> {
  const eventDate = formatEventDateWithWeekdayDisplay(params.eventDateInput) || params.eventDateInput;
  const game1Theme = normalizeGameTheme(params.game1.theme);
  const game2Theme = normalizeGameTheme(params.game2.theme);
  const game1ChallengeSong = songLabel(params.game1.challengeSong);
  const game2ChallengeSong = songLabel(params.game2.challengeSong);

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "EVENT CLIPBOARD", bold: true, size: 32 })],
      spacing: { after: 220 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: eventDate }),
        new TextRun({ text: "    Time: ", bold: true }),
        new TextRun({ text: "8:00 pm - 12:00 am" }),
      ],
      spacing: { after: 200 },
    }),

    heading("OPENING REMARKS"),
    bullet("We'll be playing two separate Music Bingo games (two different song lists)."),
    bullet("Song pace: aim for 40 seconds per song (unless there is big audience participation). Goal is speed."),
    bullet("Each Music Bingo game is capped at 50 songs (about 33 minutes 20 seconds of constant play, plus Nikki banter)."),
    bullet("KaraFun points (mobile quiz):"),
    subBullet("1st place 30 pts"),
    subBullet("2nd place 20 pts"),
    subBullet("3rd place 10 pts"),
    bullet("Music Bingo points: The first person to call gets the points, so be quick."),
    subBullet("1 line 15 pts"),
    subBullet("2 lines 25 pts"),
    subBullet("Full House 50 pts"),
    bullet("Reminder: The kitchen is open until 9 pm for food orders."),

    heading("SCHEDULE"),
    numbered("1. Welcome - Yes Sir (Nikki lip sync)"),
    numbered("2. Announcements"),
    numbered("3. KaraFun mobile quiz (Round 1)"),
    numbered("4. Music Bingo Game 1 (50 songs max)"),
    numbered("5. Break (10 mins)"),
    numbered("6. KaraFun mobile quiz (Round 2)"),
    numbered("7. Music Bingo Game 2 (50 songs max, different song list)"),
    numbered("8. Announcements"),
    numbered("9. Sing Along/Out - end-of-night singalong"),

    heading("UPCOMING EVENTS"),
    ...eventParagraphs(params.upcomingEvents ?? []),

    heading("BONUS FUN"),
    bullet("Dancing Challenge (20 pts) - placed in Game 1."),
    subBullet(`Song: ${game1ChallengeSong}`),
    subBullet("Nikki announces the song in advance. Anyone who wants to can get up and dance along. Nikki picks a winner and awards 20 bonus points."),
    bullet("Sing-Along Challenge (20 pts) - placed in Game 2."),
    subBullet(`Song: ${game2ChallengeSong}`),
    subBullet("Nikki announces the song in advance. Everyone can play. Last person singing the right words wins. If you sing the wrong words, you sit down. Winner gets 20 bonus points."),

    heading("MUSIC BINGO"),
    bullet("IMPORTANT: Create two separate games for next time (Game 1 list and Game 2 list). Do not reuse the same pool for both."),
    bullet("Max 50 songs per game."),
    bullet("40 seconds per song unless audience participation is high."),

    heading(`MUSIC BINGO GAME 1 (${game1Theme})`),
    ...songsBlock(params.game1.songs),

    blankLine(),
    heading(`MUSIC BINGO GAME 2 (${game2Theme})`),
    ...songsBlock(params.game2.songs),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors in clipboardDocx.ts

- [ ] **Step 3: Commit**

```bash
git add lib/clipboardDocx.ts
git commit -m "feat: update clipboard DOCX to match reference doc — 40s pace, events from API, kitchen reminder"
```

---

### Task 9: Update Generate API Route — Orchestration

**Files:**
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: Update the generate route to use new generator, PDF, and events**

This is the glue that ties everything together. Key changes:
- Pass `combinedPool` instead of `uniqueArtists`/`uniqueTitles` to generator
- Pass `theme` to PDF renderer
- Fetch events and render events back pages interleaved
- Pass events to clipboard DOCX
- Remove old QR footer logic

Update the imports at the top:

```typescript
import JSZip from "jszip";

import { renderClipboardDocx } from "@/lib/clipboardDocx";
import { formatEventDateDisplay } from "@/lib/eventDate";
import { generateCards } from "@/lib/generator";
import {
  normalizeGameTheme,
  parseGameSongsText,
  resolveChallengeSong,
} from "@/lib/gameInput";
import { fetchUpcomingEventDetails } from "@/lib/managementApi";
import {
  loadDefaultEventLogoPngBytes,
  loadDefaultLogoPngBytes,
  renderCardsPdf,
  renderEventsPage,
} from "@/lib/pdf";
import { cookies } from "next/headers";
import {
  getOrRefreshAccessToken,
  spotifyApiRequest,
  SPOTIFY_COOKIE_ACCESS,
} from "@/lib/spotifyWeb";
import type { Card, ParseResult, Song } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
```

Replace the card generation section (around lines 174-191). Change from:

```typescript
      cardsGame1 = generateCards({
        uniqueArtists: parsedGame1.uniqueArtists,
        uniqueTitles: parsedGame1.uniqueTitles,
        count,
        seed: seed || undefined,
      });
      cardsGame2 = generateCards({
        uniqueArtists: parsedGame2.uniqueArtists,
        uniqueTitles: parsedGame2.uniqueTitles,
        count,
        seed: seed ? `${seed}-game-2` : undefined,
      });
```

To:

```typescript
      cardsGame1 = generateCards({
        combinedPool: parsedGame1.combinedPool,
        count,
        seed: seed || undefined,
      });
      cardsGame2 = generateCards({
        combinedPool: parsedGame2.combinedPool,
        count,
        seed: seed ? `${seed}-game-2` : undefined,
      });
```

Remove the entire QR/events-for-footer block (around lines 206-231 — the `eventItems`, `qrStatus`, `qrError`, `fetchedEventCount`, `fetchedEventWithUrlCount`, `while` loop, and `footerItems` logic).

Remove the `EVENT_QR_COUNT` constant.

Replace the PDF/DOCX generation section. Remove the old `renderCardsPdf` calls and replace with the new approach that interleaves events pages. Replace the entire parallel generation block with:

```typescript
    const game1Theme = normalizeGameTheme(asString(form.get("game1_theme")));
    const game2Theme = normalizeGameTheme(asString(form.get("game2_theme")));

    // Fetch event details for events back page and clipboard
    const upcomingEvents = await fetchUpcomingEventDetails({ eventDateDisplay: eventDateInput });

    const logoRightPngBytes = await loadDefaultLogoPngBytes({ origin });
    const logoLeftPngBytes = await loadDefaultEventLogoPngBytes({ origin });

    // Generate game 1 PDF with interleaved events pages
    const pdfGame1Bytes = await renderGamePdfWithEvents({
      cards: cardsGame1,
      eventDate: eventDateDisplay,
      theme: game1Theme,
      logoLeftPngBytes,
      logoRightPngBytes,
      events: upcomingEvents,
    });

    // Generate game 2 PDF with interleaved events pages
    const pdfGame2Bytes = await renderGamePdfWithEvents({
      cards: cardsGame2,
      eventDate: eventDateDisplay,
      theme: game2Theme,
      logoLeftPngBytes,
      logoRightPngBytes,
      events: upcomingEvents,
    });

    // Generate clipboard DOCX
    const clipboardDocxBytes = await renderClipboardDocx({
      eventDateInput,
      game1: {
        theme: game1Theme,
        songs: sortedGame1Songs,
        challengeSong: game1ChallengeSong,
      },
      game2: {
        theme: game2Theme,
        songs: sortedGame2Songs,
        challengeSong: game2ChallengeSong,
      },
      upcomingEvents,
    });
```

Note: The `game1Theme` and `game2Theme` variables are already declared earlier in the function. Remove the duplicate declarations if they exist. If the earlier ones at line 150-151 are still present, remove the new ones above and reuse those.

Add a helper function inside the file (before the POST handler):

```typescript
async function renderGamePdfWithEvents(params: {
  cards: Card[];
  eventDate: string;
  theme: string;
  logoLeftPngBytes: Uint8Array | null;
  logoRightPngBytes: Uint8Array | null;
  events: import("@/lib/managementApi").EventDetail[];
}): Promise<Uint8Array> {
  // First render the cards PDF
  const cardsPdfBytes = await renderCardsPdf(params.cards, {
    eventDate: params.eventDate,
    theme: params.theme,
    logoLeftPngBytes: params.logoLeftPngBytes,
    logoRightPngBytes: params.logoRightPngBytes,
    showCardId: true,
  });

  // Load the cards PDF, then interleave events pages
  const pdf = await PDFDocument.load(cardsPdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Count existing card pages (we'll insert events pages after each)
  const cardPageCount = pdf.getPageCount();

  // Insert events pages in reverse order so indices don't shift
  for (let i = cardPageCount - 1; i >= 0; i--) {
    // Create a temporary PDF for the events page
    const tempPdf = await PDFDocument.create();
    const tempFont = await tempPdf.embedFont(StandardFonts.Helvetica);
    const tempFontBold = await tempPdf.embedFont(StandardFonts.HelveticaBold);

    await renderEventsPage(tempPdf, tempFont, tempFontBold, {
      events: params.events,
      logoLeftPngBytes: params.logoLeftPngBytes,
      logoRightPngBytes: params.logoRightPngBytes,
    });

    // Copy the events page into the main PDF after the card page
    const [copiedPage] = await pdf.copyPages(tempPdf, [0]);
    pdf.insertPage(i + 1, copiedPage);
  }

  return new Uint8Array(await pdf.save());
}
```

Update the response headers — remove the QR-related headers:

```typescript
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: Clean compilation

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: wire up generate route with mixed-pool cards, events back pages, and updated clipboard"
```

---

### Task 10: Verify Full Pipeline

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: Zero errors, zero warnings

- [ ] **Step 2: Run type checker**

Run: `npx tsc --noEmit`
Expected: Clean compilation

- [ ] **Step 3: Run reveal tests**

Run: `npx tsx --test lib/live/reveal.test.ts`
Expected: All 4 tests pass

- [ ] **Step 4: Run Python tests (if applicable)**

Run: `npm run test:py`
Expected: Pass (or document if Python tests need updating for the new card structure)

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Successful production build

- [ ] **Step 6: Manual smoke test**

Start dev server: `npm run dev`
1. Open the app in browser
2. Enter an event date, paste 25+ songs for each game, select challenge songs
3. Generate the event pack ZIP
4. Open the game 1 PDF — verify:
   - A4 landscape orientation
   - 6 cards per page (3×2 layout)
   - Mixed artists/titles on each card
   - Round theme in page header
   - Per-card IDs
   - No QR footer
   - Text fits in cells without truncation
5. Verify events pages are interleaved (page 2, 4, 6, etc.)
6. Open the clipboard DOCX — verify:
   - "8:00 pm - 12:00 am" time
   - "40 seconds per song"
   - "about 33 minutes 20 seconds"
   - Kitchen reminder present
   - Upcoming events section populated (if Management API configured)
7. Start a live session — verify challenge song shows "90s instead of 40s"

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address smoke test findings"
```
