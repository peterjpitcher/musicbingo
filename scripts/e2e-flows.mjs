#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import JSZip from "jszip";
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

async function fillValidGameInputs(page, game1Songs, game2Songs) {
  const textareas = page.locator("textarea");
  await textareas.nth(0).fill(game1Songs);
  await textareas.nth(1).fill(game2Songs);
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
  const zipRaw = await readFile(zipPath);
  const zip = await JSZip.loadAsync(zipRaw);
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);

  assert.equal(files.length, 3, `Expected 3 files in bundle, got ${files.length}: ${files.join(", ")}`);

  const game1Pdf = files.find((name) => /^music-bingo-game-1-.*\.pdf$/.test(name));
  const game2Pdf = files.find((name) => /^music-bingo-game-2-.*\.pdf$/.test(name));
  const clipboard = files.find((name) => /^event-clipboard-.*\.docx$/.test(name));

  assert.ok(game1Pdf, `Missing game 1 PDF in bundle: ${files.join(", ")}`);
  assert.ok(game2Pdf, `Missing game 2 PDF in bundle: ${files.join(", ")}`);
  assert.ok(clipboard, `Missing clipboard DOCX in bundle: ${files.join(", ")}`);

  const game1Bytes = await zip.file(game1Pdf).async("nodebuffer");
  const game2Bytes = await zip.file(game2Pdf).async("nodebuffer");
  const docxBytes = await zip.file(clipboard).async("nodebuffer");

  assert.equal(game1Bytes.subarray(0, 4).toString("utf8"), "%PDF", "Game 1 file is not a valid PDF");
  assert.equal(game2Bytes.subarray(0, 4).toString("utf8"), "%PDF", "Game 2 file is not a valid PDF");
  assert.equal(docxBytes.subarray(0, 2).toString("utf8"), "PK", "Clipboard file is not a ZIP-based DOCX");

  const docxZip = await JSZip.loadAsync(docxBytes);
  assert.ok(docxZip.file("word/document.xml"), "DOCX missing word/document.xml");
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
    const spotifyFlow123 = await installSpotifyMocks(flow123Context, { initialConnected: false });
    const flow123Page = await flow123Context.newPage();

    await runFlow(flowResults, "Flow 1: Initial load shows gated submit", async () => {
      await flow123Page.goto(BASE_URL, { waitUntil: "networkidle" });
      await flow123Page.getByRole("heading", { name: "Music Bingo" }).waitFor();

      const submitButton = flow123Page.locator("button[type='submit']");
      assert.equal(await submitButton.isDisabled(), true, "Submit should be disabled on first load");

      const selects = flow123Page.locator("select");
      assert.equal(await selects.nth(0).isDisabled(), true, "Game 1 challenge should be disabled initially");
      assert.equal(await selects.nth(1).isDisabled(), true, "Game 2 challenge should be disabled initially");
    });

    await runFlow(flowResults, "Flow 2: Valid songs parse and challenge picks auto-populate", async () => {
      await fillValidGameInputs(flow123Page, songListA, songListB);

      await flow123Page.locator("text=Parsed songs: 26/50").first().waitFor();
      const parsedCounts = flow123Page.locator("text=Parsed songs: 26/50");
      assert.equal(await parsedCounts.count(), 2, "Both game parsed counters should show 26/50");

      const uniqueCounts = flow123Page.locator("text=Unique artists/titles: 26/26");
      assert.equal(await uniqueCounts.count(), 2, "Both games should have 26 unique artists and titles");

      const selects = flow123Page.locator("select");
      assert.equal(await selects.nth(0).isDisabled(), false, "Game 1 challenge should be enabled after songs");
      assert.equal(await selects.nth(1).isDisabled(), false, "Game 2 challenge should be enabled after songs");
      assert.notEqual(await selects.nth(0).inputValue(), "", "Game 1 challenge should auto-select a song");
      assert.notEqual(await selects.nth(1).inputValue(), "", "Game 2 challenge should auto-select a song");

      const submitButton = flow123Page.locator("button[type='submit']");
      await waitUntilEnabled(submitButton);
    });

    await runFlow(flowResults, "Flow 3: Full generate flow returns a valid event-pack zip", async () => {
      await mkdir(OUTPUT_DIR, { recursive: true });

      const submitButton = flow123Page.locator("button[type='submit']");
      const [download] = await Promise.all([
        flow123Page.waitForEvent("download", { timeout: 120_000 }),
        submitButton.click(),
      ]);

      await download.saveAs(DOWNLOAD_PATH);
      await validateDownloadedBundle(DOWNLOAD_PATH);

      await flow123Page.locator("text=Open in Spotify").first().waitFor({ timeout: 10_000 });
      const addedRows = flow123Page.locator("text=added 26/26");
      assert.ok(await addedRows.count() >= 2, "Expected playlist summary for both games");

      assert.equal(spotifyFlow123.authorizeCalls, 1, "Submit flow should trigger exactly one Spotify auth popup");
      assert.equal(spotifyFlow123.createCalls, 1, "Submit flow should trigger exactly one playlist creation request");
    });

    await flow123Context.close();

    const flow4Context = await browser.newContext();
    await installSpotifyMocks(flow4Context, { initialConnected: true });
    const flow4Page = await flow4Context.newPage();

    await runFlow(flowResults, "Flow 4: Invalid inputs keep generation blocked", async () => {
      await flow4Page.goto(BASE_URL, { waitUntil: "networkidle" });

      const textareas = flow4Page.locator("textarea");
      const countInput = flow4Page.locator("input[type='number']");
      const submitButton = flow4Page.locator("button[type='submit']");

      await textareas.nth(0).fill("Invalid Song Format\nStill Invalid");
      await textareas.nth(1).fill(songListB);

      await flow4Page.locator("text=Parsed songs: 0/50").first().waitFor();
      assert.equal(await submitButton.isDisabled(), true, "Submit should stay disabled with malformed game input");

      await textareas.nth(0).fill(songListA);
      await countInput.fill("1001");
      await sleep(200);
      assert.equal(await submitButton.isDisabled(), true, "Submit should stay disabled when card count is out of range");

      await countInput.fill("40");
      await waitUntilEnabled(submitButton);
    });

    await flow4Context.close();

    const flow5Context = await browser.newContext();
    const spotifyFlow5 = await installSpotifyMocks(flow5Context, { initialConnected: true });
    const flow5Page = await flow5Context.newPage();

    await runFlow(flowResults, "Flow 5: Connected Spotify user can disconnect", async () => {
      await flow5Page.goto(BASE_URL, { waitUntil: "networkidle" });

      const disconnectButton = flow5Page.getByRole("button", { name: "Disconnect" });
      await disconnectButton.waitFor({ timeout: 10_000 });
      await disconnectButton.click();

      await flow5Page.getByRole("button", { name: "Connect Spotify" }).waitFor({ timeout: 10_000 });
      assert.equal(spotifyFlow5.disconnectCalls, 1, "Disconnect endpoint should be called once");
    });

    await flow5Context.close();
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
