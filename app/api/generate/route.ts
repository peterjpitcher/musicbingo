import JSZip from "jszip";

import { renderClipboardDocx } from "@/lib/clipboardDocx";
import { formatEventDateDisplay } from "@/lib/eventDate";
import { generateCards } from "@/lib/generator";
import {
  normalizeGameTheme,
  parseGameSongsText,
  resolveChallengeSong,
} from "@/lib/gameInput";
import { fetchNextUpcomingEventLinks } from "@/lib/managementApi";
import {
  loadDefaultEventLogoPngBytes,
  loadDefaultLogoPngBytes,
  renderCardsPdf,
} from "@/lib/pdf";
import type { Card, ParseResult, Song } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";

export const runtime = "nodejs";

const EVENT_QR_COUNT = 4;

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
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

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const eventDateInput = asString(form.get("event_date")).trim();
    if (!eventDateInput) {
      return new Response("Event date is required.", { status: 400 });
    }
    const eventDateDisplay = formatEventDateDisplay(eventDateInput);

    const countRaw = asString(form.get("count")).trim() || "40";
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 1 || count > 1000) {
      return new Response("Count must be a whole number between 1 and 1000.", { status: 400 });
    }

    const seed = asString(form.get("seed")).trim();
    const game1SongsText = asString(form.get("game1_songs"));
    const game2SongsText = asString(form.get("game2_songs"));
    const game1Theme = normalizeGameTheme(asString(form.get("game1_theme")));
    const game2Theme = normalizeGameTheme(asString(form.get("game2_theme")));

    let parsedGame1: ParseResult;
    let parsedGame2: ParseResult;
    let game1ChallengeSong: Song;
    let game2ChallengeSong: Song;
    try {
      parsedGame1 = parseGameSongsText(game1SongsText, "Game 1");
      parsedGame2 = parseGameSongsText(game2SongsText, "Game 2");
      game1ChallengeSong = resolveChallengeSong(
        asString(form.get("game1_challenge_song")),
        parsedGame1.songs,
        "Game 1 dancing challenge"
      );
      game2ChallengeSong = resolveChallengeSong(
        asString(form.get("game2_challenge_song")),
        parsedGame2.songs,
        "Game 2 sing-along challenge"
      );
    } catch (err: any) {
      return new Response(err?.message ? String(err.message) : "Invalid game inputs.", { status: 400 });
    }

    let cardsGame1: Card[];
    let cardsGame2: Card[];
    try {
      cardsGame1 = generateCards({
        uniqueArtists: parsedGame1.uniqueArtists,
        uniqueTitles: parsedGame1.uniqueTitles,
        count,
        seed: seed || undefined,
      });
      cardsGame2 = generateCards({
        uniqueArtists: parsedGame2.uniqueArtists,
        uniqueTitles: parsedGame2.uniqueTitles,
        count,
        seed: seed ? `${seed}-game-2` : undefined,
      });
    } catch (err: any) {
      return new Response(err?.message ? String(err.message) : "Failed to generate cards.", { status: 400 });
    }

    let eventItems: Array<{ label: string; url: string | null }> = [];
    let qrStatus: "ok" | "missing_config" | "no_events" | "error" = "missing_config";
    let qrError: string | null = null;
    const managementConfigured = Boolean(process.env.MANAGEMENT_API_BASE_URL?.trim()) && Boolean(process.env.MANAGEMENT_API_TOKEN?.trim());
    if (!managementConfigured) {
      qrStatus = "missing_config";
      console.warn("[music-bingo] MANAGEMENT_API_* not configured; event QR codes will be placeholders.");
    } else {
      try {
        eventItems = await fetchNextUpcomingEventLinks({ eventDateDisplay: eventDateInput, count: EVENT_QR_COUNT });
        qrStatus = eventItems.length ? "ok" : "no_events";
      } catch (err) {
        qrStatus = "error";
        qrError = err instanceof Error ? err.message : "Failed to fetch upcoming events.";
        console.warn("[music-bingo] Failed to fetch upcoming events for QR codes:", err);
        eventItems = [];
      }
    }

    const fetchedEventCount = eventItems.length;
    const fetchedEventWithUrlCount = eventItems.filter((item) => Boolean(item.url && item.url.trim())).length;

    while (eventItems.length < EVENT_QR_COUNT) {
      eventItems.push({ label: `Next Event ${eventItems.length + 1}`, url: null });
    }
    const footerItems = eventItems.slice(0, EVENT_QR_COUNT);

    const origin = new URL(request.url).origin;
    const logoRightPngBytes = await loadDefaultLogoPngBytes({ origin });
    const logoLeftPngBytes = await loadDefaultEventLogoPngBytes({ origin });

    const [pdfGame1Bytes, pdfGame2Bytes, clipboardDocxBytes] = await Promise.all([
      renderCardsPdf(cardsGame1, {
        eventDate: eventDateDisplay,
        footerItems,
        logoLeftPngBytes,
        logoRightPngBytes,
        showCardId: true,
      }),
      renderCardsPdf(cardsGame2, {
        eventDate: eventDateDisplay,
        footerItems,
        logoLeftPngBytes,
        logoRightPngBytes,
        showCardId: true,
      }),
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
        "X-Music-Bingo-QR-Status": qrStatus,
        "X-Music-Bingo-Events-Requested": String(EVENT_QR_COUNT),
        "X-Music-Bingo-Events-Count": String(fetchedEventCount),
        "X-Music-Bingo-Events-With-Url": String(fetchedEventWithUrlCount),
        ...(qrError ? { "X-Music-Bingo-QR-Error": qrError.slice(0, 200) } : {}),
      },
    });
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : "Failed to generate output bundle.";
    return new Response(msg, { status: 500 });
  }
}
