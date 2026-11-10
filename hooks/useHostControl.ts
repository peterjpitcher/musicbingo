"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  canTakeOver,
  HEARTBEAT_MS,
  hostControlReducer,
  TAKEOVER_AFTER_S,
  INITIAL_HOST_CONTROL,
  secondsUntilTakeover,
  type HostControlState,
} from "@/lib/live/hostControl";
import { HOST_DEVICE_HEADER } from "@/lib/live/hostDevice";
import { readSaveOutcome } from "@/lib/live/runtimeSync";
import { assertSignedIn, SignInRequiredError } from "@/lib/live/signInGuard";

export interface HostControl {
  state: HostControlState;
  /** Another console has been silent for 30 seconds, so a takeover may be offered. */
  takeoverReady: boolean;
  /** Seconds until then, while another console holds control. */
  takeoverIn: number | null;
  /** Ask for control now. Resolves to whether this console holds it. */
  takeOver: () => Promise<boolean>;
  /** A save was refused because another console holds control. */
  markLost: (secondsSinceSeen: number | null) => void;
}

type ControlMethod = "POST" | "PUT";

/**
 * The control lock from the console (spec M-9, S4.3): ask for control on
 * open, send a heartbeat every 10 seconds while holding it, keep asking
 * while another console holds it (so a takeover is offered once it has been
 * silent for 30 seconds), and let go when the tab closes.
 */
export function useHostControl(sessionId: string, deviceId: string | null): HostControl {
  const [state, dispatch] = useReducer(hostControlReducer, INITIAL_HOST_CONTROL);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);
  const statusRef = useRef(state.status);
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const send = useCallback(
    async (method: ControlMethod): Promise<boolean> => {
      if (!sessionId || !deviceId) return false;
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/control`, {
          method,
          headers: { [HOST_DEVICE_HEADER]: deviceId },
          cache: "no-store",
        });
        assertSignedIn(res);
        const outcome = readSaveOutcome(res.status, await res.json().catch(() => null));
        if (!mounted.current) return false;
        if (outcome.kind === "saved") {
          dispatch({ type: "held", version: outcome.version });
          return true;
        }
        if (outcome.kind === "not_controller") {
          // A heartbeat refused with no "last heard" means nobody holds
          // control now (the holder let go), so a takeover may be offered.
          const silentFor = outcome.secondsSinceSeen ?? (method === "PUT" ? TAKEOVER_AFTER_S : null);
          dispatch({ type: "refused", secondsSinceSeen: silentFor, version: null, at: Date.now() });
          return false;
        }
        dispatch({
          type: "failed",
          error: outcome.kind === "missing" ? "This game no longer exists." : "Could not reach the server to check who has control.",
        });
        return false;
      } catch (err) {
        if (err instanceof SignInRequiredError) return false;
        if (mounted.current) dispatch({ type: "failed", error: "Could not reach the server to check who has control." });
        return false;
      }
    },
    [sessionId, deviceId]
  );

  const takeOver = useCallback(() => send("POST"), [send]);

  const markLost = useCallback((secondsSinceSeen: number | null) => {
    dispatch({ type: "refused", secondsSinceSeen, version: null, at: Date.now() });
  }, []);

  useEffect(() => {
    if (!sessionId || !deviceId) return;
    mounted.current = true;
    void send("POST");
    const timer = window.setInterval(() => {
      // A heartbeat either way. Holding, it keeps control; not holding, it is
      // refused and says how long the holder has been silent, so the banner
      // can offer a takeover. Control only changes hands when the host
      // presses Take over (never by itself, so a forgotten tab cannot take
      // the game from a laptop that dropped off the Wi-Fi for half a minute).
      void send(statusRef.current === "checking" ? "POST" : "PUT");
    }, HEARTBEAT_MS);

    // Let go when the tab closes, so another console can take over at once.
    const release = (): void => {
      if (statusRef.current !== "held") return;
      try {
        void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/control`, {
          method: "DELETE",
          headers: { [HOST_DEVICE_HEADER]: deviceId },
          keepalive: true,
        });
      } catch {
        // The 30-second takeover covers a release that never arrives.
      }
    };
    window.addEventListener("pagehide", release);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [sessionId, deviceId, send]);

  // While another console holds control, count down to the takeover each second.
  useEffect(() => {
    if (state.status !== "lost") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [state.status, state.observedAt]);

  return {
    state,
    takeoverReady: canTakeOver(state, now),
    takeoverIn: secondsUntilTakeover(state, now),
    takeOver,
    markLost,
  };
}
