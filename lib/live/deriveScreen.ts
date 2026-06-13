import type { LiveRuntimeState } from "@/lib/live/types";
import type { ScreenId } from "@/lib/live/runOfShow";

/**
 * Best-effort mapping from the legacy runtime model (`mode` + `activeGameNumber`
 * + `isIntroSong`) to a run-of-show screen. Used as a fallback when
 * `runtime.screenId` is not set — e.g. before the Phase 3 host explicitly
 * drives the screen. When the host sets `screenId`, that takes precedence
 * (see `app/display/[sessionId]/page.tsx`). This keeps the TV showing a sensible
 * screen with the current (pre-Phase-3) host.
 */
export function deriveScreenId(runtime: LiveRuntimeState): ScreenId {
  const game = runtime.activeGameNumber;
  switch (runtime.mode) {
    case "break":
      return "break";
    case "ended":
      return "thanks";
    case "running":
    case "paused": {
      if (runtime.isIntroSong) return game === 2 ? "sing" : "dance";
      if (game === 2) return "game2";
      if (game === 1) return "game1";
      return "welcome";
    }
    case "idle":
    default:
      return "welcome";
  }
}
