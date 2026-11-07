/**
 * The host console's side of the control lock (spec M-9, S4.3): one console
 * in control of a live game at a time, held on the server (migration
 * 20261107120100). This is the pure part, a reducer over what the server
 * says, so it is tested without a browser; hooks/useHostControl.ts drives it.
 * The same pattern as Quiz Night's console.
 */

/** How often the console in control says it is still there. */
export const HEARTBEAT_MS = 10_000;

/** How long the console in control may be silent before another can take over. */
export const TAKEOVER_AFTER_S = 30;

export type HostControlStatus = "checking" | "held" | "lost";

export interface HostControlState {
  status: HostControlStatus;
  /** While another console holds control: seconds since it was last heard from, as the server counted, and when we were told. */
  holderSilentFor: number | null;
  observedAt: number | null;
  /** The runtime version the server reported with the last answer, if any. */
  serverVersion: number | null;
  /** The last request failed outright (offline, server error); the status is unchanged. */
  error: string | null;
}

export type HostControlEvent =
  | { type: "held"; version: number | null }
  | { type: "refused"; secondsSinceSeen: number | null; version: number | null; at: number }
  | { type: "failed"; error: string };

export const INITIAL_HOST_CONTROL: HostControlState = {
  status: "checking",
  holderSilentFor: null,
  observedAt: null,
  serverVersion: null,
  error: null,
};

export function hostControlReducer(state: HostControlState, event: HostControlEvent): HostControlState {
  switch (event.type) {
    case "held":
      return { status: "held", holderSilentFor: null, observedAt: null, serverVersion: event.version, error: null };
    case "refused":
      // A heartbeat or save the server refused is lost control, whatever we thought before.
      return { status: "lost", holderSilentFor: event.secondsSinceSeen, observedAt: event.at, serverVersion: event.version, error: null };
    case "failed":
      return { ...state, error: event.error };
    default:
      return state;
  }
}

/** Seconds since the console in control was last heard from, counted on from what the server said. */
export function holderSilentSeconds(state: HostControlState, now: number): number | null {
  if (state.status !== "lost" || state.holderSilentFor === null || state.observedAt === null) return null;
  return state.holderSilentFor + Math.max(now - state.observedAt, 0) / 1000;
}

/**
 * Whether this console may offer a takeover: another console holds control
 * and has been silent for 30 seconds. The server makes the same check when
 * the takeover is sent, so a wrong clock here only shows the button early or
 * late, never lets a takeover through.
 */
export function canTakeOver(state: HostControlState, now: number): boolean {
  const silent = holderSilentSeconds(state, now);
  return silent !== null && silent >= TAKEOVER_AFTER_S;
}

/** Whole seconds until a takeover may be offered, for the banner. */
export function secondsUntilTakeover(state: HostControlState, now: number): number | null {
  const silent = holderSilentSeconds(state, now);
  if (silent === null) return null;
  return Math.max(Math.ceil(TAKEOVER_AFTER_S - silent), 0);
}
