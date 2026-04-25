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

### Page Header
- Logos left/right (same as current)
- "MUSIC BINGO" centred title
- Round theme/name below (e.g. "The best of the 70's to today!")
- Event date below theme
- No per-card grid titles

### No QR Footer
- QR codes removed from game card pages entirely — they move to the events back page

### Card ID
- Small text bottom-right corner of the page (e.g. "Card 001–006 • a1b2c3")

### Text Fitting Strategy
1. **Word wrap**: Break text at word boundaries to fit cell width
2. **Shrink font**: Scale from 9pt down to 5pt minimum (was 6pt)
3. **Mid-word break**: If a single word exceeds cell width at min font, break with hyphen
4. **Truncate**: Only as absolute last resort, truncate with "…"

## 2. Events Back Page (New)

### PDF Positioning
- Inserted after every game card page in the PDF
- Page order: Cards p1 → Events → Cards p2 → Events → …
- Enables double-sided printing: front = game cards, back = upcoming events
- The events page content is identical on every back page (rendered once, reused)

### Design — B&W Editorial
- Pure black and white, no block colour, no fills — minimal ink for cheap printing
- Font: Helvetica (already embedded in pdf-lib)

### Layout
- **Header**: "What's On" (Helvetica-Bold, large) + "at The Anchor" (uppercase, letter-spaced) + "the-anchor.pub" right-aligned
- **Left panel** (~190pt wide): Featured next event
  - Bold outline border (thin line, no fill)
  - "NEXT EVENT" label with underline
  - Event name (Helvetica-Bold, large)
  - Date + time
  - Price / "Free entry"
  - Longer description (from `short_description` or `long_description`)
  - Large QR code (~42pt) linking to `booking_url`
  - "Scan to book" label
- **Right panel**: Remaining events as date-driven timeline
  - Each row: large day number + month + day-of-week | divider | event name + time/price + short description | small QR code
  - Thin hairline dividers between rows
  - Events fill available vertical space
- **Footer**: `the-anchor.pub · @theanchor.pub · 01753 682707 · #theanchor`

### Data Source
- Management API: `GET /api/events?status=scheduled&available_only=true&from_date={event_date}`
- Fetches all scheduled events from the event date onwards
- First event becomes the featured panel; rest go into the timeline
- Uses `short_description` for timeline items
- Uses `short_description` (or `long_description` if available) for featured event
- `booking_url` for QR codes (falls back to website URL if no booking URL)
- Degrades gracefully if API unavailable — shows a simple "Visit the-anchor.pub for upcoming events" message

### Dynamic Sizing
- Number of events varies based on API response
- If many events, reduce font and spacing to fit
- If few events, increase spacing for comfortable reading
- Maximum ~10 events on the timeline (plus 1 featured) to keep readable

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

## 4. Clipboard DOCX — Align with Reference

### Content Updates (`lib/clipboardDocx.ts`)

- **Time**: Make event time configurable (default "8:00 pm - 12:00 am" matching reference doc)
- **Song pace**: Update to "40 seconds per song" to match new app default
- **Duration calculation**: Update "about 16 minutes 20 seconds" to reflect 40s pace (50 songs × 40s = ~33 minutes)
- **Kitchen reminder**: Add "Reminder: The kitchen is open until 9 pm for food orders."
- **Upcoming Events**: Replace placeholder with actual event data from Management API, formatted as bold event name + date + colon + description paragraph (matching reference doc style)
- **Song list format**: Keep numbered `1. Artist - Title` format (unchanged)

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

### Generation Algorithm
1. Combine `uniqueArtists` and `uniqueTitles` into a single pool
2. Deduplicate (in case an artist name matches a song title)
3. For each card:
   a. Determine blank positions: 1 random blank per row (3 blanks total across rows 0, 1, 2)
   b. Sample 12 unique items from the combined pool
   c. Place into 15-cell grid with blanks
   d. Hash for uniqueness check
4. No column constraint on blanks (only 3 rows makes column constraint unnecessary)

### Minimum Requirements
- Combined pool must have at least 12 unique items (in practice always satisfied — 50 songs = ~100 pool items)
- Validation: `if (combinedPool.length < 12) throw Error(...)`

## 6. Files to Modify

| File | Change |
|------|--------|
| `lib/types.ts` | `Card` type: replace `artists`/`titles` with `items` |
| `lib/generator.ts` | Mixed pool generation, 5×3 grid, 1 blank per row |
| `lib/pdf.ts` | Landscape A4, 6 cards/page, single grid per card, page header with theme, no QR footer, text fitting improvements |
| `lib/pdf.ts` (new function) | `renderEventsPage()` — B&W editorial events back page |
| `lib/live/types.ts` | `DEFAULT_REVEAL_CONFIG` timing values |
| `lib/clipboardDocx.ts` | Content updates, API-driven upcoming events, timing text |
| `app/api/generate/route.ts` | Orchestrate new card layout, interleave events pages, fetch events from API |
| `lib/managementApi.ts` | New/updated function to fetch full event details (not just links) |

## 7. Assumptions

1. The Management API at `MANAGEMENT_API_BASE_URL` returns event data with `short_description`, `booking_url`, `date`, `time`, `price`/`is_free` fields
2. Helvetica (StandardFonts) is sufficient for the events page — no custom fonts needed in the PDF
3. The events back page uses the same A4 landscape orientation as the game cards
4. Card IDs are still needed for game administration (identifying which card a player has)
5. The host UI game display (live session) is not affected — these changes are PDF/DOCX generation only
6. Existing saved sessions continue to work with their stored reveal configs
