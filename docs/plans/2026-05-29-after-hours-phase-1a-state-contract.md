# After Hours Redesign — Phase 1a: State Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the synced **run-of-show + content + variant** state contract that Phases 1b/2/3 build on — `lib/live/runOfShow.ts`, `lib/live/content.ts`, additive optional fields on `LiveRuntimeState`/`LiveSessionV1`, and validator support — with **no behaviour change** (no consumer reads the new fields yet).

**Architecture:** A shared, leaf `runOfShow.ts` defines the 13+2 screens and `ScreenId`. A `content.ts` defines the bounded `ContentKey` allowlist, design placeholders, derived defaults (from session/brand), a `getContent` resolver, and `sanitizeContent`. `types.ts` gains optional `screenId`/`content`/`welcomeVariant`/`titleVariant` (runtime) and `content`/`welcomeVariant`/`titleVariant` (session); the two validators (`validate.ts`, `storage.ts`) accept and normalise them. All new fields are **optional** (Phase 0 lesson: a required field breaks existing literals) — `screenId` is always populated by `makeEmptyRuntimeState` + `validateRuntimeState`.

**Tech stack:** TypeScript (strict), Vitest (from Phase 0). No DB, no React in this phase.

**Spec:** [spec §5.3–5.5, A2–A4](../specs/2026-05-29-music-bingo-after-hours-redesign.md). **Roadmap:** [roadmap](2026-05-29-after-hours-roadmap.md).

**Deviations from spec (deliberate):** (1) new runtime/session fields are `optional` not required (additive safety); (2) **no `status` field** on `LiveSessionV1` — the revised spec §0/§8.1 derives readiness instead of persisting it. The Phase 0 plan's stray `status?` mention is superseded.

---

## File structure

**Create**
- `lib/live/runOfShow.ts` — `ScreenId`, `RunOfShowStep`, `RUN_OF_SHOW`, `isScreenId`, `normalizeScreenId`.
- `lib/live/runOfShow.test.ts` — integrity + normaliser tests.
- `lib/live/content.ts` — `ContentKey`, `CONTENT_KEYS`, `CONTENT_PLACEHOLDERS`, `CONTENT_MAX_LENGTH`, `sanitizeContent`, `normalizeVariant`, `getContent`.
- `lib/live/content.test.ts` — sanitiser + precedence tests.

**Modify**
- `lib/live/types.ts` — add optional fields to `LiveRuntimeState` + `LiveSessionV1`; seed `screenId` in `makeEmptyRuntimeState`; add two type-only imports.
- `lib/live/validate.ts` — `validateLiveSession` accepts `content`/`welcomeVariant`/`titleVariant`.
- `lib/live/storage.ts` — `validateRuntimeState` accepts/normalises `screenId`/`content`/`welcomeVariant`/`titleVariant`.

**Out of this phase:** the motif/screen components (1b), guest/host consumption (2/3). Nothing renders the new fields yet.

---

## Task 1: `lib/live/runOfShow.ts` (TDD)

