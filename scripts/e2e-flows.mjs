#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 3100;
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT_DIR = resolve(process.cwd(), "output", "playwright");
const DOWNLOAD_PATH = resolve(OUTPUT_DIR, "music-bingo-event-pack.zip");

function makeNodeOptions() {
  const existing = process.env.NODE_OPTIONS?.trim() ?? "";
  const localStorageFlag = "--localstorage-file=.next/node-localstorage.json";
  if (existing.includes("--localstorage-file")) return existing;
  return `${existing} ${localStorageFlag}`.trim();
}

async function waitForServerReady(timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/spotify/status`, { cache: "no-store" });
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${BASE_URL}`);
}

function startAppServer() {
  const nextScript = resolve(process.cwd(), "scripts", "next-with-localstorage.mjs");
  const child = spawn(process.execPath, [nextScript, "dev", "--hostname", HOST, "--port", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: makeNodeOptions(),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  return child;
}

async function stopAppServer(child) {
  if (child.exitCode !== null || child.signalCode) return;

  const signalTarget = process.platform === "win32" ? child.pid : -child.pid;
  try {
    if (signalTarget) process.kill(signalTarget, "SIGTERM");
  } catch {}

  const startedAt = Date.now();
  while (child.exitCode === null && Date.now() - startedAt < 10_000) {
    await sleep(100);
  }
  if (child.exitCode === null) {
    try {
      if (signalTarget) process.kill(signalTarget, "SIGKILL");
    } catch {}
  }
}

function makeSongList(prefix, count = 26) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `${prefix} Artist ${n} - ${prefix} Song ${n}`;
  }).join("\n");
}

async function waitUntilEnabled(locator, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await locator.isDisabled())) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for submit button to enable.");
}

