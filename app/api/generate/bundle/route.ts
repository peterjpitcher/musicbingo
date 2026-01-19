import JSZip from "jszip";

import { formatEventDateDisplay } from "@/lib/eventDate";
import { generateCards } from "@/lib/generator";
import { fetchNextUpcomingEventLinks } from "@/lib/managementApi";
import { parseSongListText } from "@/lib/parser";
import {
  loadDefaultEventLogoPngBytes,
  loadDefaultLogoPngBytes,
  makeDefaultFilename,
  renderCardsPdf,
} from "@/lib/pdf";
import { addSpotifyHelperFilesToZip } from "@/lib/spotifyHelperZip";

export const runtime = "nodejs";

const EVENT_QR_COUNT = 4;

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const eventDateInput = asString(form.get("event_date")).trim();
    if (!eventDateInput) {
      return new Response("Event date is required.", { status: 400 });
    }
    const eventDateDisplay = formatEventDateDisplay(eventDateInput);

    const countRaw = asString(form.get("count")).trim() || "200";
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 1 || count > 1000) {
      return new Response("Count must be a whole number between 1 and 1000.", { status: 400 });
    }

    const seed = asString(form.get("seed")).trim();

    let text = asString(form.get("songs"));
    const file = form.get("file");
    if (file && typeof file !== "string") {
      text = await file.text();
    }

    if (!text.trim()) {
      return new Response("Provide a song list (paste text or upload a .txt file).", { status: 400 });
    }

    const parsed = parseSongListText(text);
    const cards = generateCards({
      uniqueArtists: parsed.uniqueArtists,
      uniqueTitles: parsed.uniqueTitles,
      count,
      seed: seed || undefined,
    });

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
    const pdfBytes = await renderCardsPdf(cards, {
      eventDate: eventDateDisplay,
      footerItems,
      logoLeftPngBytes,
      logoRightPngBytes,
      showCardId: true,
    });

    const pdfFilename = makeDefaultFilename(eventDateDisplay);
    const zipFilename = pdfFilename.replace(/\.pdf$/i, ".zip");

    const zip = new JSZip();
    zip.file(pdfFilename, pdfBytes);
    await addSpotifyHelperFilesToZip(zip, { eventDate: eventDateDisplay, songsText: text });

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const body = new Uint8Array(zipBuffer);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Cache-Control": "no-store",
        "X-Music-Bingo-QR-Status": qrStatus,
        "X-Music-Bingo-Events-Requested": String(EVENT_QR_COUNT),
        "X-Music-Bingo-Events-Count": String(fetchedEventCount),
        "X-Music-Bingo-Events-With-Url": String(fetchedEventWithUrlCount),
        ...(qrError ? { "X-Music-Bingo-QR-Error": qrError.slice(0, 200) } : {}),
      },
    });
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : "Failed to generate ZIP.";
    return new Response(msg, { status: 500 });
  }
}