**Files:** Create `lib/live/runOfShow.ts`, `lib/live/runOfShow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/live/runOfShow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RUN_OF_SHOW, isScreenId, normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";

describe("RUN_OF_SHOW", () => {
  it("has the 13 show screens in canonical order", () => {
    const ids = RUN_OF_SHOW.filter((s) => !s.id.startsWith("sys-")).map((s) => s.id);
    expect(ids).toEqual([
      "welcome", "order", "quiz1", "title", "rules", "dance",
      "game1", "break", "quiz2", "sing", "game2", "winners", "thanks",
    ]);
  });
  it("includes the two system screens", () => {
    const ids = RUN_OF_SHOW.map((s) => s.id);
    expect(ids).toContain("sys-load");
    expect(ids).toContain("sys-none");
  });
  it("marks welcome and title as having variants", () => {
    expect(RUN_OF_SHOW.find((s) => s.id === "welcome")?.hasVariants).toBe(true);
    expect(RUN_OF_SHOW.find((s) => s.id === "title")?.hasVariants).toBe(true);
  });
  it("tags play/intro screens with their game number", () => {
    const game1 = RUN_OF_SHOW.find((s) => s.id === "game1");
    expect(game1?.game).toBe(1);
    expect(game1?.play).toBe(true);
    expect(RUN_OF_SHOW.find((s) => s.id === "dance")?.intro).toBe(true);
  });
  it("has unique ids", () => {
    const ids = RUN_OF_SHOW.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isScreenId / normalizeScreenId", () => {
  it("accepts known ids", () => {
    expect(isScreenId("welcome")).toBe(true);
    expect(isScreenId("nope")).toBe(false);
  });
  it("normalises unknown/absent to welcome", () => {
    expect(normalizeScreenId("game2")).toBe("game2" satisfies ScreenId);
    expect(normalizeScreenId("bogus")).toBe("welcome");
    expect(normalizeScreenId(undefined)).toBe("welcome");
    expect(normalizeScreenId(42)).toBe("welcome");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/live/runOfShow.test.ts`
Expected: FAIL — cannot resolve `@/lib/live/runOfShow`.

- [ ] **Step 3: Implement**

Create `lib/live/runOfShow.ts`:

```ts
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
  { id: "order", short: "Running Order", sub: "Tonight’s plan" },
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/live/runOfShow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/live/runOfShow.ts lib/live/runOfShow.test.ts
git commit -m "feat: add canonical run-of-show screen definitions"
```

---

## Task 2: `lib/live/content.ts` (TDD)

**Files:** Create `lib/live/content.ts`, `lib/live/content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/live/content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CONTENT_KEYS, sanitizeContent, normalizeVariant, getContent } from "@/lib/live/content";
import type { LiveSessionV1, LiveRuntimeState } from "@/lib/live/types";
import type { BrandConfig } from "@/lib/brands/types";

const brand = { name: "The Anchor", website_url: "theanchor.pub", break_message: "Back in 10", end_message: "Night night" } as unknown as BrandConfig;
const session = { eventDateDisplay: "Fri 27 June", games: [{ theme: "Pop Anthems" }, { theme: "Throwbacks" }] } as unknown as LiveSessionV1;

describe("sanitizeContent", () => {
  it("keeps only allowlisted keys, trims, and drops empties", () => {
    const out = sanitizeContent({ hostName: "  Nikki  ", bogusKey: "x", winTeam: "" });
    expect(out).toEqual({ hostName: "Nikki" });
  });
  it("caps overly long values", () => {
    const out = sanitizeContent({ welcomeLede: "x".repeat(1000) });
    expect((out.welcomeLede ?? "").length).toBeLessThanOrEqual(500);
  });
  it("returns an empty object for non-objects", () => {
    expect(sanitizeContent(null)).toEqual({});
    expect(sanitizeContent("nope")).toEqual({});
  });
});

describe("normalizeVariant", () => {
  it("accepts A/B/C, rejects everything else", () => {
    expect(normalizeVariant("B")).toBe("B");
    expect(normalizeVariant("D")).toBeNull();
    expect(normalizeVariant(undefined)).toBeNull();
  });
});

describe("getContent precedence", () => {
  const runtime = { content: { hostName: "Live Nikki" } } as unknown as LiveRuntimeState;
  it("runtime overrides session overrides derived overrides placeholder", () => {
    expect(getContent("hostName", { runtime, session, brand })).toBe("Live Nikki");
    expect(getContent("hostName", { session: { ...session, content: { hostName: "Saved Nikki" } } as LiveSessionV1, brand })).toBe("Saved Nikki");
  });
  it("derives g1theme/g2theme from the session games", () => {
    expect(getContent("g1theme", { session, brand })).toBe("Pop Anthems");
    expect(getContent("g2theme", { session, brand })).toBe("Throwbacks");
  });
  it("derives venue copy from the brand", () => {
    expect(getContent("venueName", { brand })).toBe("The Anchor");
    expect(getContent("venueWeb", { brand })).toBe("theanchor.pub");
  });
  it("falls back to the design placeholder when nothing else is set", () => {
    expect(getContent("welcomeTitle", {})).toBe("Music");
    expect(getContent("welcomeTitle2", {})).toBe("Bingo");
  });
  it("every ContentKey has a placeholder string", () => {
    for (const k of CONTENT_KEYS) expect(typeof getContent(k, {})).toBe("string");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/live/content.test.ts`
