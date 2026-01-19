import { formatEventDateDisplay } from "@/lib/eventDate";
import { buildSpotifyHelperZip } from "@/lib/spotifyHelperZip";

export const runtime = "nodejs";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function GET() {
  const zipBytes = await buildSpotifyHelperZip();
  const body = new Uint8Array(zipBytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="spotify_playlist_helper.zip"',
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();

  const eventDateInput = asString(form.get("event_date")).trim();
  if (!eventDateInput) {
    return new Response("Event date is required.", { status: 400 });
  }
  const eventDate = formatEventDateDisplay(eventDateInput);

  let songsText = asString(form.get("songs"));
  const file = form.get("file");
  if (file && typeof file !== "string") {
    songsText = await file.text();
  }

  if (!songsText.trim()) {
    return new Response("Provide a song list (paste text or upload a .txt file).", { status: 400 });
  }

  const zipBytes = await buildSpotifyHelperZip({ eventDate, songsText });
  const body = new Uint8Array(zipBytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="spotify_playlist_helper.zip"',
      "Cache-Control": "no-store",
    },
  });
}
