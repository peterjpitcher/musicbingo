# Implementation Plan — Music Bingo Card Generator

## Milestone 0 — Project scaffolding
- Create Next.js project structure:
  - `app/` (UI)
  - `app/api/generate` (PDF generator endpoint)
  - `lib/` (parser + generator + PDF renderer)
  - `public/` (logo asset)
- Keep `scripts/` for the separate Spotify Python script.
- Add dependency management:
  - `package.json` (Next + pdf-lib + qrcode)
  - `pyproject.toml` (Spotify script deps)
- Add `.env.example` (Spotify placeholders; no secrets committed).

## Milestone 1 — Parsing & validation
- Implement parser that:
  - Ignores decade headers like `1950s (25)`
  - Accepts `–`, `—`, `-` separators with spaces
  - Splits into `(artist,title)` using first separator occurrence
  - Normalizes whitespace and de-duplicates
  - Produces `unique_artists`, `unique_titles`
  - Validates `>=25` each (hard stop if not)
- Add unit tests using a small representative input snippet.

## Milestone 2 — Card generation (uniqueness guarantees)
- Implement generator that:
  - Creates N cards (default 200)
  - Samples 25 unique artists and 25 unique titles per card
  - Shuffles placement independently for each grid
  - Enforces no duplicate cards via signature hashing
  - Has retry limits with clear failure messaging
- Add tests:
  - Generates 200 cards from a pool (e.g., 100+ artists/titles) with no duplicates
  - Fails fast on insufficient unique artists/titles

## Milestone 3 — PDF rendering (A4, black & white)
- Implement renderer using `pdf-lib`:
  - A4 portrait page sizing, consistent margins
  - Logo placement (top)
  - Two 5×5 grids (artists then titles)
  - Cell text layout (wrap → shrink → ellipsis)
  - Footer with 3 QR blocks + labels + optional card ID
  - Strict black/white palette
- Add a “golden” output check:
  - Generate one PDF locally for manual visual review
  - Validate QR scanability from a printed page

## Milestone 4 — QR code providers
- Implement `StaticQRProvider`:
  - Generates menu QR for `https://vip-club.uk/vvjkz0`
- Implement placeholder `ManagementAPIQRProvider` interface:
  - For now returns “unavailable” placeholders
  - Later: fetch URLs from management app API and render them as QRs

## Milestone 5 — Local UI (offline-first usage)
- Implement local web UI (Next.js):
  - Upload `.txt` song list (or paste text)
  - Enter event date (printed on cards; used for Spotify naming)
  - Configure number of cards (default 200)
  - Generate PDF and download as a single file
  - Display parse summary (counts of songs/artists/titles) and validation errors
  - Optional “seed” advanced option for reproducibility
- Ensure UI does not persist uploaded song lists.

## Milestone 6 — Spotify playlist script
- Add `scripts/create_spotify_playlist.py` that:
  - Reads the same input `.txt`
  - Parses songs
  - Authenticates via Spotify OAuth (Spotipy)
  - Creates a playlist (private) named `Music Bingo - <Event Date>`
  - Searches and adds tracks in batches of 100
  - Writes a report of unmatched tracks

## Milestone 7 — Documentation & handoff
- `README.md`:
  - How to run the app locally
  - Input format examples
  - How to replace the logo assets
  - How to generate PDF output
- Spotify instructions:
  - How to create a Spotify Developer app
  - Which env vars to set
  - How to set redirect URI and authorize

## Acceptance Checklist (Definition of Done)
- Generates a single 200-page A4 PDF with:
  - Logo at top
  - Artists 5×5 grid
  - Titles 5×5 grid
  - Three QR codes at bottom (menu QR always present)
- No two cards are identical (strict signature check).
- Runs fully locally; no DB; uploaded song list not persisted.
- Spotify script can create a playlist and add tracks with a not-found report.