Expected: FAIL — cannot resolve `@/lib/live/content`.

- [ ] **Step 3: Implement**

Create `lib/live/content.ts`:

```ts
import type { LiveRuntimeState, LiveSessionV1 } from "@/lib/live/types";
import type { BrandConfig } from "@/lib/brands/types";

/**
 * Allowlisted editable-text keys shown on the TV screens. Bounded on purpose
 * (spec A3): unknown keys are dropped and values are length-capped so the
 * synced `content` map cannot bloat or carry arbitrary data.
 */
export const CONTENT_KEYS = [
  // venue / global
  "venueName", "venuePresents", "venueWeb", "hostName",
  // welcome / title
  "welcomeTitle", "welcomeTitle2", "welcomeTitleC", "welcomeLede", "welcomeLedeA",
  "welcomeDate", "introTitle", "introArtist", "titleTagline",
  // running order
  "ro1t", "ro1s", "ro2t", "ro2s", "ro3t", "ro3s", "ro4t", "ro4s", "ro5t", "ro5s", "ro6t", "ro6s",
  // quiz switch
  "q1_l1", "q1_lede", "q2_l1", "q2_lede",
  // house rules
  "hr1t", "hr1s", "hr2t", "hr2s", "hr3t", "hr3s", "hr4t", "hr4s",
  // warmups / gameplay
  "danceLede", "danceTitle", "danceArtist", "singLede", "singTitle", "singArtist",
  "g1theme", "g1title", "g1artist", "g2theme", "g2title", "g2artist",
  // break / winners / thanks / system
  "breakL1", "breakL2", "breakLede", "breakMins",
  "winTeam", "winPrize", "spoonTeam", "spoonPrize",
  "nextDate", "tyL1", "tyL2", "tyLede", "nfL1", "nfL2",
] as const;

export type ContentKey = (typeof CONTENT_KEYS)[number];

export const CONTENT_MAX_LENGTH = 500;

const CONTENT_KEY_SET = new Set<string>(CONTENT_KEYS);

/** Static fallbacks lifted verbatim from the design bundle (screens-a/b.jsx placeholders). */
export const CONTENT_PLACEHOLDERS: Record<ContentKey, string> = {
  venueName: "The Anchor", venuePresents: "The Anchor Presents", venueWeb: "theanchor.pub", hostName: "Nikki",
  welcomeTitle: "Music", welcomeTitle2: "Bingo", welcomeTitleC: "Welcome To The Show",
  welcomeLede: "Grab a drink, find your table and settle in — your host", welcomeLedeA: "Grab a drink, settle in —",
  welcomeDate: "Friday · 8:00 PM", introTitle: "Yes Sir, I Can Boogie", introArtist: "Baccara",
  titleTagline: "Five Lines · One Full House · Two Games",
  ro1t: "Quiz · Round One", ro1s: "Grab your phones — KaraFun mobile quiz",
  ro2t: "Bingo · Game 1", ro2s: "Warm up, then 50 songs to dab",
  ro3t: "The Interval", ro3s: "Refill at the bar — back in 10",
  ro4t: "Quiz · Round Two", ro4s: "Round two of the mobile quiz",
  ro5t: "Bingo · Game 2", ro5s: "Sing-along warm up, then Game 2",
  ro6t: "Prizes & Winners", ro6s: "Top table & wooden-spoon prizes",
  q1_l1: "Music Quiz", q1_lede: "Open the KaraFun app on your phone and get ready — we'll switch the big screen over to the quiz now.",
  q2_l1: "Music Quiz", q2_lede: "Round two — phones out again. We'll switch the big screen over to the quiz.",
  hr1t: "Listen for the song", hr1s: "We play a clip of each track. Know it? Find it on your card.",
  hr2t: "Dab your matches", hr2s: "Mark off every song you hear. One card per team, no sneaky extras.",
  hr3t: "Shout to win", hr3s: "A full line or full house? Yell “BINGO!” loud and proud.",
  hr4t: "Host has final say", hr4s: "Nikki checks every claim. Her word is law — be nice about it!",
  danceLede: "On your feet — this one's just for fun. Game 1 starts the moment it ends.", danceTitle: "Dancing Queen", danceArtist: "ABBA",
  singLede: "Lungs ready! A big sing-along to warm up. Game 2 kicks off right after.", singTitle: "Don't Look Back in Anger", singArtist: "Oasis",
  g1theme: "Pop Anthems", g1title: "Mr. Brightside", g1artist: "The Killers",
  g2theme: "Throwback Bangers", g2title: "Take On Me", g2artist: "a-ha",
  breakL1: "We're On", breakL2: "A Break", breakLede: "Grab a refill, stretch your legs and keep your cards safe.", breakMins: "10",
  winTeam: "The Spice Curls", winPrize: "£100 Bar Tab", spoonTeam: "Quiztopher Biggins", spoonPrize: "A Round of Shots",
  nextDate: "Fri 27 June · 8PM", tyL1: "Thank You", tyL2: "& Goodnight",
  tyLede: "We hope you had a brilliant night. If you did, a Google review means the world to us.",
  nfL1: "Nothing", nfL2: "On Yet",
};

export function isContentKey(value: unknown): value is ContentKey {
  return typeof value === "string" && CONTENT_KEY_SET.has(value);
}

/** Keep only allowlisted keys; trim; cap length; drop empties. Returns a safe partial map. */
export function sanitizeContent(input: unknown): Partial<Record<ContentKey, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Partial<Record<ContentKey, string>> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isContentKey(k) || typeof v !== "string") continue;
    const trimmed = v.trim().slice(0, CONTENT_MAX_LENGTH);
    if (trimmed) out[k] = trimmed;
  }
  return out;
}

export function normalizeVariant(value: unknown): "A" | "B" | "C" | null {
  return value === "A" || value === "B" || value === "C" ? value : null;
}

/** Defaults derived from live data (preferred over static placeholders). */
function derivedDefault(
  key: ContentKey,
  ctx: { session?: LiveSessionV1 | null; brand?: BrandConfig | null },
): string | undefined {
  const { session, brand } = ctx;
  switch (key) {
    case "g1theme": return session?.games?.[0]?.theme || undefined;
    case "g2theme": return session?.games?.[1]?.theme || undefined;
    case "venueName": return brand?.name || undefined;
    case "venuePresents": return brand?.name ? `${brand.name} Presents` : undefined;
    case "venueWeb": return brand?.website_url || undefined;
    case "nextDate": return session?.eventDateDisplay || undefined;
    case "breakLede": return brand?.break_message || undefined;
    case "tyLede": return brand?.end_message || undefined;
    default: return undefined;
  }
}

/** Resolve a content value with precedence: runtime → session → derived → placeholder (spec A3). */
export function getContent(
  key: ContentKey,
  ctx: { runtime?: LiveRuntimeState | null; session?: LiveSessionV1 | null; brand?: BrandConfig | null },
): string {
  return (
    ctx.runtime?.content?.[key]
    ?? ctx.session?.content?.[key]
    ?? derivedDefault(key, ctx)
    ?? CONTENT_PLACEHOLDERS[key]
    ?? ""
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/live/content.test.ts`
Expected: PASS. (May show a TS error on `runtime.content`/`session.content` until Task 3 adds those fields — if so, complete Task 3 then re-run; the test file itself is correct.)

