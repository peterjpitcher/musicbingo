import JSZip from "jszip";

import { renderClipboardDocx } from "@/lib/clipboardDocx";
import { formatEventDateDisplay } from "@/lib/eventDate";
import { generateCards } from "@/lib/generator";
import {
  normalizeGameTheme,
  parseGameSongsText,
  resolveChallengeSong,
  resolveChallengeSongs,
} from "@/lib/gameInput";
import { fetchUpcomingEventDetails } from "@/lib/managementApi";
import type { EventDetail } from "@/lib/managementApi";
import {
  loadDefaultEventLogoPngBytes,
  loadDefaultLogoPngBytes,
  renderCardsPdf,
  renderEventsPage,
} from "@/lib/pdf";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { cookies } from "next/headers";
import {
  getOrRefreshAccessToken,
  spotifyApiRequest,
  SPOTIFY_COOKIE_ACCESS,
} from "@/lib/spotifyWeb";
import type { Card, ParseResult, Song } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";
import { resolveBrandConfig } from "@/lib/brands/brandRepo";
import { fetchBrandLogoPngBytes } from "@/lib/brands/brandStorage";
import type { BrandConfig } from "@/lib/brands/types";

export const runtime = "nodejs";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}


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
  return `music-bingo-event-pack-${sanitizeFilenamePart(eventDate, "event")}.zip`;
}

function makeGamePdfFilename(eventDate: string, gameNumber: 1 | 2): string {
  return `music-bingo-game-${gameNumber}-${sanitizeFilenamePart(eventDate, "event")}.pdf`;
}

function makeClipboardFilename(eventDate: string): string {
  return `event-clipboard-${sanitizeFilenamePart(eventDate, "event")}.docx`;
}

