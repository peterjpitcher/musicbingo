# Music Bingo

Next.js app to generate **black & white** A4 music bingo cards (PDF) from a plain-text song list, plus a helper **Python** script to create a private Spotify playlist from the same list.

## Web app (Next.js)
1) Install:
   - `npm install`
2) Add your logo:
   - Brand/logo (top-right): `public/logo.png`
   - Event logo (top-left): `public/event_logo.jpeg`
3) (Optional) Enable in-app Spotify playlist creation:
   - Copy `.env.example` to `.env.local`
   - Set `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`
   - In your Spotify Developer app settings, add Redirect URIs:
     - `http://127.0.0.1:3000/api/spotify/callback`
     - `http://localhost:3000/api/spotify/callback`
4) (Optional) Configure upcoming event QR codes (from The Anchor management API):
   - Copy `.env.example` to `.env.local`
   - Set `MANAGEMENT_API_BASE_URL` (e.g. `https://management.orangejelly.co.uk`)
   - Set `MANAGEMENT_API_TOKEN` (API key with `read:events`)
   - Restart `npm run dev` after changing env vars
5) Run:
   - `npm run dev`
6) Open the URL shown in your terminal (usually `http://127.0.0.1:3000`), paste/upload your songs, enter the event date, and download the ZIP bundle (PDF + Spotify helper folder).
   - Seed is optional: same seed + same songs = same PDF.

## Spotify playlist script (Python)
You can download a ready-to-run zip from the running app at `http://127.0.0.1:3000/api/download/spotify-script`.
The same helper folder is also included in the main ZIP download from the UI.

1) Download + unzip `spotify_playlist_helper.zip`
2) In the extracted folder:
   - `python3 -m pip install -r requirements.txt`
   - copy `.env.example` → `.env` and fill Spotify values locally (do not commit)
3) Run:
   - Easiest: `python3 create_spotify_playlist.py` (uses `song_list.txt` + `event_date.txt`)
   - Or explicit: `python3 create_spotify_playlist.py --input song_list.txt --event-date "May 1st 2026"`

## Input format
- Ignore decade headers like `1950s (25)`
- Song lines like `Artist – Title` (en-dash preferred; `-` and `—` supported when spaced)

## Notes
- No database; uploaded song lists are processed in-memory only.
