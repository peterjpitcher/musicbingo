# Playlist Load Resilience & Clipboard Spotify Ordering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs — host screen permanently stuck on "Loading playlist…" when the Spotify playlist fetch fails, and clipboard DOCX listing songs in user-typed order rather than Spotify playlist order.

**Architecture:** Two independent changes across three files. Task 1 fixes the host page playlist fetch by adding an in-flight guard ref, moving the lock ref to post-success, and adding an error/retry UI. Task 2 adds playlist IDs to the prep form and fetches Spotify playlist order server-side at generate time.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS, Spotify Web API.

**Spec:** `docs/superpowers/specs/2026-03-11-playlist-resilience-and-clipboard-ordering-design.md`

---

## Chunk 1: Playlist Fetch Resilience (Host Screen)

**File:** `app/host/[sessionId]/page.tsx`

### Task 1: Add state and refs, fix the fetch effect, update the UI

- [ ] **Step 1: Add `playlistLoadError`, `playlistRetryCount` state and `fetchingPlaylistIdRef`**

  Find the block starting at line ~156:
  ```typescript
  const [playlistTracks, setPlaylistTracks] = useState<{ trackId: string; title: string; artist: string }[]>([]);
  const playlistTracksRef = useRef<{ trackId: string; title: string; artist: string }[]>([]);
  const loadedPlaylistIdRef = useRef<string | null>(null);
  ```

  Replace with:
  ```typescript
  const [playlistTracks, setPlaylistTracks] = useState<{ trackId: string; title: string; artist: string }[]>([]);
  const playlistTracksRef = useRef<{ trackId: string; title: string; artist: string }[]>([]);
  const loadedPlaylistIdRef = useRef<string | null>(null);
  // Guards against concurrent in-flight fetches for the same playlist.
  const fetchingPlaylistIdRef = useRef<string | null>(null);
  const [playlistLoadError, setPlaylistLoadError] = useState<boolean>(false);
  const [playlistRetryCount, setPlaylistRetryCount] = useState<number>(0);
  ```

- [ ] **Step 2: Rewrite the playlist fetch effect** (lines ~178–209)

  Find the entire effect:
  ```typescript
  // Fetch the full playlist track listing when the active game changes.
  // Once loaded, resolve the challenge song to its exact Spotify track ID.
  useEffect(() => {
    const game = runtime.activeGameNumber
      ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber) ?? null
      : null;
    const playlistId = game?.playlistId ?? null;
    if (!playlistId || playlistId === loadedPlaylistIdRef.current) return;
    loadedPlaylistIdRef.current = playlistId;
    challengeTrackIdRef.current = null;
    void fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { tracks?: { trackId: string; title: string; artist: string }[] };
        if (!data.tracks) return;
        setPlaylistTracks(data.tracks);
        // Resolve the challenge song track ID by fuzzy-matching stored title/artist against
        // actual Spotify metadata. This is done once so runtime detection uses exact track IDs.
        if (game?.challengeSongTitle && game?.challengeSongArtist) {
          const norm = (s: string) => s.trim().toLowerCase();
          const ct = norm(game.challengeSongTitle);
          const ca = norm(game.challengeSongArtist);
          const match = data.tracks.find((t) => {
            const tt = norm(t.title);
            const ta = norm(t.artist);
            return (tt.includes(ct) || ct.includes(tt)) && (ta.includes(ca) || ca.includes(ta));
          });
          challengeTrackIdRef.current = match?.trackId ?? null;
        }
      })
      .catch(() => {});
  }, [runtime.activeGameNumber, session]);
  ```

  Replace with:
  ```typescript
  // Fetch the full playlist track listing when the active game changes.
  // Once loaded, resolve the challenge song to its exact Spotify track ID.
  // playlistRetryCount is incremented by the Retry button to force a re-fetch after failure.
  useEffect(() => {
    const game = runtime.activeGameNumber
      ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber) ?? null
      : null;
    const playlistId = game?.playlistId ?? null;
    // Skip if no playlist, already successfully loaded, or a fetch is already in flight.
    if (!playlistId || playlistId === loadedPlaylistIdRef.current || playlistId === fetchingPlaylistIdRef.current) return;
    fetchingPlaylistIdRef.current = playlistId;
    setPlaylistLoadError(false);
    challengeTrackIdRef.current = null;
    void fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          fetchingPlaylistIdRef.current = null;
          setPlaylistLoadError(true);
          return;
        }
        const data = (await res.json()) as { tracks?: { trackId: string; title: string; artist: string }[] };
        if (!data.tracks) {
          fetchingPlaylistIdRef.current = null;
          setPlaylistLoadError(true);
          return;
        }
        // Lock the success ref only after a successful response so failures stay retryable.
        loadedPlaylistIdRef.current = playlistId;
        fetchingPlaylistIdRef.current = null;
        setPlaylistTracks(data.tracks);
        // Resolve the challenge song track ID by fuzzy-matching stored title/artist against
        // actual Spotify metadata. This is done once so runtime detection uses exact track IDs.
        if (game?.challengeSongTitle && game?.challengeSongArtist) {
          const norm = (s: string) => s.trim().toLowerCase();
          const ct = norm(game.challengeSongTitle);
          const ca = norm(game.challengeSongArtist);
          const match = data.tracks.find((t) => {
            const tt = norm(t.title);
            const ta = norm(t.artist);
            return (tt.includes(ct) || ct.includes(tt)) && (ta.includes(ca) || ca.includes(ta));
          });
          challengeTrackIdRef.current = match?.trackId ?? null;
        }
      })
      .catch(() => {
        fetchingPlaylistIdRef.current = null;
        setPlaylistLoadError(true);
      });
  }, [runtime.activeGameNumber, session, playlistRetryCount]);
  ```