> Note: if `tsc`/vitest complains that `LiveRuntimeState`/`LiveSessionV1` have no `content` property, that is expected before Task 3. Do Task 3 next, then this test compiles. Implementation order within the commit is fine; just ensure both pass before the gate.

- [ ] **Step 5: Commit**

```bash
git add lib/live/content.ts lib/live/content.test.ts
git commit -m "feat: add bounded content-key registry and getContent resolver"
```

---

## Task 3: Extend `lib/live/types.ts`

**Files:** Modify `lib/live/types.ts`

- [ ] **Step 1: Add type-only imports at the top of the file**

At the very top of `lib/live/types.ts` (before the existing `export const LIVE_SESSION_VERSION` line), add:

```ts
import type { ScreenId } from "@/lib/live/runOfShow";
import type { ContentKey } from "@/lib/live/content";
```

(Type-only imports — erased at runtime, so the `content.ts`↔`types.ts` cycle is safe.)

- [ ] **Step 2: Add optional fields to `LiveSessionV1`**

In the `LiveSessionV1` type, immediately after the `brandId?: string;` line (currently line ~146), add:

```ts
  /** Per-event editable TV text (spec A3). Bounded to ContentKey. */
  content?: Partial<Record<ContentKey, string>>;
  /** Session default layout variants for the Welcome / Title screens. */
  welcomeVariant?: "A" | "B" | "C";
  titleVariant?: "A" | "B" | "C";
```

