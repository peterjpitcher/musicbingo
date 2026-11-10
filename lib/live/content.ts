import type { LiveRuntimeState, LiveSessionV1 } from "@/lib/live/types";
import type { BrandConfig } from "@/lib/brands/types";
import { websiteLabel } from "@/lib/brands/websiteUrl";

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
  // ro7 is the half-time standings row and ro8 the interactive game, both added
  // later and slotted into the middle of the list (see RunningOrder).
  "ro1t", "ro1s", "ro2t", "ro2s", "ro3t", "ro3s", "ro4t", "ro4s", "ro5t", "ro5s", "ro6t", "ro6s",
  "ro7t", "ro7s", "ro8t",
  // quiz switch
  "q1_l1", "q1_lede", "q2_l1", "q2_lede",
  // house rules
  "hr1t", "hr1s", "hr2t", "hr2s", "hr3t", "hr3s", "hr4t", "hr4s",
  // warmups / gameplay
  "danceLede", "danceTitle", "danceArtist", "singLede", "singTitle", "singArtist",
  "g1theme", "g1title", "g1artist", "g2theme", "g2title", "g2artist",
  // break / winners / thanks / system
  "breakL1", "breakL2", "breakLede", "breakMins",
  "winPrize", "spoonPrize",
  // The thank-you screen (spec M-7) is the kit's: the host may hide a card for
  // tonight ("1"), never type a date or a link. The typed nextDate,
  // reviewQrUrl and bookQrUrl and the old headline keys are gone; a stored
  // value for any of them is dropped by sanitizeContent.
  "tyHideReview", "tyHideNext", "nfL1", "nfL2",
] as const;

export type ContentKey = (typeof CONTENT_KEYS)[number];

export const CONTENT_MAX_LENGTH = 500;

const CONTENT_KEY_SET = new Set<string>(CONTENT_KEYS);

/**
 * Static fallbacks lifted from the design bundle (screens-a/b.jsx placeholders).
 *
 * Facts about a real night are never invented: the host name and the prizes
 * are empty unless the host types them, and an empty value hides that element
 * on the TV. The next event comes only from the events feed (spec M-7). Until 6 November 2026 these held design sample
 * values ("Fri 27 June · 8PM", a sample host name and sample prizes), which
 * the TV showed whenever the host left the fields blank. Until 7 November
 * 2026 the welcome date ("Friday · 8:00 PM"), the songs and the game themes
 * did the same; they now come from the session, the events feed and Spotify
 * (lib/live/welcomeWhen.ts), and are blank without them.
 */
export const CONTENT_PLACEHOLDERS: Record<ContentKey, string> = {
  venueName: "The Anchor", venuePresents: "The Anchor Presents", venueWeb: "", hostName: "",
  welcomeTitle: "Music", welcomeTitle2: "Bingo", welcomeTitleC: "Welcome To The Show",
  welcomeLede: "Grab a drink, find your table and settle in — your host", welcomeLedeA: "Grab a drink, settle in —",
  // The welcome date, the songs and the game themes come only from real
  // data (the session, the events feed, Spotify) or the host: never a sample.
  welcomeDate: "", introTitle: "", introArtist: "",
  titleTagline: "Lines · Full House · Two Games",
  ro1t: "Quiz · Round One", ro1s: "Grab your phones — KaraFun mobile quiz",
  ro2t: "Music Bingo · Game 1", ro2s: "Warm up, then 50 songs to dab",
  ro3t: "The Interval", ro3s: "Refill at the bar — back in 10",
  ro4t: "Quiz · Round Two", ro4s: "Round two of the mobile quiz",
  ro5t: "Music Bingo · Game 2", ro5s: "Sing-along warm up, then Game 2",
  ro6t: "Prizes & Winners", ro6s: "Top table & wooden-spoon prizes",
  ro7t: "Half-Time Standings", ro7s: "Who's up, who's chasing, no scores",
  ro8t: "Interactive Game",
  q1_l1: "Music Quiz", q1_lede: "Open the KaraFun app on your phone and get ready — we'll switch the big screen over to the quiz now.",
  q2_l1: "Music Quiz", q2_lede: "Round two — phones out again. We'll switch the big screen over to the quiz.",
  hr1t: "Listen for the song", hr1s: "Every clip is a track. Know the song or the artist? Find it on your card.",
  hr2t: "Dab your matches", hr2s: "Cross off each one as you hear it. Blank squares are free and count towards your line.",
  hr3t: "Lines & full house", hr3s: "One line: any line on any card. Two lines: two lines on one card. Full house: all three lines on one card.",
  hr4t: "Shout BINGO!", hr4s: "Got a win? Shout BINGO! as loud as you can — we'll stop and check your claim.",
  danceLede: "On your feet — this one's just for fun. Game 1 starts the moment it ends.", danceTitle: "", danceArtist: "",
  singLede: "Lungs ready! A big sing-along to warm up. Game 2 kicks off right after.", singTitle: "", singArtist: "",
  g1theme: "", g1title: "", g1artist: "",
  g2theme: "", g2title: "", g2artist: "",
  breakL1: "We're On", breakL2: "A Break", breakLede: "Grab a refill, stretch your legs and keep your cards safe.", breakMins: "10",
  winPrize: "", spoonPrize: "",
  tyHideReview: "", tyHideNext: "",
  nfL1: "Nothing", nfL2: "On Yet",
};

export function isContentKey(value: unknown): value is ContentKey {
  return typeof value === "string" && CONTENT_KEY_SET.has(value);
}

/**
 * The old design samples a stored game may still hold. Pressing "Edit live"
 * and leaving one of these fields saved the sample shown in it as if the host
 * had typed it, so a stored copy is dropped and the real value shows instead.
 */
export const RETIRED_SAMPLE_VALUES: Readonly<Partial<Record<ContentKey, readonly string[]>>> = Object.freeze({
  welcomeDate: ["Friday · 8:00 PM"],
  g1theme: ["Pop Anthems"],
  g2theme: ["Throwback Bangers"],
});

/** Keep only allowlisted keys; trim; cap length; drop empties and retired samples. Returns a safe partial map. */
export function sanitizeContent(input: unknown): Partial<Record<ContentKey, string>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Partial<Record<ContentKey, string>> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isContentKey(k) || typeof v !== "string") continue;
    const trimmed = v.trim().slice(0, CONTENT_MAX_LENGTH);
    if (!trimmed || RETIRED_SAMPLE_VALUES[k]?.includes(trimmed)) continue;
    out[k] = trimmed;
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
    case "ro2t": return "Music Bingo · Game 1";
    case "ro2s": return session?.games?.[0]?.theme
      ? `${session.games[0].theme} — warm up, then 50 songs to dab`
      : undefined;
    case "ro5t": return "Music Bingo · Game 2";
    case "ro5s": return session?.games?.[1]?.theme
      ? `${session.games[1].theme} — sing-along warm up, then Game 2`
      : undefined;
    case "venueName": return brand?.name || undefined;
    case "venuePresents": return brand?.name ? `${brand.name} Presents` : undefined;
    case "venueWeb": return websiteLabel(brand?.website_url) || undefined;
    case "breakLede": return brand?.break_message || undefined;
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
