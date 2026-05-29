/**
 * Canonical run-of-show. Shared by the host controller (the "Run Of Show" list +
 * Prev/Next) and the guest TV (which screen to render for runtime.screenId).
 * Order matches the design bundle (app.jsx SCREENS / host.jsx STEPS).
 */
export type ScreenId =
  | "welcome" | "order" | "quiz1" | "title" | "rules" | "dance"
  | "game1" | "break" | "quiz2" | "sing" | "game2" | "winners" | "thanks"
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
  /** True when the screen offers A/B/C layout variants. */
  hasVariants?: boolean;
}

export const RUN_OF_SHOW: RunOfShowStep[] = [
  { id: "welcome", short: "Welcome", sub: "Doors / intro song", hasVariants: true },
  { id: "order", short: "Running Order", sub: "Tonight's plan" },
  { id: "quiz1", short: "Switch · Quiz R1", sub: "KaraFun round 1" },
  { id: "title", short: "Bingo Title", sub: "Logo reveal", hasVariants: true },
  { id: "rules", short: "House Rules", sub: "How it works" },
  { id: "dance", short: "Dance Warm-Up", sub: "Intro · plays in full", game: 1, intro: true },
  { id: "game1", short: "Game 1", sub: "Music Bingo", game: 1, play: true },
  { id: "break", short: "Interval", sub: "Break screen" },
  { id: "quiz2", short: "Switch · Quiz R2", sub: "KaraFun round 2" },
  { id: "sing", short: "Sing Warm-Up", sub: "Intro · plays in full", game: 2, intro: true },
  { id: "game2", short: "Game 2", sub: "Music Bingo", game: 2, play: true },
  { id: "winners", short: "Winners", sub: "1st & wooden spoon" },
  { id: "thanks", short: "Thank You", sub: "Reviews / next event" },
  // System screens — not part of the navigable show, rendered on state.
  { id: "sys-load", short: "⚙ Loading", sub: "Connecting" },
  { id: "sys-none", short: "⚙ No Session", sub: "Standing by" },
];

const SCREEN_IDS = new Set<string>(RUN_OF_SHOW.map((s) => s.id));

export function isScreenId(value: unknown): value is ScreenId {
  return typeof value === "string" && SCREEN_IDS.has(value);
}

export function normalizeScreenId(value: unknown, fallback: ScreenId = "welcome"): ScreenId {
  return isScreenId(value) ? value : fallback;
}