- [ ] **Step 3: Add optional fields to `LiveRuntimeState`**

In the `LiveRuntimeState` type, immediately after the `introPlayed: boolean;` line (currently line ~193), add:

```ts
  /** Current run-of-show screen on the TV. Always populated by the factory/validator; optional for back-compat with older states. */
  screenId?: ScreenId;
  /** Live content snapshot pushed to the TV (spec A3), overrides session content. */
  content?: Partial<Record<ContentKey, string>>;
  /** Host-selected layout variants for the Welcome / Title screens. */
  welcomeVariant?: "A" | "B" | "C";
  titleVariant?: "A" | "B" | "C";
```

- [ ] **Step 4: Seed `screenId` in `makeEmptyRuntimeState`**

In `makeEmptyRuntimeState`, immediately after the `introPlayed: false,` line (currently line ~246), add:

```ts
    screenId: "welcome",
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (Existing host/guest code keeps compiling because every new field is optional.)

- [ ] **Step 6: Commit**

```bash
git add lib/live/types.ts
git commit -m "feat: add optional screenId/content/variant fields to live state types"
```

---

## Task 4: Accept new fields in `validateLiveSession` (`lib/live/validate.ts`)

**Files:** Modify `lib/live/validate.ts`

- [ ] **Step 1: Import the content/variant helpers**

At the top of `lib/live/validate.ts`, add after the existing `@/lib/live/types` import block:

```ts
import { sanitizeContent, normalizeVariant } from "@/lib/live/content";
```

- [ ] **Step 2: Parse the new fields in `validateLiveSession`**

In `validateLiveSession`, immediately after the `const brandId = asString(input.brandId);` line (currently line ~119), add:

```ts
  const content = sanitizeContent(input.content);
  const welcomeVariant = normalizeVariant(input.welcomeVariant);
  const titleVariant = normalizeVariant(input.titleVariant);
