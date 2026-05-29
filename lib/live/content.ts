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