async function installSpotifyMocks(context, options) {
  const state = {
    connected: options.initialConnected,
    statusCalls: 0,
    authorizeCalls: 0,
    createCalls: 0,
    disconnectCalls: 0,
  };

  await context.route("**/api/spotify/status", async (route) => {
    state.statusCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: state.connected }),
      headers: { "Cache-Control": "no-store" },
    });
  });

  await context.route("**/api/spotify/authorize", async (route) => {
    state.authorizeCalls += 1;
    state.connected = true;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><script>
        (function () {
          try {
            if (window.opener) {
              window.opener.postMessage({ type: "spotify-auth", ok: true, error: null }, window.location.origin);
            }
          } catch (e) {}
          try { window.close(); } catch (e) {}
        })();
      </script></body></html>`,
    });
  });

  await context.route("**/api/spotify/create-playlist", async (route) => {
    state.createCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        playlists: [
          {
            gameNumber: 1,
            theme: "General 70's to 2010's",
            playlistId: "mock-game-1",
            playlistName: "Music Bingo Game 1",
            playlistUrl: "https://open.spotify.com/playlist/mock-game-1",
            totalSongs: 26,
            addedCount: 26,
            notFoundCount: 0,
            notFound: [],
          },
          {
            gameNumber: 2,
            theme: "General 70's to 2010's",
            playlistId: "mock-game-2",
            playlistName: "Music Bingo Game 2",
            playlistUrl: "https://open.spotify.com/playlist/mock-game-2",
            totalSongs: 26,
            addedCount: 26,
            notFoundCount: 0,
            notFound: [],
          },
        ],
      }),
    });
  });

  await context.route("**/api/spotify/disconnect", async (route) => {
    state.disconnectCalls += 1;
    state.connected = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true }),
    });
  });

  return state;
}

async function installSpotifyLiveMocks(context, options = {}) {
  const state = {
    connected: options.initialConnected ?? true,
    canControlPlayback: options.canControlPlayback ?? true,
    statusCalls: 0,
    commandCalls: 0,
    activeGame: 1,
    trackIndex: 0,
    progressMs: 0,
    isPlaying: false,
  };

  const tracksByGame = {
    1: [
      { trackId: "track-g1-1", title: "Flow Live Song One", artist: "Flow Live Artist A" },
      { trackId: "track-g1-2", title: "Flow Live Song Two", artist: "Flow Live Artist B" },
    ],
    2: [
      { trackId: "track-g2-1", title: "Flow Live Song Three", artist: "Flow Live Artist C" },
      { trackId: "track-g2-2", title: "Flow Live Song Four", artist: "Flow Live Artist D" },
    ],
  };

  await context.route("**/api/spotify/playlist/*/tracks", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const playlistId = parts.at(-2) ?? "";
    const gameNumber = playlistId.includes("2") ? 2 : 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ tracks: tracksByGame[gameNumber] ?? tracksByGame[1] }),
    });
  });

  const currentTrack = () => {
    const tracks = tracksByGame[state.activeGame] ?? tracksByGame[1];
    return tracks[state.trackIndex % tracks.length];
  };

  const buildSnapshot = () => {
    const track = currentTrack();
    return {
      connected: state.connected,
      canControlPlayback: state.canControlPlayback,
      activeDevice: state.canControlPlayback
        ? {
          id: "device-1",
          name: "Mock Laptop",
          type: "Computer",
          isActive: true,
          isRestricted: false,
        }
        : null,
      playback: {
        trackId: track.trackId,
        title: track.title,
        artist: track.artist,
        albumImageUrl: "https://example.com/mock-cover.jpg",
        progressMs: state.progressMs,
        durationMs: 180000,
        isPlaying: state.isPlaying,
      },
      warnings: state.canControlPlayback ? [] : ["Manual host control mode active."],
    };
  };

  await context.route("**/api/spotify/live/status", async (route) => {
    state.statusCalls += 1;
    if (state.isPlaying) {
      state.progressMs += 8_000;
      if (state.progressMs > 35_000) state.progressMs = 35_000;
    }

    await route.fulfill({
      status: state.connected ? 200 : 401,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify(
        state.connected
          ? buildSnapshot()
          : { connected: false, canControlPlayback: false, activeDevice: null, playback: null, warnings: ["Spotify disconnected"] }
      ),
    });
  });

  await context.route("**/api/spotify/live/command", async (route) => {
    state.commandCalls += 1;
    const payload = route.request().postDataJSON?.() ?? {};
    const action = payload.action;

    if (!state.connected) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({ ok: false, error: { code: "TOKEN_INVALID", message: "Spotify disconnected" } }),
      });
      return;
    }

    if (!state.canControlPlayback) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          ok: false,
          action,
          ...buildSnapshot(),
          error: { code: "NO_ACTIVE_DEVICE", message: "Manual host control mode active." },
        }),
      });
      return;
    }

    if (action === "play_game") {
      const playlistId = String(payload.playlistId ?? "");
      state.activeGame = playlistId.includes("2") ? 2 : 1;
      state.trackIndex = 0;
      state.progressMs = 0;
      state.isPlaying = true;
    } else if (action === "pause") {
      state.isPlaying = false;
    } else if (action === "resume") {
      state.isPlaying = true;
    } else if (action === "next") {
      const tracks = tracksByGame[state.activeGame] ?? tracksByGame[1];
      state.trackIndex = (state.trackIndex + 1) % tracks.length;
      state.progressMs = 0;
      state.isPlaying = true;
    } else if (action === "previous") {
      const tracks = tracksByGame[state.activeGame] ?? tracksByGame[1];
      state.trackIndex = (state.trackIndex - 1 + tracks.length) % tracks.length;
      state.progressMs = 0;
      state.isPlaying = true;
    } else if (action === "seek") {
      state.progressMs = Math.max(0, Number(payload.positionMs ?? 0));
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        ok: true,
        action,
        ...buildSnapshot(),
      }),
    });
  });

  return state;
}

async function installAppDataMocks(context, options = {}) {
  const sessions = new Map((options.sessions ?? []).map((session) => [session.id, session]));
  const runtimes = new Map();
  const jsonHeaders = { "Cache-Control": "no-store" };

  await context.route(
    (url) => url.pathname === "/api/brands",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: jsonHeaders,
        body: JSON.stringify([]),
      });
    }
  );

  await context.route(
    (url) => url.pathname === "/api/sessions",
    async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: jsonHeaders,
          body: JSON.stringify([...sessions.values()]),
        });
        return;
      }
      if (method === "PUT") {
        const payload = route.request().postDataJSON?.();
        if (payload?.id) sessions.set(payload.id, payload);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: jsonHeaders,
          body: JSON.stringify(payload ?? {}),
        });
        return;
      }
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  );

  await context.route(
    (url) => /^\/api\/sessions\/[^/]+$/.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url());
      const sessionId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const method = route.request().method();
      if (method === "GET") {
        const session = sessions.get(sessionId);
        await route.fulfill({
          status: session ? 200 : 404,
          contentType: "application/json",
          headers: jsonHeaders,
          body: JSON.stringify(session ? { ...session, brand: null } : { error: "Session not found." }),
        });
        return;
      }
      if (method === "DELETE") {
        sessions.delete(sessionId);
        runtimes.delete(sessionId);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: jsonHeaders,
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  );

  await context.route(
    (url) => /^\/api\/sessions\/[^/]+\/runtime$/.test(url.pathname),
    async (route) => {
      const parts = new URL(route.request().url()).pathname.split("/");
      const sessionId = decodeURIComponent(parts.at(-2) ?? "");
      const method = route.request().method();
      if (method === "GET") {
        const runtime = runtimes.get(sessionId);
        await route.fulfill({
          status: runtime ? 200 : 404,
          contentType: "application/json",
          headers: jsonHeaders,
          body: JSON.stringify(runtime ?? { error: "Runtime state not found." }),
        });
        return;
      }
      if (method === "PUT") {
        const payload = route.request().postDataJSON?.();
        if (payload) runtimes.set(sessionId, payload);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: jsonHeaders,
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  );
}

async function openPrep(page) {
  await page.goto(`${BASE_URL}/prep`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Event Setup" }).waitFor();
}

async function fillCurrentGameStep(page, songs) {
  await page.locator("textarea").fill(songs);
  await page.locator("text=26 songs").first().waitFor();

  // The After Hours wizard renders challenge songs as a Sing/Dance segmented
  // toggle + a song <select> per row (defaulting to "None"). Pick the first
  // real option in the first challenge row so generation isn't blocked.
  const firstChallenge = page.locator(".chal-row select").first();
  await firstChallenge.waitFor();
  assert.equal(await firstChallenge.isDisabled(), false, "Challenge song select should be enabled after songs");
  const values = await firstChallenge
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => o.value).filter((v) => v));
  assert.ok(values.length > 0, "Challenge song select should have song options after songs are entered");
  await firstChallenge.selectOption(values[0]);
  assert.notEqual(await firstChallenge.inputValue(), "", "A challenge song should be selected");
}

async function fillPrepWizardToGenerate(page, game1Songs, game2Songs) {
  await openPrep(page);

  await page.getByRole("button", { name: /Next: Game 1/i }).click();
  await page.getByRole("heading", { name: /Game 1/i }).waitFor();
  await fillCurrentGameStep(page, game1Songs);
  await waitUntilEnabled(page.getByRole("button", { name: /Next: Game 2/i }));
  await page.getByRole("button", { name: /Next: Game 2/i }).click();

  await page.getByRole("heading", { name: /Game 2/i }).waitFor();
  await fillCurrentGameStep(page, game2Songs);
  await waitUntilEnabled(page.getByRole("button", { name: /Next: Generate/i }));
  await page.getByRole("button", { name: /Next: Generate/i }).click();

  await page.getByRole("heading", { name: /Generate/i }).waitFor();
}

async function runFlow(results, name, fn) {
  process.stdout.write(`\n[flow] ${name}\n`);
  try {
    await fn();
    results.push({ name, ok: true });
    process.stdout.write(`[pass] ${name}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    results.push({ name, ok: false, message });
    process.stderr.write(`[fail] ${name}\n${message}\n`);
  }
}

