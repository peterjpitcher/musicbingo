# Architecture — Music Bingo Card Generator

## Goals
- Run locally with a simple UI to upload a song list and download a multi-page PDF.
- Keep all user-provided song data ephemeral (no DB, no persistence).
- Produce print-ready **A4 black & white** cards with consistent layout.
- Keep QR code fetching pluggable (management app API integration later).
- Provide a separate Spotify playlist creation script using the same parsing logic.

## Recommended Stack
- **Node.js** (local dev + deployable later)
- UI + API: **Next.js** (App Router) served on `localhost`
- PDF rendering: **pdf-lib** (vector grids, reliable A4 output)
- QR generation: `qrcode` (rendered to PNG and embedded into PDF)
- Spotify (separate script): **Python** `spotipy` (OAuth flow, playlist creation)

Rationale:
- Next.js gives a simple “paste/upload → download PDF” UI with a server-side PDF endpoint.
- `pdf-lib` avoids HTML-to-PDF browser/system dependencies.

## High-Level Components
1) **UI (Local Web)**
   - Upload/paste song list
   - Enter event date (printed on cards; used for Spotify naming)
   - Configure card count (default 200)
   - (Optional) select/fetch event QRs (future)
   - Generate + download PDF

2) **Parser**
   - Converts plain text to a list of `(artist,title)` tuples
   - Produces `unique_artists` and `unique_titles`
   - Validates minimum data (≥25 each)

3) **Card Generator**
   - Generates N cards
   - Ensures each card has 25 artists and 25 titles (unique within card where possible)
   - Ensures no duplicate cards across the run (signature set)

4) **QR Provider**
   - `StaticQRProvider`: always returns menu URL for QR
   - `ManagementAPIQRProvider` (future): fetches two event URLs; returns placeholders on failure

5) **PDF Renderer**
   - Given a card payload and QR images, draws an A4 page:
     - Event logo (left) + brand logo (right)
     - Event date header text
     - Artists 5×5 grid
     - Titles 5×5 grid
     - 3 QR codes + labels
     - Optional card ID

6) **Spotify Script**
   - Reuses the parser
   - Accepts an event date string for playlist naming
   - Creates playlist, searches tracks, adds in batches, outputs report

## Data Model (in-memory)
- `Song`:
  - `artist: string`
  - `title: string`
- `Card`:
  - `artists: string[]` (length 25, ordered for placement)
  - `titles: string[]` (length 25, ordered for placement)
  - `id: string` (optional: short hash)

- `RenderContext` (per run):
  - `event_date: str`
  - `qr_event_1: str | None`
  - `qr_event_2: str | None`
  - `qr_menu: str`

## Data Flow
1) User uploads/pastes song list in UI.
2) Parser returns:
   - `songs[]`
   - `unique_artists[]`
   - `unique_titles[]`
3) Generator produces `cards[]` while tracking `seen_signatures`.
4) QR Provider returns:
   - `event_qr_1` (URL or placeholder)
   - `event_qr_2` (URL or placeholder)
   - `menu_qr` (static URL)
5) Renderer streams PDF bytes back to browser as a downloadable file.

## Uniqueness Strategy
- Signature definition: `artists_in_order + "|" + titles_in_order`
- Store `sha256(signature)` in a `set`.
- If collision, regenerate that card (new random sample + shuffle).
- Add guardrails:
  - Max attempts per card (e.g., 1,000)
  - Global max attempts (e.g., 200,000)
  - If exceeded, stop with actionable error message.

## Text Layout Strategy (PDF cells)
- Measure text width using the selected font.
- Prefer:
  1) Wrap into 1–3 lines within the cell
  2) Reduce font size down to a minimum threshold
  3) Truncate with ellipsis as last resort

## Secrets & Configuration
- Use environment variables / `.env` locally for the Spotify script only.
- Do not store secrets or uploaded song lists on disk.
- Logos are bundled assets (persistent):
  - `public/event_logo.jpeg` (top-left)
  - `public/logo.png` (top-right)

## Extensibility
- QR provider interface allows swapping:
  - placeholder/static
  - management API integration
- Renderer can support alternate templates later (still B&W).
