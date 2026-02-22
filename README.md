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
   - After playlists are created, use **Save Live Session** or **Export Live Session JSON** to prepare event-night host/guest runtime.

## Live runtime (Host + Guest)
### Routes
- Host dashboard: `/host`
- Host controller: `/host/<sessionId>`
- Guest display: `/guest/<sessionId>`

### Event-night flow
1) Build your event pack and Spotify playlists on `/`.
2) Save a Live Session (or export/import JSON).
3) Open `/host`, launch the session controller, then open the guest screen on a second window/display.
4) Start Game 1 or Game 2 from the host controller.
5) Guest reveal schedule per track:
   - 10s: album cover
   - 20s: song title
   - 25s: artist
   - 30s: host auto-advances to next track (when Spotify control is available)

### Spotify permissions and reconnect
- Live playback control requires Spotify scopes:
  - `user-read-playback-state`
  - `user-modify-playback-state`
  - `user-read-currently-playing`
- If you connected Spotify before these scopes were added, click **Disconnect** then **Connect Spotify** again.

### Sync model
- Host and Guest are designed for the same machine/browser profile.
- Primary sync: `BroadcastChannel`.
- Fallback sync: localStorage snapshot polling every 2s.

### Fallback mode
- If Spotify API playback control is unavailable (for example no active device / Premium limitation), live mode switches to **manual host control mode**:
  - Guest reveal/timing still runs.
  - Host controls playback directly in the Spotify app.

## Input format
- Ignore decade headers like `1950s (25)`
- Song lines like `Artist – Title` (en-dash preferred; `-` and `—` supported when spaced)
- Max 50 parsed songs per game list

## Notes
- No database; uploaded song lists are processed in-memory only.
- Vercel project slug: `music-bingo`.
- Git auto-deploy smoke test marker.
