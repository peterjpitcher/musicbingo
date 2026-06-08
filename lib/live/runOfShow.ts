/**
 * Canonical run-of-show. Shared by the host controller (the "Run Of Show" list +
 * Prev/Next) and the guest TV (which screen to render for runtime.screenId).
 * Order matches the design bundle (app.jsx SCREENS / host.jsx STEPS).
 */
export type ScreenId =
  | "welcome" | "order" | "quiz1" | "title" | "rules" | "dance"
  | "game1" | "claim" | "break" | "quiz2" | "sing" | "game2" | "winner-entry" | "winners" | "thanks"
  | "sys-load" | "sys-none";

export interface RunOfShowStep {
  id: ScreenId;
  /** Short label for the host's run-of-show list. */
  short: string;
  /** Secondary line in the host's run-of-show list. */
  sub: string;
  /** Game number for play/intro screens. */
  game?: 1 | 2;
  /** True for the warm-up/intro screens (song plays in full, no auto-advance). */
  intro?: boolean;
  /** True for the live bingo screens (album reveal timeline). */
  play?: boolean;
  /**
   * True for on-demand screens that are NOT part of the navigable show: they are
   * triggered by a dedicated host action (e.g. the Bingo Claim button) rather
   * than reached via Prev/Next, and are hidden from the host's run-of-show list.
   * They remain valid, registered ScreenIds so the guest still renders them when
   * `screenId` is set to one.
   */
  overlay?: boolean;
}

export const RUN_OF_SHOW: RunOfShowStep[] = [
  { id: "welcome", short: "Welcome", sub: "Doors / intro song" },
  { id: "order", short: "Running Order", sub: "Tonight's plan" },
  { id: "quiz1", short: "Switch · Quiz R1", sub: "KaraFun round 1" },
  { id: "title", short: "Bingo Title", sub: "Logo reveal" },
  { id: "rules", short: "House Rules", sub: "How it works" },
  { id: "dance", short: "Dance Warm-Up", sub: "Intro · plays in full", game: 1, intro: true },
  { id: "game1", short: "Game 1", sub: "Music Bingo", game: 1, play: true },
  { id: "break", short: "Interval", sub: "Break screen" },
  { id: "quiz2", short: "Switch · Quiz R2", sub: "KaraFun round 2" },
  { id: "sing", short: "Sing Warm-Up", sub: "Intro · plays in full", game: 2, intro: true },
  { id: "game2", short: "Game 2", sub: "Music Bingo", game: 2, play: true },
  { id: "winner-entry", short: "Winner Entry", sub: "Enter final results" },
  { id: "winners", short: "Winners", sub: "1st & wooden spoon" },
  { id: "thanks", short: "Thank You", sub: "Reviews / next event" },
  // On-demand overlay — triggered by the host's Bingo Claim button on a shout,
  // not reached via Prev/Next and hidden from the run-of-show list. Still a
  // registered ScreenId so the guest renders it when screenId === "claim".
  { id: "claim", short: "Bingo Claim", sub: "Songs played this game", overlay: true },
  // System screens — not part of the navigable show, rendered on state.
  { id: "sys-load", short: "⚙ Loading", sub: "Connecting" },
  { id: "sys-none", short: "⚙ No Session", sub: "Standing by" },
];

const SCREEN_IDS = new Set<string>(RUN_OF_SHOW.map((s) => s.id));

/**
 * The navigable, displayable show steps: excludes system (`sys-*`) and on-demand
 * `overlay` screens (e.g. Bingo Claim). This is the single source of truth for
 * both the host's run-of-show list and Prev/Next stepping, so overlays never
 * appear as numbered steps and Prev/Next skips straight over them.
 */
export const SHOW_STEPS: RunOfShowStep[] = RUN_OF_SHOW.filter(
  (s) => !s.id.startsWith("sys-") && !s.overlay
);

export function isScreenId(value: unknown): value is ScreenId {
  return typeof value === "string" && SCREEN_IDS.has(value);
}

export function normalizeScreenId(value: unknown, fallback: ScreenId = "welcome"): ScreenId {
  return isScreenId(value) ? value : fallback;
}
