# Game Card Layout Overhaul + Clipboard + Timing

> Design spec for restructuring game cards, adding events back page, updating song duration, and aligning the clipboard DOCX.

## 1. Game Card PDF — Layout Overhaul

### Grid
- **Dimensions**: 5 columns × 3 rows = 15 cells per card
- **Blanks**: 1 per row → 4 filled cells per row → 12 filled cells per card
- **Orientation**: A4 landscape (842 × 595 pt)
- **Cards per page**: 6 (3 columns × 2 rows)

### Content — Mixed Pool
- Artists and song titles are combined into a single pool and randomly jumbled together
- 12 items drawn randomly from the combined pool per card — no enforced artist/title ratio
- Each cell contains either an artist name OR a song title (not both)
- Show full text wherever possible — no unnecessary truncation
- **Fairness note**: Some cards may be inherently easier than others depending on the random mix. This is intentional — it's how bingo works. No balancing constraints.

### Page Header
- Logos left/right (same as current)
- "MUSIC BINGO" centred title
- Round theme/name below (e.g. "The best of the 70's to today!")
- Event date below theme
- No per-card grid titles

### No QR Footer
- QR codes removed from game card pages entirely — they move to the events back page

### Card ID
- Each individual card grid gets its own small ID label (e.g. "Card 001 • a1b2c3") so that if cards are cut apart, each mini-card is identifiable
- Position: bottom-right corner of each card grid

### Page Geometry (A4 Landscape)
```
Page: 842 × 595 pt (A4 landscape)
Margins: 14mm (X), 10mm (Y)
Header height: ~28mm (logos + title + theme + date)
Card area: remaining space divided into 3 columns × 2 rows
Column gap: 8mm
Row gap: 6mm
Card ID: 6pt text, 2pt below each card grid

Cell dimensions (calculated):
  Available width:  842 - 2×marginX = ~762pt → 3 columns with 2 gaps = (762 - 2×gapX) / 3 ≈ 240pt per card
  Cell width:       240 / 5 = ~48pt per cell
  Available height: 595 - 2×marginY - headerH = ~480pt → 2 rows with 1 gap = (480 - gapY) / 2 ≈ 230pt per card row
  Cell height:      230 / 3 rows ≈ ~70pt per cell (after card ID space)
```
No cut lines — cards are distributed as full sheets, not cut apart in normal use. The per-card ID is for game administration only.

### Text Fitting Strategy
1. **Word wrap**: Break text at word boundaries to fit cell width
2. **Shrink font**: Scale from 9pt down to 5pt minimum (was 6pt)
3. **Mid-word break**: If a single word exceeds cell width at min font, break with hyphen. The hyphen counts against width. Multi-line broken words are allowed (e.g. "Super-\nstition")
4. **Truncate**: Only as absolute last resort, truncate with "…"
5. All text fitting is custom logic in `wrapTextLines()` — pdf-lib has no automatic layout

## 2. Events Back Page (New)

### PDF Positioning
- Inserted after every game card page in the PDF
- Page order: Cards p1 → Events → Cards p2 → Events → …
- Enables double-sided printing: front = game cards, back = upcoming events
- The events page content is identical on every back page (rendered once, reused)

### Design — B&W Editorial
- Pure black and white, no block colour, no fills — minimal ink for cheap printing
- Font: Helvetica / Helvetica-Bold (StandardFonts, already embedded in pdf-lib)

### Layout
- **Header**: "What's On" (Helvetica-Bold, ~22pt) + "at The Anchor" (uppercase, letter-spaced, ~8pt) + "the-anchor.pub" right-aligned
- **Left panel** (~190pt wide): Featured next event
  - Bold outline border (thin line, no fill)
  - "NEXT EVENT" label with underline (uppercase, letter-spaced)
  - Event name (Helvetica-Bold, ~15pt)
  - Date + time (7.5pt)
  - Price / "Free entry" (7pt)
  - Description text (7pt, line-height 1.5)
  - Large QR code (~42pt) linking to event URL
  - "Scan to book" label (vertical text)
- **Right panel**: Remaining events as date-driven timeline
  - Each row: large day number (~20pt) + month (6pt uppercase) + day-of-week (5.5pt) | 1pt vertical divider | event name (8pt bold) + time/price (6.5pt) + short description (6.5pt) | small QR code (24pt)
  - 0.5pt hairline dividers between rows
  - Events fill available vertical space with equal spacing