- [ ] **Step 3: Update the track listing UI** (lines ~1039–1044)

  Find:
  ```typescript
          {playlistTracks.length === 0 ? (
            <p className="text-sm text-slate-400 italic mt-3">
              {runtime.activeGameNumber
                ? "Loading playlist…"
                : "Start a game to see the full track listing here."}
            </p>
          ) : (
  ```

  Replace with:
  ```typescript
          {playlistTracks.length === 0 ? (
            <div className="mt-3">
              {!runtime.activeGameNumber ? (
                <p className="text-sm text-slate-400 italic">Start a game to see the full track listing here.</p>
              ) : playlistLoadError ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-red-500">Failed to load playlist.</p>
                  <button
                    type="button"
                    className="text-sm text-brand-gold underline hover:no-underline"
                    onClick={() => {
                      loadedPlaylistIdRef.current = null;
                      fetchingPlaylistIdRef.current = null;
                      setPlaylistRetryCount((n) => n + 1);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Loading playlist…</p>
              )}
            </div>
          ) : (
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd /Users/peterpitcher/Cursor/OJ-MusicBingo && npm run typecheck
  ```

  Expected: zero errors.

- [ ] **Step 5: Lint**

  ```bash
  npm run lint
  ```

  Expected: zero warnings, zero errors.

- [ ] **Step 6: Build**

  ```bash
  npm run build
  ```

  Expected: successful build.

- [ ] **Step 7: Manual verification**

  Start dev server (`npm run dev`). Open a host session. Start a game. Confirm:
  - **Normal path:** playlist loads and displays correctly, no change to existing behaviour
  - **Error path:** temporarily change the fetch URL in the effect to `/api/spotify/playlist/INVALID/tracks`, reload — confirm red "Failed to load playlist." text + "Retry" link appear instead of perpetual "Loading playlist…"
  - **Retry path:** click Retry — confirm the fetch fires again (visible in Network tab)
  - **Recovery path:** restore the correct URL, click Retry — confirm playlist loads and the track list appears

- [ ] **Step 8: Commit**

  ```bash
  git add "app/host/[sessionId]/page.tsx"
  git commit -m "fix: retry playlist fetch on failure instead of silently sticking on loading

  loadedPlaylistIdRef was set before the fetch fired, so any failure
  permanently blocked retry for the rest of the session. Added
  fetchingPlaylistIdRef to guard against concurrent fetches. The lock
  ref is now only written on success. On failure, playlistLoadError is
  set and a Retry button lets the host recover without a page refresh."
  ```

---

## Chunk 2: Clipboard Spotify Ordering

**Files:**
- `app/page.tsx` — add playlist IDs to the generate form payload
- `app/api/generate/route.ts` — fetch Spotify order server-side, sort songs before rendering clipboard

### Task 2a: Send playlist IDs from the prep form

