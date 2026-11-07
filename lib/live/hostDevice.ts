/**
 * The host console's device id (spec M-9, S4.3): one console in control of a
 * live game at a time, held on the server. A device is one browser tab: a
 * random id kept in sessionStorage, so a reload keeps control and a second
 * tab is a second console. Every live call sends it as the x-host-device
 * header; the control functions in the database (migration 20261107120100)
 * compare it with live_sessions.controller_id.
 *
 * It is not a credential: every route still needs a signed-in host or admin.
 */

export const HOST_DEVICE_HEADER = "x-host-device";

const STORAGE_PREFIX = "music-bingo-host-device:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHostDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The device id a request carries, or null. */
export function readHostDeviceHeader(headers: Headers): string | null {
  const value = headers.get(HOST_DEVICE_HEADER)?.trim();
  return isHostDeviceId(value) ? value.toLowerCase() : null;
}

function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers: a v4 shape from getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This tab's device id for a game, made on first use. Browser only. */
export function ensureHostDeviceId(sessionId: string): string {
  const key = `${STORAGE_PREFIX}${sessionId}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (isHostDeviceId(existing)) return existing;
    const made = randomUuid();
    window.sessionStorage.setItem(key, made);
    return made;
  } catch {
    // Private mode or storage blocked: an id for this page only. A reload
    // then waits out the 30-second takeover, which is safe.
    return randomUuid();
  }
}