- **Footer**: `the-anchor.pub · @theanchor.pub · 01753 682707 · #theanchor`

### Data Source
- Reuses existing `fetchEvents()` from `lib/managementApi.ts`
- Query: `GET /api/events?status=scheduled&available_only=true&from_date={day_after_event}`
  - Uses day after event date to exclude the current Music Bingo event itself
  - If no events returned, falls back to `from_date={event_date}` to show same-day events
- First event (by date) becomes the featured panel; rest go into the timeline
- Maximum ~10 events on the timeline (plus 1 featured) to keep readable

### Normalised Event Type for PDF/DOCX

New type in `lib/managementApi.ts`:

```typescript
export type EventDetail = {
  name: string;
  date: Date;              // parsed from startDate/start_date
  time: string;            // formatted "7:00 pm"
  dayOfWeek: string;       // "Wed", "Fri", etc.
  dayNumber: string;       // "29", "6", etc.
  monthShort: string;      // "Apr", "May", etc.
  dateFormatted: string;   // "Wednesday 29 April"
  price: string;           // "£3 per person", "Free entry", "Menu prices"
  description: string;     // short_description, falling back to name
  eventUrl: string | null; // for QR codes — resolved via getEventUrl()
};
```

New export: `fetchUpcomingEventDetails(params: { eventDateDisplay: string }): Promise<EventDetail[]>`
- Reuses existing `fetchEvents()`, `getEventStart()`, `getEventUrl()` helpers
- Parses and formats each event into `EventDetail`
- Sorts by date ascending
- Returns empty array on API failure (graceful degradation)

### Fallback States
- **API unavailable**: Show centred message "Visit the-anchor.pub for upcoming events" with website QR code
- **No events returned**: Same fallback message
- **Events without booking URLs**: QR code links to `the-anchor.pub/events/{slug}` via `getEventUrl()` (already handles this)

## 3. Song Duration — 30s → 40s

### RevealConfig Changes (`lib/live/types.ts`)

```
DEFAULT_REVEAL_CONFIG:
  albumMs:  10,000 → 13,000
  titleMs:  20,000 → 27,000
  artistMs: 25,000 → 33,000
  nextMs:   30,000 → 40,000
```

### Unchanged
- `CHALLENGE_REVEAL_CONFIG` stays at 90s (`nextMs: 90,000`)
- Host UI "+30s" and "Skip 30s" buttons unchanged (manual overrides)
- Existing sessions retain their stored `revealConfig` — only new sessions get the new default

### UI Copy Update
- `app/host/[sessionId]/page.tsx` line 1108: "Plays for 90s instead of 30s" → "Plays for 90s instead of 40s"

### Test Update
- `lib/live/reveal.test.ts`: Update hardcoded 10/20/25/30s thresholds to 13/27/33/40s

## 4. Clipboard DOCX — Align with Reference

### Content Updates (`lib/clipboardDocx.ts`)

- **Time**: Hardcode "8:00 pm - 12:00 am" (matching reference doc). Not configurable for now — can add a form field later if needed.
- **Song pace**: Update to "40 seconds per song" to match new app default
- **Duration calculation**: Update to "about 33 minutes 20 seconds" (50 songs × 40s = 2,000s = 33m 20s)
- **Kitchen reminder**: Add "Reminder: The kitchen is open until 9 pm for food orders."
- **Upcoming Events**: Replace placeholder with actual event data from Management API via new `fetchUpcomingEventDetails()`, formatted as bold event name + date + colon + description paragraph (matching reference doc style)
- **Song list format**: Keep numbered `1. Artist - Title` format (unchanged)
- **DOCX events fallback**: If API unavailable, keep the existing placeholder text asking the host to manually add events

### Structural Match with Reference
The reference document structure:
1. EVENT CLIPBOARD (title)
2. Date + Time
3. OPENING REMARKS (bullet list)
4. SCHEDULE (numbered list 1-9)
5. UPCOMING EVENTS (bold name + description paragraphs from API)
6. BONUS FUN (dancing + sing-along challenges)
7. MUSIC BINGO (instructions)
8. MUSIC BINGO GAME 1 (theme) — numbered song list
9. MUSIC BINGO GAME 2 (theme) — numbered song list

## 5. Generator Logic — Mixed Pool

### Type Changes

`Card` type changes:
```typescript
// Before
type Card = { artists: string[]; titles: string[]; cardId: string; }

// After
type Card = { items: string[]; cardId: string; }
```