- [ ] **Step 1: Update `buildBaseFormData` in `app/page.tsx`** to include playlist IDs when Spotify playlists have been created

  Find (lines ~178–188):
  ```typescript
  function buildBaseFormData(): FormData {
    const form = new FormData();
    form.set("event_date", eventDate);
    form.set("game1_theme", game1Theme);
    form.set("game2_theme", game2Theme);
    form.set("game1_songs", game1SongsText);
    form.set("game2_songs", game2SongsText);
    form.set("game1_challenge_song", game1ChallengeSong);
    form.set("game2_challenge_song", game2ChallengeSong);
    return form;
  }
  ```

  Replace with:
  ```typescript
  function buildBaseFormData(): FormData {
    const form = new FormData();
    form.set("event_date", eventDate);
    form.set("game1_theme", game1Theme);
    form.set("game2_theme", game2Theme);
    form.set("game1_songs", game1SongsText);
    form.set("game2_songs", game2SongsText);
    form.set("game1_challenge_song", game1ChallengeSong);
    form.set("game2_challenge_song", game2ChallengeSong);
    // Include playlist IDs when Spotify playlists have been created so the generate
    // route can sort the clipboard DOCX songs to match the Spotify playlist order.
    if (livePlaylistByGame?.game1.playlistId) {
      form.set("game1_playlist_id", livePlaylistByGame.game1.playlistId);
    }
    if (livePlaylistByGame?.game2.playlistId) {
      form.set("game2_playlist_id", livePlaylistByGame.game2.playlistId);
    }
    return form;
  }
  ```

### Task 2b: Fetch Spotify order and sort songs in the generate route

- [ ] **Step 2: Add imports** to `app/api/generate/route.ts`

  Find:
  ```typescript
  import type { Card, ParseResult, Song } from "@/lib/types";
  import { sanitizeFilenamePart } from "@/lib/utils";
  ```

  Replace with:
  ```typescript
  import { cookies } from "next/headers";
  import {
    getOrRefreshAccessToken,
    spotifyApiRequest,
    SPOTIFY_COOKIE_ACCESS,
  } from "@/lib/spotifyWeb";
  import type { Card, ParseResult, Song } from "@/lib/types";
  import { sanitizeFilenamePart } from "@/lib/utils";
  ```