async function validateDownloadedBundle(zipPath) {
  let zip;
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const zipRaw = await readFile(zipPath);
      zip = await JSZip.loadAsync(zipRaw);
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await sleep(200);
    }
  }

  if (!zip) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Unable to parse generated event bundle ZIP: ${message}`);
  }
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);

  assert.equal(files.length, 3, `Expected 3 files in bundle, got ${files.length}: ${files.join(", ")}`);

  const game1Pdf = files.find((name) => /^music-bingo-game-1-.*\.pdf$/.test(name));
  const game2Pdf = files.find((name) => /^music-bingo-game-2-.*\.pdf$/.test(name));
  const clipboard = files.find((name) => /^event-clipboard-.*\.docx$/.test(name));
  const runSheet = files.find((name) => /^run-sheet-.*\.pdf$/.test(name));

  assert.ok(game1Pdf, `Missing game 1 PDF in bundle: ${files.join(", ")}`);
  assert.ok(game2Pdf, `Missing game 2 PDF in bundle: ${files.join(", ")}`);
  assert.ok(!clipboard, `Clipboard DOCX should not be included in bundle: ${files.join(", ")}`);
  assert.ok(runSheet, `Missing run-sheet PDF in bundle: ${files.join(", ")}`);

  const game1Bytes = await zip.file(game1Pdf).async("nodebuffer");
  const game2Bytes = await zip.file(game2Pdf).async("nodebuffer");
  const runSheetBytes = await zip.file(runSheet).async("nodebuffer");

  assert.equal(game1Bytes.subarray(0, 4).toString("utf8"), "%PDF", "Game 1 file is not a valid PDF");
  assert.equal(game2Bytes.subarray(0, 4).toString("utf8"), "%PDF", "Game 2 file is not a valid PDF");
  assert.equal(runSheetBytes.subarray(0, 4).toString("utf8"), "%PDF", "Run-sheet file is not a valid PDF");

  // Lock the What's-On interleave: each card sheet is followed by a What's-On
  // page, so a game PDF has an even page count >= 2. Guards against a regression
  // to per-card re-rendering or a dropped events page (the perf fix).
  const game1Doc = await PDFDocument.load(game1Bytes);
  const game1Pages = game1Doc.getPageCount();
  assert.ok(
    game1Pages >= 2 && game1Pages % 2 === 0,
    `Game 1 PDF should interleave a What's-On page after each card sheet (even page count >= 2), got ${game1Pages}`,
  );
}