async function renderGamePdfWithEvents(params: {
  cards: Card[];
  eventDate: string;
  theme: string;
  logoLeftPngBytes: Uint8Array | null;
  logoRightPngBytes: Uint8Array | null;
  events: EventDetail[];
  brandConfig: BrandConfig | null;
}): Promise<Uint8Array> {
  const cardsPdfBytes = await renderCardsPdf(params.cards, {
    eventDate: params.eventDate,
    theme: params.theme,
    logoLeftPngBytes: params.logoLeftPngBytes,
    logoRightPngBytes: params.logoRightPngBytes,
    showCardId: true,
    brandConfig: params.brandConfig,
  });

  const pdf = await PDFDocument.load(cardsPdfBytes);
  const cardPageCount = pdf.getPageCount();

  for (let i = cardPageCount - 1; i >= 0; i--) {
    const tempPdf = await PDFDocument.create();
    const tempFont = await tempPdf.embedFont(StandardFonts.Helvetica);
    const tempFontBold = await tempPdf.embedFont(StandardFonts.HelveticaBold);

    await renderEventsPage(tempPdf, tempFont, tempFontBold, {
      events: params.events,
      logoLeftPngBytes: params.logoLeftPngBytes,
      logoRightPngBytes: params.logoRightPngBytes,
      brandConfig: params.brandConfig,
    });

    const [copiedPage] = await pdf.copyPages(tempPdf, [0]);
    pdf.insertPage(i + 1, copiedPage);
  }

  return new Uint8Array(await pdf.save());
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const eventDateInput = asString(form.get("event_date")).trim();
    if (!eventDateInput) {
      return new Response("Event date is required.", { status: 400 });
    }
    const eventDateDisplay = formatEventDateDisplay(eventDateInput);

    const CARDS_PER_PAGE = 6;
    const pagesRaw = asString(form.get("count")).trim() || "40";
    const pages = Number.parseInt(pagesRaw, 10);
    if (!Number.isFinite(pages) || pages < 1 || pages > 200) {
      return new Response("Pages must be a whole number between 1 and 200.", { status: 400 });
    }
    const count = pages * CARDS_PER_PAGE;

    const seed = asString(form.get("seed")).trim();
    const game1SongsText = asString(form.get("game1_songs"));
    const game2SongsText = asString(form.get("game2_songs"));
    const game1Theme = normalizeGameTheme(asString(form.get("game1_theme")));
    const game2Theme = normalizeGameTheme(asString(form.get("game2_theme")));

    let parsedGame1: ParseResult;
    let parsedGame2: ParseResult;
    let game1ChallengeSongsList: Song[];
    let game2ChallengeSongsList: Song[];
    let game1IntroSong: Song | undefined;
    let game2IntroSong: Song | undefined;
    try {
      parsedGame1 = parseGameSongsText(game1SongsText, "Game 1");
      parsedGame2 = parseGameSongsText(game2SongsText, "Game 2");

      const game1ChallengeRaw = asString(form.get("game1_challenge_songs"));
      const game2ChallengeRaw = asString(form.get("game2_challenge_songs"));
      const game1ChallengeArr: string[] = game1ChallengeRaw ? JSON.parse(game1ChallengeRaw) : [];
      const game2ChallengeArr: string[] = game2ChallengeRaw ? JSON.parse(game2ChallengeRaw) : [];

      if (game1ChallengeArr.length > 0) {
        game1ChallengeSongsList = resolveChallengeSongs(game1ChallengeArr, parsedGame1.songs, "Game 1 challenge");
      } else {
        game1ChallengeSongsList = [resolveChallengeSong(
          asString(form.get("game1_challenge_song")), parsedGame1.songs, "Game 1 dancing challenge"
        )];
      }
      if (game2ChallengeArr.length > 0) {
        game2ChallengeSongsList = resolveChallengeSongs(game2ChallengeArr, parsedGame2.songs, "Game 2 challenge");
      } else {
        game2ChallengeSongsList = [resolveChallengeSong(
          asString(form.get("game2_challenge_song")), parsedGame2.songs, "Game 2 sing-along challenge"
        )];
      }

      const game1IntroRaw = asString(form.get("game1_intro_song"));
      const game2IntroRaw = asString(form.get("game2_intro_song"));
      if (game1IntroRaw) {
        game1IntroSong = resolveChallengeSong(game1IntroRaw, parsedGame1.songs, "Game 1 intro");
      }
      if (game2IntroRaw) {
        game2IntroSong = resolveChallengeSong(game2IntroRaw, parsedGame2.songs, "Game 2 intro");
      }
    } catch (err: any) {
      return new Response(err?.message ? String(err.message) : "Invalid game inputs.", { status: 400 });
    }

    let cardsGame1: Card[];
    let cardsGame2: Card[];
    try {
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
    } catch (err: any) {
      return new Response(err?.message ? String(err.message) : "Failed to generate cards.", { status: 400 });
    }

    // Fetch Spotify playlist order for both games in parallel so the clipboard DOCX
    // lists songs in the same order they will play. Degrades gracefully if Spotify
    // auth is unavailable or playlist IDs were not provided (e.g. pre-Spotify generate).
    const game1PlaylistId = asString(form.get("game1_playlist_id")).trim();
    const game2PlaylistId = asString(form.get("game2_playlist_id")).trim();
    const origin = new URL(request.url).origin;
    const [spotifyTracksGame1, spotifyTracksGame2] = await Promise.all([
      fetchSpotifyPlaylistTracks(game1PlaylistId, origin),
      fetchSpotifyPlaylistTracks(game2PlaylistId, origin),
    ]);
    const sortedGame1Songs = sortSongsBySpotifyOrder(parsedGame1.songs, spotifyTracksGame1);
    const sortedGame2Songs = sortSongsBySpotifyOrder(parsedGame2.songs, spotifyTracksGame2);

    const brandId = asString(form.get("brand_id")).trim() || null;
    const brandConfig = await resolveBrandConfig(brandId);

    const upcomingEvents = await fetchUpcomingEventDetails({ eventDateDisplay: eventDateInput });

    let logoRightPngBytes: Uint8Array | null = null;
    let logoLeftPngBytes: Uint8Array | null = null;
    if (brandConfig) {
      const [darkLogo, lightLogo] = await Promise.all([
        fetchBrandLogoPngBytes(brandConfig.logo_dark_url),
        fetchBrandLogoPngBytes(brandConfig.logo_light_url),
      ]);
      logoRightPngBytes = darkLogo;
      logoLeftPngBytes = lightLogo;
    }
    if (!logoRightPngBytes) {
      logoRightPngBytes = await loadDefaultLogoPngBytes({ origin });
    }
    if (!logoLeftPngBytes) {
      logoLeftPngBytes = await loadDefaultEventLogoPngBytes({ origin });
    }

    const [pdfGame1Bytes, pdfGame2Bytes, clipboardDocxBytes] = await Promise.all([
      renderGamePdfWithEvents({
        cards: cardsGame1,
        eventDate: eventDateDisplay,
        theme: game1Theme,
        logoLeftPngBytes,
        logoRightPngBytes,
        events: upcomingEvents,
        brandConfig,
      }),
      renderGamePdfWithEvents({
        cards: cardsGame2,
        eventDate: eventDateDisplay,
        theme: game2Theme,
        logoLeftPngBytes,
        logoRightPngBytes,
        events: upcomingEvents,
        brandConfig,
      }),
      renderClipboardDocx({
        eventDateInput,
        game1: {
          theme: game1Theme,
          songs: sortedGame1Songs,
          challengeSongs: game1ChallengeSongsList,
          introSong: game1IntroSong,
        },
        game2: {
          theme: game2Theme,
          songs: sortedGame2Songs,
          challengeSongs: game2ChallengeSongsList,
          introSong: game2IntroSong,
        },
        upcomingEvents,
      }),
    ]);

    const zip = new JSZip();
    zip.file(makeGamePdfFilename(eventDateDisplay, 1), pdfGame1Bytes);
    zip.file(makeGamePdfFilename(eventDateDisplay, 2), pdfGame2Bytes);
    zip.file(makeClipboardFilename(eventDateDisplay), clipboardDocxBytes);

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    const filename = makeBundleFilename(eventDateDisplay);
    const body = new Uint8Array(zipBytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : "Failed to generate output bundle.";
    return new Response(msg, { status: 500 });
  }
}