- [ ] **Step 3: Add helpers before `makeBundleFilename`** in `app/api/generate/route.ts`

  Find:
  ```typescript
  function makeBundleFilename(eventDate: string): string {
  ```

  Insert before it:
  ```typescript
  const COOKIE_REFRESH = "spotify_refresh_token";

  type SpotifyTrack = { trackId: string; title: string; artist: string };

  /**
   * Fetch playlist tracks from Spotify and return them in playlist order.
   * Returns null on any failure so callers can degrade gracefully to user-input order.
   *
   * Token handling: cookies() returns ReadonlyRequestCookies in Route Handlers so
   * token write-back is not possible here without threading results through to a
   * NextResponse. The generate route is not the primary auth surface — the dedicated
   * /api/spotify/playlist/[id]/tracks route handles rotation. Token rotation here is
   * therefore best-effort: reads use the current cached token, rotated values are
   * discarded. In practice this is rare and the user will re-authenticate naturally
   * on the next interactive Spotify request.
   */
  async function fetchSpotifyPlaylistTracks(
    playlistId: string,
    origin: string
  ): Promise<SpotifyTrack[] | null> {
    if (!playlistId.trim()) return null;

    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(COOKIE_REFRESH)?.value ?? "";
    if (!refreshToken.trim()) return null;

    let accessToken: string;
    try {
      const result = await getOrRefreshAccessToken({
        refreshToken,
        cachedRaw: cookieStore.get(SPOTIFY_COOKIE_ACCESS)?.value ?? null,
        origin,
      });
      accessToken = result.accessToken;
    } catch {
      console.warn("[music-bingo] Could not refresh Spotify token for clipboard ordering — using input order.");
      return null;
    }

    try {
      const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?fields=items(track(id,name,artists(name)))&limit=100`;
      const res = await spotifyApiRequest({ accessToken, url });
      if (!res.ok) {
        console.warn(`[music-bingo] Spotify playlist fetch failed (HTTP ${res.status}) — using input order.`);
        return null;
      }
      const json = (await res.json()) as { items?: unknown[] };
      return (json.items ?? [])
        .map((item: unknown) => {
          const t = (item as { track?: { id?: string; name?: string; artists?: { name?: string }[] } })?.track;
          if (!t || typeof t.id !== "string") return null;
          // Only the first listed artist is used — matching the behaviour of the host page
          // playlist fetch. Songs with multiple artists may not match if entered differently.
          const artist = Array.isArray(t.artists) && t.artists.length > 0
            ? String(t.artists[0]?.name ?? "")
            : "";
          return { trackId: t.id, title: String(t.name ?? ""), artist };
        })
        .filter((t): t is SpotifyTrack => t !== null);
    } catch {
      console.warn("[music-bingo] Error fetching Spotify playlist for clipboard ordering — using input order.");
      return null;
    }
  }

  /**
   * Sort songs to match Spotify playlist order using normalised artist+title key matching.
   * Songs with no Spotify match are appended at the end in their original relative order.
   * The returned array always contains all input songs — count is always preserved.
   */
  function sortSongsBySpotifyOrder(songs: Song[], spotifyTracks: SpotifyTrack[] | null): Song[] {
    if (!spotifyTracks || spotifyTracks.length === 0) return songs;
    const norm = (s: string) => s.trim().toLowerCase();
    const spotifyIndex = new Map<string, number>();
    spotifyTracks.forEach((t, i) => {
      spotifyIndex.set(`${norm(t.artist)}|${norm(t.title)}`, i);
    });
    return [...songs].sort((a, b) => {
      const ia = spotifyIndex.get(`${norm(a.artist)}|${norm(a.title)}`) ?? Infinity;
      const ib = spotifyIndex.get(`${norm(b.artist)}|${norm(b.title)}`) ?? Infinity;
      return ia - ib;
    });
  }

  function makeBundleFilename(eventDate: string): string {
  ```

- [ ] **Step 4: Fetch Spotify playlist order and sort songs** inside the `POST` handler, after card generation and before the QR/event section

  Find:
  ```typescript
    } catch (err: any) {
      return new Response(err?.message ? String(err.message) : "Failed to generate cards.", { status: 400 });
    }

    let eventItems: Array<{ label: string; url: string | null }> = [];
  ```

  Replace with:
  ```typescript
    } catch (err: any) {
      return new Response(err?.message ? String(err.message) : "Failed to generate cards.", { status: 400 });
    }

    // Fetch Spotify playlist order for both games in parallel so the clipboard DOCX
    // lists songs in the same order they will play. Degrades gracefully if Spotify
    // auth is unavailable or playlist IDs were not provided (e.g. pre-Spotify generate).
    const game1PlaylistId = asString(form.get("game1_playlist_id")).trim();
    const game2PlaylistId = asString(form.get("game2_playlist_id")).trim();
    const requestOrigin = new URL(request.url).origin;
    const [spotifyTracksGame1, spotifyTracksGame2] = await Promise.all([
      fetchSpotifyPlaylistTracks(game1PlaylistId, requestOrigin),
      fetchSpotifyPlaylistTracks(game2PlaylistId, requestOrigin),
    ]);
    const sortedGame1Songs = sortSongsBySpotifyOrder(parsedGame1.songs, spotifyTracksGame1);
    const sortedGame2Songs = sortSongsBySpotifyOrder(parsedGame2.songs, spotifyTracksGame2);

    let eventItems: Array<{ label: string; url: string | null }> = [];
  ```

- [ ] **Step 5: Use sorted songs in `renderClipboardDocx`**

  Find:
  ```typescript
      renderClipboardDocx({
        eventDateInput,
        game1: {
          theme: game1Theme,
          songs: parsedGame1.songs,
          challengeSong: game1ChallengeSong,
        },
        game2: {
          theme: game2Theme,
          songs: parsedGame2.songs,
          challengeSong: game2ChallengeSong,
        },
      }),
  ```

  Replace with:
  ```typescript
      renderClipboardDocx({
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
      }),
  ```

- [ ] **Step 6: Type-check**

  ```bash
  cd /Users/peterpitcher/Cursor/OJ-MusicBingo && npm run typecheck
  ```

  Expected: zero errors.

- [ ] **Step 7: Lint**

  ```bash
  npm run lint
  ```

  Expected: zero warnings, zero errors.

- [ ] **Step 8: Full build**

  ```bash
  npm run build
  ```

  Expected: successful build, no errors.

- [ ] **Step 9: Manual verification**

  In the prep flow:
  - Create playlists for both games via Spotify connect
  - Enter songs in the text boxes in a **different order** to how they appear in the Spotify playlist
  - Click Generate — download the ZIP
  - Open the clipboard DOCX — confirm the song list matches the Spotify playlist order, not the typed order
  - **Graceful degradation test:** refresh the page so Spotify is disconnected, enter songs, generate — confirm it still produces a valid DOCX with songs in original typed order (no crash)

- [ ] **Step 10: Commit**

  ```bash
  git add app/page.tsx app/api/generate/route.ts
  git commit -m "feat: sort clipboard DOCX song list by Spotify playlist order at generate time

  Adds game1_playlist_id and game2_playlist_id to the prep form payload
  when Spotify playlists are available. The generate route fetches each
  playlist from Spotify and sorts the clipboard song list to match.
  Unmatched songs are appended at the end. Degrades gracefully when
  Spotify auth is unavailable or playlist IDs are not provided."
  ```

---

## Final Step: Push

- [ ] **Push both commits**

  ```bash
  git push origin main
  ```

  Expected: both commits push cleanly, Vercel build succeeds.