function makeLiveSessionFixture(sessionId = "flow-live-session") {
  return {
    version: "music-bingo-live-session-v1",
    id: sessionId,
    name: "Flow Live Session",
    createdAt: new Date("2026-02-22T10:00:00.000Z").toISOString(),
    eventDateInput: "2026-03-01",
    eventDateDisplay: "March 1st 2026",
    revealConfig: {
      albumMs: 10000,
      titleMs: 20000,
      artistMs: 25000,
      nextMs: 30000,
    },
    games: [
      {
        gameNumber: 1,
        theme: "General 70's to 2010's",
        playlistId: "mock-game-1",
        playlistName: "Music Bingo Game 1",
        playlistUrl: "https://open.spotify.com/playlist/mock-game-1",
        totalSongs: 26,
        addedCount: 26,
      },
      {
        gameNumber: 2,
        theme: "General 70's to 2010's",
        playlistId: "mock-game-2",
        playlistName: "Music Bingo Game 2",
        playlistUrl: "https://open.spotify.com/playlist/mock-game-2",
        totalSongs: 26,
        addedCount: 26,
      },
    ],
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const songListA = makeSongList("FlowA");
  const songListB = makeSongList("FlowB");
  const flowResults = [];

  const server = startAppServer();
  let browser;

  try {
    await waitForServerReady();
    browser = await chromium.launch({ headless: true });

    const flow123Context = await browser.newContext({ acceptDownloads: true });
    await installAppDataMocks(flow123Context);
    const spotifyFlow123 = await installSpotifyMocks(flow123Context, { initialConnected: false });
    const flow123Page = await flow123Context.newPage();

    await runFlow(flowResults, "Flow 1: Empty game step blocks progression", async () => {
      await openPrep(flow123Page);
      await flow123Page.getByRole("button", { name: /Next: Game 1/i }).click();
      await flow123Page.getByRole("heading", { name: /Game 1/i }).waitFor();

      const nextButton = flow123Page.getByRole("button", { name: /Next: Game 2/i });
      assert.equal(await nextButton.isDisabled(), true, "Game 1 next button should be disabled before songs");

      const selects = flow123Page.locator("select");
      assert.equal(await selects.nth(0).isDisabled(), true, "Challenge type should be disabled initially");
      assert.equal(await selects.nth(1).isDisabled(), true, "Challenge song should be disabled initially");
    });

    await runFlow(flowResults, "Flow 2: Valid songs parse through the prep wizard", async () => {
      await fillCurrentGameStep(flow123Page, songListA);

      await waitUntilEnabled(flow123Page.getByRole("button", { name: /Next: Game 2/i }));
      await flow123Page.getByRole("button", { name: /Next: Game 2/i }).click();

      await flow123Page.getByRole("heading", { name: /Game 2/i }).waitFor();
      await fillCurrentGameStep(flow123Page, songListB);

      await waitUntilEnabled(flow123Page.getByRole("button", { name: /Next: Generate/i }));
      await flow123Page.getByRole("button", { name: /Next: Generate/i }).click();

      await flow123Page.getByRole("heading", { name: /Generate/i }).waitFor();
      assert.equal(
        await flow123Page.getByRole("button", { name: "Create Spotify Playlists" }).isDisabled(),
        true,
        "Spotify playlist creation should require connection first"
      );
      await waitUntilEnabled(flow123Page.getByRole("button", { name: /Download Only/i }));
    });

    await runFlow(flowResults, "Flow 3: Spotify playlist and event-pack flow succeeds", async () => {
      await mkdir(OUTPUT_DIR, { recursive: true });
      await rm(DOWNLOAD_PATH, { force: true });

      await flow123Page.getByRole("button", { name: "Connect Spotify" }).click();
      await flow123Page.getByRole("button", { name: "Disconnect" }).waitFor({ timeout: 10_000 });
      assert.equal(spotifyFlow123.authorizeCalls, 1, "Connect flow should trigger exactly one Spotify auth popup");

      const createButton = flow123Page.getByRole("button", { name: "Create Spotify Playlists" });
      await waitUntilEnabled(createButton);
      await createButton.click();
      await flow123Page.getByRole("link", { name: /Open/i }).first().waitFor({ timeout: 10_000 });
      assert.equal(spotifyFlow123.createCalls, 1, "Playlist creation request should be called once");

      const matchedRows = flow123Page.getByText(/26\/26 tracks/);
      await matchedRows.first().waitFor({ timeout: 10_000 });
      assert.ok(await matchedRows.count() >= 2, "Expected playlist summary for both games");

      const generateButton = flow123Page.getByRole("button", { name: "Generate Event Pack" });
      const [download] = await Promise.all([
        flow123Page.waitForEvent("download", { timeout: 120_000 }),
        generateButton.click(),
      ]);

      await download.saveAs(DOWNLOAD_PATH);
      await validateDownloadedBundle(DOWNLOAD_PATH);
    });

    await flow123Context.close();

    const flow4Context = await browser.newContext();
    await installAppDataMocks(flow4Context);
    await installSpotifyMocks(flow4Context, { initialConnected: false });
    const flow4Page = await flow4Context.newPage();

    await runFlow(flowResults, "Flow 4: Invalid inputs keep generation blocked", async () => {
      await openPrep(flow4Page);

      const countInput = flow4Page.getByRole("spinbutton").first();
      const setupNext = flow4Page.getByRole("button", { name: /Next: Game 1/i });

      await countInput.fill("1001");
      await sleep(200);
      assert.equal(await setupNext.isDisabled(), true, "Setup next should stay disabled when page count is out of range");

      await countInput.fill("40");
      await waitUntilEnabled(setupNext);
      await setupNext.click();

      const textarea = flow4Page.locator("textarea");
      const gameNext = flow4Page.getByRole("button", { name: /Next: Game 2/i });
      await textarea.fill("Invalid Song Format\nStill Invalid");
      await flow4Page.locator("text=0 songs").first().waitFor();
      assert.equal(await gameNext.isDisabled(), true, "Game next should stay disabled with malformed song input");

      await textarea.fill(songListA);
      await waitUntilEnabled(gameNext);
    });

    await flow4Context.close();

    const flowConnectedPrepContext = await browser.newContext();
    await installAppDataMocks(flowConnectedPrepContext);
    await installSpotifyMocks(flowConnectedPrepContext, { initialConnected: true });
    const flowConnectedPrepPage = await flowConnectedPrepContext.newPage();

    await runFlow(flowResults, "Flow 5: Connected Spotify user can proceed without intro songs", async () => {
      await openPrep(flowConnectedPrepPage);
      await flowConnectedPrepPage.getByRole("button", { name: /Next: Game 1/i }).click();
      await flowConnectedPrepPage.getByRole("heading", { name: /Game 1/i }).waitFor();
      await fillCurrentGameStep(flowConnectedPrepPage, songListA);

      await waitUntilEnabled(flowConnectedPrepPage.getByRole("button", { name: /Next: Game 2/i }));
    });

    await flowConnectedPrepContext.close();

    const flow5Context = await browser.newContext();
    await installAppDataMocks(flow5Context);
    const spotifyFlow5 = await installSpotifyMocks(flow5Context, { initialConnected: false });
    const flow5Page = await flow5Context.newPage();

    await runFlow(flowResults, "Flow 6: Connected Spotify user can disconnect", async () => {
      await fillPrepWizardToGenerate(flow5Page, songListA, songListB);

      await flow5Page.getByRole("button", { name: "Connect Spotify" }).click();
      await flow5Page.getByRole("button", { name: "Disconnect" }).waitFor({ timeout: 10_000 });

      const disconnectButton = flow5Page.getByRole("button", { name: "Disconnect" });
      await disconnectButton.click();

      await flow5Page.getByRole("button", { name: "Connect Spotify" }).waitFor({ timeout: 10_000 });
      assert.equal(spotifyFlow5.disconnectCalls, 1, "Disconnect endpoint should be called once");
    });

    await flow5Context.close();

    const flow6Context = await browser.newContext();
    await installAppDataMocks(flow6Context, { sessions: [makeLiveSessionFixture("flow-live-session")] });
    await installSpotifyLiveMocks(flow6Context, { canControlPlayback: true });
    await flow6Context.addInitScript((payload) => {
      window.localStorage.setItem("music-bingo-live-sessions-v1", JSON.stringify([payload]));
    }, makeLiveSessionFixture("flow-live-session"));
    const flow6HostPage = await flow6Context.newPage();
    const flow6GuestPage = await flow6Context.newPage();

    await runFlow(flowResults, "Flow 7: Host and guest live screens sync with reveal progression", async () => {
      await flow6HostPage.goto(`${BASE_URL}/host/flow-live-session`, { waitUntil: "domcontentloaded" });
      // The After Hours host console shows the session name in the top bar (not a heading).
      await flow6HostPage.getByText(/Flow Live Session/i).first().waitFor({ timeout: 15_000 });
      await flow6HostPage.getByRole("button", { name: "Start Game 1" }).waitFor({ timeout: 15_000 });

      await flow6GuestPage.goto(`${BASE_URL}/guest/flow-live-session`, { waitUntil: "domcontentloaded" });
      // The guest TV renders the run-of-show screens inside a full-bleed,
      // 1920×1080 scaler (the "After Hours" TV display).
      await flow6GuestPage.locator(".viewport").waitFor({ timeout: 15_000 });
      await flow6GuestPage.locator(".stage-scaler").first().waitFor({ timeout: 15_000 });

      const guestStyles = await flow6GuestPage.evaluate(() => {
        const viewport = document.querySelector(".viewport");
        const rect = viewport?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          shellWidth: rect?.width ?? 0,
        };
      });
      assert.ok(
        guestStyles.shellWidth >= guestStyles.viewportWidth - 1,
        `Guest TV viewport should be full-bleed (viewport ${guestStyles.shellWidth}, window ${guestStyles.viewportWidth})`
      );

      await flow6HostPage.getByRole("button", { name: "Start Game 1" }).click();

      // Guest (no explicit screenId from the legacy host) derives the game screen
      // and reflects the synced track + reveal progression.
      await flow6GuestPage.locator("text=Flow Live Song One").waitFor({ timeout: 15_000 });
      await flow6GuestPage.locator("text=Flow Live Artist A").waitFor({ timeout: 15_000 });
      await flow6GuestPage.locator("text=Flow Live Song Two").waitFor({ timeout: 20_000 });
    });

    await flow6Context.close();

    const flow7Context = await browser.newContext();
    await installAppDataMocks(flow7Context, { sessions: [makeLiveSessionFixture("flow-live-fallback")] });
    await installSpotifyLiveMocks(flow7Context, { canControlPlayback: false });
    await flow7Context.addInitScript((payload) => {
      window.localStorage.setItem("music-bingo-live-sessions-v1", JSON.stringify([payload]));
    }, makeLiveSessionFixture("flow-live-fallback"));
    const flow7HostPage = await flow7Context.newPage();
    const flow7GuestPage = await flow7Context.newPage();

    await runFlow(flowResults, "Flow 8: Live fallback warning appears when Spotify control is unavailable", async () => {
      await flow7HostPage.goto(`${BASE_URL}/host/flow-live-fallback`, { waitUntil: "domcontentloaded" });
      await flow7HostPage.getByRole("button", { name: "Start Game 1" }).click();
      await flow7HostPage.locator("text=Manual host control mode").first().waitFor({ timeout: 15_000 });

      // The audience TV intentionally does NOT show the manual-mode chip — that
      // operational warning lives on the host controller (asserted above). Verify
      // the guest still renders correctly while Spotify control is unavailable.
      await flow7GuestPage.goto(`${BASE_URL}/guest/flow-live-fallback`, { waitUntil: "domcontentloaded" });
      await flow7GuestPage.locator(".viewport").waitFor({ timeout: 10_000 });
    });

    await flow7Context.close();
  } finally {
    if (browser) await browser.close();
    await stopAppServer(server);
  }

  await writeFile(
    resolve(OUTPUT_DIR, "e2e-flow-results.json"),
    JSON.stringify({ baseUrl: BASE_URL, flows: flowResults }, null, 2),
    "utf8"
  );

  const failures = flowResults.filter((flow) => !flow.ok);
  if (failures.length) {
    process.stderr.write(`\n${failures.length} flow(s) failed.\n`);
    process.exit(1);
  }

  process.stdout.write(`\nAll ${flowResults.length} flow(s) passed.\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
