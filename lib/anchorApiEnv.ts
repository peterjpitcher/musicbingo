/**
 * Where the management app's events API settings come from (spec M-7, S7.1).
 *
 * The standard names are ANCHOR_API_KEY (the app's own key with the
 * read:events scope) and ANCHOR_API_BASE_URL. Until this release Music Bingo
 * read MANAGEMENT_API_TOKEN and MANAGEMENT_API_BASE_URL, and the Anchor
 * venue's key sat in brands.event_feed_api_key. The old env names are still
 * read for ONE release, so a deployment that has not been renamed yet keeps
 * its events; each use is reported as deprecated. Remove the fallback in the
 * release after this one (see CLAUDE.md, Environment variables).
 *
 * The key is never read from the database any more. Server only: the key
 * travels in a header from here and never reaches a browser.
 */

/** The kit's default (`DEFAULT_ANCHOR_API_BASE_URL` in @anchor-nights/kit/events). */
export const DEFAULT_ANCHOR_API_BASE_URL = "https://management.orangejelly.co.uk/api";

/** Each standard name and the old name still read in its place for one release. */
export const DEPRECATED_ANCHOR_API_NAMES = Object.freeze({
  ANCHOR_API_KEY: "MANAGEMENT_API_TOKEN",
  ANCHOR_API_BASE_URL: "MANAGEMENT_API_BASE_URL",
} as const);

export type AnchorApiEnvName = keyof typeof DEPRECATED_ANCHOR_API_NAMES;

export interface AnchorApiEnv {
  /** Null when neither ANCHOR_API_KEY nor the old name is set: the feed answers missing_config. */
  apiKey: string | null;
  /** No trailing slash; the kit's default when neither name is set. */
  baseUrl: string;
  /** The old names this environment still relies on, for the deprecation note. */
  deprecated: string[];
}

function read(env: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** The events API settings: the standard names first, then the old ones. */
export function resolveAnchorApiEnv(env: Readonly<Record<string, string | undefined>> = process.env): AnchorApiEnv {
  const deprecated: string[] = [];
  const pick = (name: AnchorApiEnvName): string | undefined => {
    const standard = read(env, name);
    if (standard) return standard;
    const old = read(env, DEPRECATED_ANCHOR_API_NAMES[name]);
    if (old) deprecated.push(DEPRECATED_ANCHOR_API_NAMES[name]);
    return old;
  };
  const apiKey = pick("ANCHOR_API_KEY") ?? null;
  const baseUrl = (pick("ANCHOR_API_BASE_URL") ?? DEFAULT_ANCHOR_API_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl, deprecated };
}

/** The sentence logged when an old name is still in use, or null when none is. */
export function deprecationNote(deprecated: readonly string[]): string | null {
  if (deprecated.length === 0) return null;
  const renames = deprecated
    .map((old) => {
      const standard = (Object.keys(DEPRECATED_ANCHOR_API_NAMES) as AnchorApiEnvName[]).find(
        (name) => DEPRECATED_ANCHOR_API_NAMES[name] === old,
      );
      return `${old} to ${standard}`;
    })
    .join(" and ");
  return `[events-feed] deprecated env names in use: rename ${renames}. The old names are read for one more release only.`;
}
