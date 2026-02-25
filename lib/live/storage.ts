import {
  LIVE_RUNTIME_VERSION,
  type LiveControlLock,
  type LiveRuntimeState,
  type LiveSessionV1,
} from "@/lib/live/types";
import { asNumber, asString, isObject, validateLiveSession as _validateLiveSession } from "@/lib/live/validate";

export { validateLiveSession } from "@/lib/live/validate";

export const LIVE_SESSIONS_STORAGE_KEY = "music-bingo-live-sessions-v1";

function runtimeStorageKey(sessionId: string): string {
  return `music-bingo-live-runtime:${sessionId}`;
}

function controlLockStorageKey(sessionId: string): string {
  return `music-bingo-live-lock:${sessionId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readRaw(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write failures in private/restricted environments
  }
}

function deleteRaw(key: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage delete failures in private/restricted environments
  }
}

export function listLiveSessions(): LiveSessionV1[] {
  const raw = readRaw(LIVE_SESSIONS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const sessions = parsed.map(_validateLiveSession).filter((item): item is LiveSessionV1 => Boolean(item));
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function upsertLiveSession(session: LiveSessionV1): void {
  const validated = _validateLiveSession(session);
  if (!validated) {
    throw new Error("Invalid live session payload.");
  }

  const sessions = listLiveSessions();
  const next = [validated, ...sessions.filter((item) => item.id !== validated.id)];
  writeRaw(LIVE_SESSIONS_STORAGE_KEY, JSON.stringify(next));
}

export function getLiveSession(sessionId: string): LiveSessionV1 | null {
  if (!sessionId.trim()) return null;
  return listLiveSessions().find((session) => session.id === sessionId) ?? null;
}

export function deleteLiveSession(sessionId: string): void {
  const trimmed = sessionId.trim();
  if (!trimmed) return;

  const sessions = listLiveSessions().filter((session) => session.id !== trimmed);
  writeRaw(LIVE_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));

  deleteRaw(runtimeStorageKey(trimmed));
  deleteRaw(controlLockStorageKey(trimmed));
}

export function exportLiveSessionJson(sessionId: string): string {
  const session = getLiveSession(sessionId);
  if (!session) {
    throw new Error("Live session not found.");
  }
  return JSON.stringify(session, null, 2);
}

export function importLiveSessionJson(rawJson: string): LiveSessionV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON. Check the file and try again.");
  }

  const session = _validateLiveSession(parsed);
  if (!session) {
    throw new Error("Invalid live session schema or unsupported version.");
  }

  upsertLiveSession(session);
  return session;
}

function validateRuntimeState(input: unknown): LiveRuntimeState | null {
  if (!isObject(input)) return null;
  const version = asString(input.version);
  if (version !== LIVE_RUNTIME_VERSION) return null;

  const sessionId = asString(input.sessionId);
  const updatedAtMs = asNumber(input.updatedAtMs);
  const modeRaw = asString(input.mode);

  const modes = new Set(["idle", "running", "paused", "break", "ended"]);
  if (!sessionId || updatedAtMs === null || !modeRaw || !modes.has(modeRaw)) return null;

  const activeGameRaw = input.activeGameNumber;
  const activeGameNumber = activeGameRaw === 1 || activeGameRaw === 2 ? activeGameRaw : null;

  const spotifyControlAvailable = Boolean(input.spotifyControlAvailable);
  const warningMessage = typeof input.warningMessage === "string" && input.warningMessage.trim()
    ? input.warningMessage.trim()
    : null;

  const reveal = isObject(input.revealState) ? input.revealState : {};
  const revealState = {
    showAlbum: Boolean(reveal.showAlbum),
    showTitle: Boolean(reveal.showTitle),
    showArtist: Boolean(reveal.showArtist),
    shouldAdvance: Boolean(reveal.shouldAdvance),
  };

  let currentTrack: LiveRuntimeState["currentTrack"] = null;
  if (isObject(input.currentTrack)) {
    currentTrack = {
      trackId: typeof input.currentTrack.trackId === "string" ? input.currentTrack.trackId : null,
      title: typeof input.currentTrack.title === "string" ? input.currentTrack.title : "",
      artist: typeof input.currentTrack.artist === "string" ? input.currentTrack.artist : "",
      albumImageUrl: typeof input.currentTrack.albumImageUrl === "string" ? input.currentTrack.albumImageUrl : null,
      progressMs: asNumber(input.currentTrack.progressMs) ?? 0,
      durationMs: asNumber(input.currentTrack.durationMs) ?? 0,
      isPlaying: Boolean(input.currentTrack.isPlaying),
    };
  }

  return {
    version: LIVE_RUNTIME_VERSION,
    sessionId,
    mode: modeRaw as LiveRuntimeState["mode"],
    activeGameNumber,
    spotifyControlAvailable,
    currentTrack,
    revealState,
    advanceTriggeredForTrackId:
      typeof input.advanceTriggeredForTrackId === "string" && input.advanceTriggeredForTrackId.trim()
        ? input.advanceTriggeredForTrackId.trim()
        : null,
    warningMessage,
    isChallengeSong: Boolean(input.isChallengeSong),
    preBreakTrackId:
      typeof input.preBreakTrackId === "string" && input.preBreakTrackId.trim()
        ? input.preBreakTrackId.trim()
        : null,
    preBreakPlaylistId:
      typeof input.preBreakPlaylistId === "string" && input.preBreakPlaylistId.trim()
        ? input.preBreakPlaylistId.trim()
        : null,
    extensionMs: asNumber(input.extensionMs) ?? 0,
    updatedAtMs,
  };
}

export function readRuntimeState(sessionId: string): LiveRuntimeState | null {
  const raw = readRaw(runtimeStorageKey(sessionId));
  if (!raw) return null;

  try {
    return validateRuntimeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeRuntimeState(sessionId: string, runtime: LiveRuntimeState): void {
  if (runtime.sessionId !== sessionId) {
    throw new Error("Runtime session ID mismatch.");
  }
  const validated = validateRuntimeState(runtime);
  if (!validated) {
    throw new Error("Invalid runtime state payload.");
  }
  writeRaw(runtimeStorageKey(sessionId), JSON.stringify(validated));
}

export function readControlLock(sessionId: string): LiveControlLock | null {
  const raw = readRaw(controlLockStorageKey(sessionId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    const tabId = asString(parsed.tabId);
    const lastSeenMs = asNumber(parsed.lastSeenMs);
    if (!tabId || lastSeenMs === null) return null;
    return { tabId, lastSeenMs };
  } catch {
    return null;
  }
}

export function isControlLockStale(lock: LiveControlLock | null, nowMs = Date.now(), staleMs = 30_000): boolean {
  if (!lock) return true;
  return nowMs - lock.lastSeenMs > staleMs;
}

export function acquireControlLock(params: {
  sessionId: string;
  tabId: string;
  force?: boolean;
  nowMs?: number;
  staleMs?: number;
}): { acquired: boolean; lock: LiveControlLock | null } {
  const nowMs = params.nowMs ?? Date.now();
  const staleMs = params.staleMs ?? 30_000;

  const current = readControlLock(params.sessionId);
  const ownsLock = current?.tabId === params.tabId;
  const available = !current || isControlLockStale(current, nowMs, staleMs);

  if (!params.force && !ownsLock && !available) {
    return { acquired: false, lock: current };
  }

  const nextLock: LiveControlLock = {
    tabId: params.tabId,
    lastSeenMs: nowMs,
  };

  writeRaw(controlLockStorageKey(params.sessionId), JSON.stringify(nextLock));
  return { acquired: true, lock: nextLock };
}

export function updateControlHeartbeat(sessionId: string, tabId: string, nowMs = Date.now()): void {
  const current = readControlLock(sessionId);
  if (!current || current.tabId !== tabId) return;
  writeRaw(controlLockStorageKey(sessionId), JSON.stringify({ tabId, lastSeenMs: nowMs }));
}

export function releaseControlLock(sessionId: string, tabId: string): void {
  const current = readControlLock(sessionId);
  if (current?.tabId !== tabId) return;
  deleteRaw(controlLockStorageKey(sessionId));
}
