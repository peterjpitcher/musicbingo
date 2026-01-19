import fs from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

export const SPOTIFY_HELPER_FOLDER = "spotify_playlist_helper";

type BuildParams = {
  eventDate?: string;
  songsText?: string;
};

async function loadScriptText(): Promise<string> {
  const scriptPath = path.join(process.cwd(), "scripts", "create_spotify_playlist.py");
  return fs.readFile(scriptPath, "utf8");
}

function requirementsText(): string {
  return [
    "spotipy>=2.23.0",
    "python-dotenv>=1.0.0",
    "tqdm>=4.66.0",
  ].join("\n");
}

function envExampleText(): string {
  return [
    "# Copy to .env and fill in locally. Never commit real values.",
    "SPOTIFY_CLIENT_ID=your_client_id",
    "SPOTIFY_CLIENT_SECRET=your_client_secret",
    "SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback",
    "",
  ].join("\n");
}

function envTemplateText(): string {
  return [
    "# Fill in locally. Never commit real values.",
    "SPOTIFY_CLIENT_ID=",
    "SPOTIFY_CLIENT_SECRET=",
    "SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback",
    "",
  ].join("\n");
}

function readmeText(): string {
  return [
    "# Spotify Playlist Helper",
    "",
    "This folder contains a Python script to create a *private* Spotify playlist from your Music Bingo song list.",
    "",
    "## Get Spotify API keys",
    "1) Create a Spotify Developer app:",
    "   - https://developer.spotify.com/dashboard",
    "2) Copy the **Client ID** and **Client Secret** into your `.env` (below).",
    "3) In the app settings, add the same Redirect URI you use in `.env`.",
    "   - Default: http://127.0.0.1:8888/callback",
    "   - (Optional) also add: http://localhost:8888/callback",
    "",
    "## Setup",
    "1) Install Python 3.10+",
    "2) Install dependencies:",
    "   - python3 -m pip install -r requirements.txt",
    "3) Fill in Spotify credentials:",
    "   - edit .env and fill in SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET",
    "   - make sure SPOTIFY_REDIRECT_URI matches the Redirect URI configured in your Spotify Developer app",
    "   - or just run the script and it will offer to set this up for you",
    "",
    "## Run",
    "- Easiest (uses song_list.txt + event_date.txt):",
    "  python3 create_spotify_playlist.py",
    "",
    "- Or explicitly:",
    "  python3 create_spotify_playlist.py --input song_list.txt --event-date \"May 1st 2026\"",
    "",
    "## Notes",
    "- Input file format matches the Music Bingo app (headers like `1950s (25)` are ignored).",
    "- The script will open a browser for Spotify login the first time.",
    "",
  ].join("\n");
}

export async function addSpotifyHelperFilesToZip(zip: JSZip, params: BuildParams = {}): Promise<void> {
  const scriptText = await loadScriptText();

  const folder = zip.folder(SPOTIFY_HELPER_FOLDER);
  folder?.file("create_spotify_playlist.py", scriptText);
  folder?.file("requirements.txt", requirementsText());
  folder?.file(".env", envTemplateText());
  folder?.file(".env.example", envExampleText());
  folder?.file("README.md", readmeText());
  folder?.file("song_list.txt", params.songsText ?? "");
  folder?.file("event_date.txt", (params.eventDate ?? "").trim() + "\n");
}

export async function buildSpotifyHelperZip(params: BuildParams = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  await addSpotifyHelperFilesToZip(zip, params);
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Uint8Array(zipBuffer);
}