`items` is a flat array of 15 elements (5×3 grid), where blank cells are empty strings and filled cells contain either an artist name or a song title.

**Why not typed items?** The card is a printed game piece — the player doesn't need to know if a cell is an artist or title. They hear a song and look for either the artist OR the title on their card. Adding `{ kind: "artist" | "title"; text: string }` would complicate the type, the generator, and the PDF renderer for metadata that's never displayed or used. If we need debugging/analytics later, the hash-based `cardId` traces back to the seed.

### Generation Algorithm
1. Combine `uniqueArtists` and `uniqueTitles` into a single pool
2. Deduplicate (in case an artist name matches a song title — e.g. "Jolene" is both)
3. For each card:
   a. Determine blank positions: 1 random blank per row, constrained so no column has more than 1 blank (same Latin-square approach as current, adapted to 3×5)
   b. Sample 12 unique items from the combined pool
   c. Place into 15-cell grid with blanks
   d. Hash for uniqueness check
4. Column constraint: with 3 rows and 5 columns, we pick 3 distinct columns for the 3 blanks (a random 3-of-5 permutation). This prevents any column from being fully blank.

### Minimum Requirements
- Combined pool must have at least 25 unique items after deduplication
  - This ensures enough variety for generating many unique cards (40+)
  - In practice always satisfied: 25+ songs = 25+ artists + 25+ titles, minus any collisions
- Validation: `if (combinedPool.length < 25) throw Error("Need at least 25 unique items...")`

### Validation UI Changes
- `app/page.tsx` line 162-163: Replace `uniqueArtists.length < 25 || uniqueTitles.length < 25` with combined pool check `≥ 25`
- `app/prep/StepGameConfig.tsx` lines 59-65: Same — validate combined pool size ≥ 25 instead of separate artist/title counts
- `app/prep/StepGameConfig.tsx` lines 114-115: Update display text from "Unique artists: X / titles: Y" to "Unique items in pool: X (need ≥25)"
- `parseGameSongsText` return type: add `combinedPool: string[]` field (deduplicated union of artists + titles)

## 6. Files to Modify

| File | Change |
|------|--------|
| `lib/types.ts` | `Card` type: replace `artists`/`titles` with `items`; `ParseResult`: add `combinedPool` |
| `lib/generator.ts` | Mixed pool generation, 5×3 grid, 1 blank per row + column constraint, combined pool input |
| `lib/pdf.ts` | Landscape A4, 6 cards/page, single grid per card, page header with theme, per-card IDs, no QR footer, text fitting (5pt min, mid-word break) |
| `lib/pdf.ts` (new function) | `renderEventsPage()` — B&W editorial events back page |
| `lib/live/types.ts` | `DEFAULT_REVEAL_CONFIG` timing values |
| `lib/live/reveal.test.ts` | Update hardcoded timing thresholds |
| `lib/clipboardDocx.ts` | Content updates, API-driven upcoming events, timing text, event time |
| `lib/managementApi.ts` | New `EventDetail` type, new `fetchUpcomingEventDetails()` export |
| `lib/gameInput.ts` | `parseGameSongsText`: compute and return `combinedPool` |
| `app/api/generate/route.ts` | Orchestrate new card layout, interleave events pages, fetch events, pass theme to PDF |
| `app/page.tsx` | Update validation from separate artist/title counts to combined pool ≥ 25 |
| `app/prep/StepGameConfig.tsx` | Update validation logic and display text for combined pool |
| `app/host/[sessionId]/page.tsx` | Update "90s instead of 30s" → "90s instead of 40s" |

## 7. Assumptions

1. The Management API at `MANAGEMENT_API_BASE_URL` returns events with fields documented in `OJ-AnchorManagementTools` — we normalise to `EventDetail` type
2. Helvetica / Helvetica-Bold (StandardFonts) is sufficient for the events page — no custom fonts needed
3. The events back page uses the same A4 landscape orientation as the game cards
4. Card IDs are still needed for game administration (one per mini-card)
5. The host UI game display (live session) is not affected — these changes are PDF/DOCX generation only (except the timing config and one copy string)
6. Existing saved sessions continue to work with their stored reveal configs
7. Cards are distributed as full A4 sheets, not cut apart — but each card has its own ID just in case
8. Python test suite (`npm run test:py`) may need updating if it validates card structure — check during implementation
