# PRD — Music Bingo Card Generator (Offline)

## Summary
Build a simple, offline-first application that:
1) Accepts a plain-text list of up to 300 songs, parses each line into `artist` and `title`.
2) Generates **200 unique** A4 bingo cards as a **single PDF** ready for printing.
3) Renders two independent 5×5 grids per card: **Artists** (top) and **Song Titles** (bottom).
4) Lets the operator enter an **event date** (e.g., “May 1st 2026”) and prints it on every card.
5) Places two **persistent logos** at the top of each card:
   - Event logo (left)
   - Venue/brand logo (right)
6) Places **three QR codes** at the bottom of each card:
   - **Menu QR** (static): `https://vip-club.uk/vvjkz0`
   - **Event QR #1** (dynamic, from management API; fallback placeholder if unavailable)
   - **Event QR #2** (dynamic, from management API; fallback placeholder if unavailable)
7) Includes a separate **Python script** to create a Spotify playlist from the same song list, using the event date in the playlist name.

Constraints:
- **No database**; do not retain uploaded song lists.
- Card design must be **black and white only** (print-friendly).

## Users & Use Cases
**Primary user:** Event operator (bar/venue staff) generating cards before an event.

**Core workflow:**
1) Open the app locally (offline-capable).
2) Enter the event date (shown on cards and used for Spotify naming).
3) Upload/paste the song list (plain text).
4) (Optional) Fetch latest event QR URLs from management app API.
5) Click “Generate”.
6) Download a single multi-page PDF containing 200 unique cards.
7) Print and hand out to guests.

**Secondary workflow:**
1) Run a Python script to create a Spotify playlist from the same song list.

## Input Format & Parsing
### Accepted song list format (plain text)
The input is plain text containing:
- Optional section headers like: `1950s (25)` (must be ignored)
- Blank lines (ignored)
- Song lines like: `Artist – Title`

### Parsing rules
- Accept separators: en-dash `–`, em-dash `—`, hyphen `-` when used as ` <dash> ` with spaces.
- Split on the **first** dash separator occurrence into:
  - `artist` (left side, trimmed)
  - `title` (right side, trimmed)
- Preserve punctuation, parentheses, “feat.” segments, etc. (do not strip).
- Ignore lines that:
  - Are empty/whitespace
  - Match header pattern: `^\s*\d{4}s\s*\(\s*\d+\s*\)\s*$`
  - Do not contain a valid separator

### Normalization & de-duplication
- Normalize repeated whitespace to single spaces.
- De-duplicate exact `(artist,title)` pairs.
- Also maintain derived unique lists:
  - `unique_artists` (case-insensitive de-dupe)
  - `unique_titles` (case-insensitive de-dupe)

### Validation
Hard requirements to generate a card set:
- `len(unique_artists) >= 25`
- `len(unique_titles) >= 25`

If these are not met, the app must stop with a clear error explaining what’s missing.

## Bingo Card Definition
### Page
- Paper: **A4, portrait**
- Style: **black & white only**
- Output: **single PDF** with 200 pages (one card per page)

### Layout
1) **Header**
   - Event logo at top-left and venue/brand logo at top-right.
   - Event date printed under the logo (e.g., “May 1st 2026”).
   - Optional small subtitle line (e.g., “Music Bingo”) if desired.
2) **Top grid (Artists)**
   - 5 rows × 5 columns = 25 cells
   - Some cells are intentionally blank.
3) **Bottom grid (Song Titles)**
   - 5×5 grid
   - Some cells are intentionally blank.
4) **Footer**
   - Three QR codes with short labels (black text):
     - Event QR #1 (left)
     - Event QR #2 (center)
     - Menu (right) — points to `https://vip-club.uk/vvjkz0`
   - Optional card identifier (small) for auditing uniqueness.

### Grid relationship
The Artist and Title grids are **independently randomized**; there is **no positional relationship** between a given artist cell and a given title cell.

## Card Generation Rules
### Per-card content
For each card:
- Create a random blank pattern per grid such that each row/column has **at least 4 filled cells** (i.e., **max 1 blank** per row/column).
- Fill the remaining cells with unique artists/titles sampled without replacement from `unique_artists` / `unique_titles`.

### Uniqueness requirement
Generate **200 cards** such that **no two cards are identical**.

Definition of “identical”:
- The ordered sequence of the 25 artist cells **and** the ordered sequence of the 25 title cells match exactly, including blank cells.

Implementation requirement:
- Maintain a set of card signatures (e.g., hash of artist-grid + title-grid).
- If a newly generated card collides, re-roll until unique.
- If uniqueness cannot be achieved within a reasonable attempt limit (configurable), fail with a clear error.