```

- [ ] **Step 3: Include them in the returned object**

In the `return { ... }` of `validateLiveSession`, immediately after the `...(brandId ? { brandId } : {}),` line, add:

```ts
    ...(Object.keys(content).length ? { content } : {}),
    ...(welcomeVariant ? { welcomeVariant } : {}),
    ...(titleVariant ? { titleVariant } : {}),
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run lib/live/content.test.ts`
Expected: tsc clean; content tests pass (they now compile against the extended `LiveSessionV1`).

- [ ] **Step 5: Commit**

```bash
git add lib/live/validate.ts
git commit -m "feat: validate optional content/variant fields on live sessions"
```

---

## Task 5: Normalise new fields in `validateRuntimeState` (`lib/live/storage.ts`)

**Files:** Modify `lib/live/storage.ts`

- [ ] **Step 1: Import the normalisers**

At the top of `lib/live/storage.ts`, after the existing `@/lib/live/validate` import, add:

```ts
import { normalizeScreenId } from "@/lib/live/runOfShow";
import { sanitizeContent, normalizeVariant } from "@/lib/live/content";
```

- [ ] **Step 2: Normalise inside `validateRuntimeState`**

In `validateRuntimeState`, immediately before the final `return { ... }` (currently after the `currentTrack` block, ~line 164), add:

```ts
  const screenId = normalizeScreenId(input.screenId);
  const content = sanitizeContent(input.content);
  const welcomeVariant = normalizeVariant(input.welcomeVariant);
  const titleVariant = normalizeVariant(input.titleVariant);
```

- [ ] **Step 3: Add them to the returned object**

In the `return { ... }` of `validateRuntimeState`, immediately after the `introPlayed: Boolean(input.introPlayed),` line (currently line ~194), add:

```ts
    screenId,
    ...(Object.keys(content).length ? { content } : {}),
    ...(welcomeVariant ? { welcomeVariant } : {}),
    ...(titleVariant ? { titleVariant } : {}),
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run lib/live/storage.test.ts`
Expected: tsc clean; the existing storage tests still pass (round-trip now carries `screenId: "welcome"` by default — confirm no existing assertion forbids extra keys; the storage test asserts specific fields, not exact-object equality).

- [ ] **Step 5: Commit**

```bash
git add lib/live/storage.ts
git commit -m "feat: normalise screenId/content/variants in runtime validation"
```

---

## Task 6: Phase 1a verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full deterministic gate**

Run: `npm run lint && npx tsc --noEmit && npm run test:unit`
Expected: lint 0 warnings; tsc clean; **test:unit all green** (Phase 0's 37 + runOfShow + content suites).

- [ ] **Step 2: Build (confirms no module-cycle/runtime issue from the type-only imports)**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Behaviour-unchanged sanity**

Confirm no consumer reads the new fields yet (grep): `grep -rn "\.screenId\|runOfShow\|getContent\|\.content\[" app components | grep -v node_modules` → expect **no hits in `app/` or `components/`** (consumption begins in Phases 1b/2/3). The new fields are dormant: existing host/guest flows behave exactly as before.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore: Phase 1a state contract verified"
```

---

## Self-review

**Spec coverage:** `runOfShow.ts` (§5.4) → Task 1; `content.ts` with bounded `ContentKey` + derived defaults + `getContent` (§5.5, A3) → Task 2; runtime/session field additions (§5.3, A2/A4) → Tasks 3–5; validators normalise + allowlist (§5.3) → Tasks 4–5.

**Placeholder scan:** none — full code for both new files + their tests; exact anchored inserts for the three edits.

**Type/name consistency:** `ScreenId`/`normalizeScreenId`/`RUN_OF_SHOW` (Task 1) consumed in Tasks 3 & 5; `ContentKey`/`sanitizeContent`/`normalizeVariant`/`getContent`/`CONTENT_KEYS` (Task 2) consumed in Tasks 2–5. `content?: Partial<Record<ContentKey,string>>` typed identically on runtime + session. Type-only imports both directions (Task 3) — no runtime cycle.

**Deviations (intentional, documented above):** optional (not required) new fields; no persisted `status`. Both reduce blast radius and match the revised spec + the Phase 0 `.optional()` lesson.

**Risk:** the only cross-file effect is the two type-only imports forming a `types↔content` cycle — safe under `import type` (Step 1 of Task 3 uses it explicitly); Task 6 Step 2's build confirms no runtime cycle.
