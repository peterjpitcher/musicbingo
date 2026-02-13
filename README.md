# Music Bingo

Next.js app to generate a full Music Bingo event pack from two plain-text song lists:
- Game 1 cards PDF
- Game 2 cards PDF
- Event Clipboard DOCX (with schedule, bonus challenge songs, and both 1-50 song lists)
- Two private Spotify playlists (one per game)

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
     - `https://musicbingo-iota.vercel.app/api/spotify/callback` (production)
4) (Optional) Configure upcoming event QR codes (from The Anchor management API):
   - Copy `.env.example` to `.env.local`
   - Set `MANAGEMENT_API_BASE_URL` (e.g. `https://management.orangejelly.co.uk`)
   - Set `MANAGEMENT_API_TOKEN` (API key with `read:events`)
   - Optional: set `MANAGEMENT_PUBLIC_EVENTS_BASE_URL` if your customer-facing event site is not `https://www.the-anchor.pub`
   - Restart `npm run dev` after changing env vars
5) Run:
   - `npm run dev`
6) Open the URL shown in your terminal (usually `http://127.0.0.1:3000`), paste songs for both games, set themes, choose challenge songs, enter the event date, and click **Generate Event Pack + Create 2 Spotify Playlists**.
   - Download is a single zip with 2 PDFs + 1 DOCX.
   - Spotify playlist creation requires a one-time “Connect Spotify” step.

## Input format
- Ignore decade headers like `1950s (25)`
- Song lines like `Artist – Title` (en-dash preferred; `-` and `—` supported when spaced)
- Max 50 parsed songs per game list

## Notes
- No database; uploaded song lists are processed in-memory only.