### Randomness & reproducibility
- Default behavior: use strong randomness (non-deterministic).
- Optional: allow providing a seed to reproduce a specific PDF.

## PDF Rendering Requirements
### Typography & fitting
- Text must fit within cells:
  - Wrap lines within a cell where possible.
  - Reduce font size down to a minimum threshold if needed.
  - If still too long, truncate with ellipsis.
- Maintain legibility for print (avoid ultra-small fonts).

### Print readiness
- Use vector lines for grids (crisp printing).
- Ensure consistent margins and spacing; no content clipped.
- Ensure QR codes are large enough to scan reliably when printed.

### Black & white only
- Use only black strokes/text on white background.
- Avoid grayscale fills; use hatching/patterning if decoration is desired.

## QR Code Requirements
### Static menu QR (required)
- Always generate a QR code for: `https://vip-club.uk/vvjkz0`
- Include label such as “Menu” / “Order at the bar”.

### Dynamic event QR codes (planned integration)
Two QR codes should be populated per event from the management app API.

Expected behavior:
- On generate, fetch “upcoming event” QR targets.
- Convert returned URLs (or tokens) into QR codes.
- If the API is unreachable or returns invalid data:
  - Render placeholders (empty QR frame + “QR unavailable” label) rather than failing card generation.

## Data Retention & Privacy
- Do not persist uploaded song lists.
- Processing is in-memory; generated PDF is the only output artifact.
- Log output must not include the full uploaded list unless explicitly enabled (debug mode).

## Spotify Playlist Script (separate deliverable)
Deliver a Python script that:
- Reads the same plain-text song list format.
- Parses `(artist,title)` pairs (same rules as the app).
- Creates a Spotify playlist and adds matched tracks.
- Outputs a report of:
  - Tracks added
  - Tracks not found / ambiguous

Recommended matching behavior:
- Search using structured query: `track:"<title>" artist:"<artist>"`
- Use a small candidate set (e.g., top 5) and pick best match by exact/near-exact name match.

Authentication:
- Use Spotify OAuth (Authorization Code flow) via Spotify Web API.
- Credentials must be supplied via environment variables / `.env` file and must not be committed.

## Non-Goals
- No database, user accounts, or multi-user sharing.
- No online gameplay or real-time winner detection.
- No storage of “past events” or card archives (beyond the PDF output you save).

## Proposed Technical Approach (high level)
Web app: Next.js (TypeScript) with a server-side API route that generates the PDF.

Modules/components:
- `lib/parser`: parse plain-text list into songs/artists/titles.
- `lib/generator`: produce unique card payloads.
- `lib/pdf`: generate A4 PDF pages (logo, grids, QR codes).
- `app/`: UI and `app/api/generate` endpoint (offline/local use; deployable later).
- `app/api/spotify/*`: server-side OAuth + Spotify Web API playlist creation.

## Acceptance Criteria
1) Given a valid input list with ≥25 unique artists and ≥25 unique titles, the app generates a single PDF containing exactly **200 pages**, each page A4 portrait.
2) Each page includes:
   - Logo at top
   - Event date in header
   - Artists 5×5 grid (25 artists)
   - Titles 5×5 grid (25 titles)
   - Three QR codes at bottom, including the static menu QR
3) No two cards in the PDF are identical (per signature definition).
4) The app does not persist the uploaded song list (no DB/files saved besides the PDF output).
5) The app can authenticate with Spotify, create a private playlist, add tracks in batches, and report not-found tracks.

## Open Questions (needs your input)
### Logo asset
- Provide the logo file format and location:
  - `public/logo.png` (venue/brand logo, top-right; preferred: PNG)
  - `public/event_logo.jpeg` (event logo, top-left; preferred: JPEG/PNG)
- Do you have a black-only version, or should the app convert it to black?

### Management app API (for event QR codes)
- Endpoint(s) and auth method (API key / OAuth / bearer token).
- Response shape (two URLs? event object with QR URLs? image blobs?).
- How to determine “upcoming event” (by start time? manual selection?).

### Spotify credentials & preferences
- Spotify credentials are provided via `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (via env vars / `.env`, never committed).
- Redirect URI must match the deployed origin, e.g.:
  - Local: `http://127.0.0.1:3000/api/spotify/callback`
  - Hosted: `https://your-app.vercel.app/api/spotify/callback`
- Playlist must be **private**.
- Playlist name defaults to: `Music Bingo - <Event Date>`
