import { describe, expect, test } from "vitest";

import { OTHER_NIGHT_URL_ENV as APP_OTHER_NIGHT_URL_ENV } from "./otherNights";
import {
  CRON_SECRET_MIN_LENGTH,
  OTHER_NIGHT_URL_ENV,
  SPOTIFY_CALLBACK_PATH,
  ERROR_SINK_TOKEN_MIN_LENGTH,
  LIVE_LINK_SECRET_MIN_LENGTH,
  checkMusicBingoEnv,
  validateMusicBingoEnv,
} from "./buildEnv.mjs";

/** What every build needs since staff sign-in (M-8) and dedicated link signing (M-9), with placeholder values. */
const AUTH_OK = {
  LIVE_LINK_SECRET: "l".repeat(LIVE_LINK_SECRET_MIN_LENGTH),
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-placeholder",
  NEXT_PUBLIC_APP_URL: "https://musicbingo.example.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  AUDIT_HMAC_KEY: `v1:${"a".repeat(64)}`,
};

const PRODUCTION_OK = {
  ...AUTH_OK,
  VERCEL_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SPOTIFY_CLIENT_ID: "id",
  SPOTIFY_CLIENT_SECRET: "secret",
  CRON_SECRET: "c".repeat(CRON_SECRET_MIN_LENGTH),
  ANCHOR_API_KEY: `anch_${"k".repeat(43)}`,
  NEXT_PUBLIC_SITE_URL: "https://musicbingo.example.com",
  SPOTIFY_WEB_REDIRECT_URI: "https://musicbingo.example.com/api/spotify/callback",
};

const AUTH_NAMES = Object.keys(AUTH_OK);

describe("checkMusicBingoEnv", () => {
  test("a local or CI build with the sign-in settings passes", () => {
    expect(checkMusicBingoEnv(AUTH_OK)).toEqual([]);
  });

  test("every build, local or preview, names each missing sign-in setting", () => {
    for (const env of [{}, { VERCEL_ENV: "preview" }]) {
      const problems = checkMusicBingoEnv(env);
      for (const name of AUTH_NAMES) {
        expect(problems).toContain(`${name} is not set.`);
      }
    }
  });

  test("a missing LIVE_LINK_SECRET fails every build, local, preview and production (no fallback)", () => {
    const { LIVE_LINK_SECRET: _omitted, ...withoutLinkSecret } = AUTH_OK;
    for (const env of [withoutLinkSecret, { ...withoutLinkSecret, VERCEL_ENV: "preview" }]) {
      expect(checkMusicBingoEnv(env).some((p) => p.startsWith("LIVE_LINK_SECRET is not set"))).toBe(true);
    }
    const { LIVE_LINK_SECRET: _gone, ...productionWithout } = PRODUCTION_OK;
    expect(() => validateMusicBingoEnv({ ...productionWithout, APP_ADMIN_SECRET: "the old admin secret", SUPABASE_SERVICE_ROLE_KEY: "service-role" })).toThrow(/LIVE_LINK_SECRET/);
  });

  test("a production build names every missing setting", () => {
    const problems = checkMusicBingoEnv({ VERCEL_ENV: "production" });
    for (const name of ["SUPABASE_URL", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "LIVE_LINK_SECRET", "CRON_SECRET", ...AUTH_NAMES]) {
      expect(problems.some((problem) => problem.startsWith(`${name} is not set`))).toBe(true);
    }
  });

  test("the retired admin secret is no longer asked for", () => {
    expect(checkMusicBingoEnv(PRODUCTION_OK)).toEqual([]);
    expect(checkMusicBingoEnv({ VERCEL_ENV: "production" }).some((p) => p.includes("APP_ADMIN_SECRET"))).toBe(false);
  });

  test("a malformed Supabase URL fails", () => {
    expect(checkMusicBingoEnv({ ...PRODUCTION_OK, SUPABASE_URL: "not a url" })).toContain("SUPABASE_URL is not a URL.");
  });

  test("the two Supabase URLs must be the same project", () => {
    const problems = checkMusicBingoEnv({ ...PRODUCTION_OK, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" });
    expect(problems.some((p) => p.startsWith("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must be the same project"))).toBe(true);
  });

  test("the app URL must be an https origin in production", () => {
    const problems = checkMusicBingoEnv({ ...PRODUCTION_OK, NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000" });
    expect(problems.some((p) => p.startsWith("NEXT_PUBLIC_APP_URL must use https"))).toBe(true);
  });

  test("a malformed audit key fails", () => {
    const problems = checkMusicBingoEnv({ ...PRODUCTION_OK, AUDIT_HMAC_KEY: "plain-text" });
    expect(problems.some((p) => p.startsWith("AUDIT_HMAC_KEY"))).toBe(true);
  });

  test("short link and cron secrets fail", () => {
    const problems = checkMusicBingoEnv({ ...PRODUCTION_OK, LIVE_LINK_SECRET: "short", CRON_SECRET: "short" });
    expect(problems).toContain(`LIVE_LINK_SECRET must be at least ${LIVE_LINK_SECRET_MIN_LENGTH} characters.`);
    expect(problems).toContain(`CRON_SECRET must be at least ${CRON_SECRET_MIN_LENGTH} characters with no spaces.`);
  });

  test("a link secret with spaces is accepted, so the old admin secret's value can be reused", () => {
    expect(checkMusicBingoEnv({ ...PRODUCTION_OK, LIVE_LINK_SECRET: "a long admin phrase" })).toEqual([]);
  });

  test("an error sink needs a long token", () => {
    const sink = { ...PRODUCTION_OK, ERROR_SINK_URL: "https://music-bingo.vercel.app/api/errors" };
    expect(checkMusicBingoEnv({ ...sink, ERROR_SINK_TOKEN: "short" })).toEqual([
      `ERROR_SINK_TOKEN must be set to a random value of at least ${ERROR_SINK_TOKEN_MIN_LENGTH} characters when ERROR_SINK_URL is set.`,
    ]);
    expect(checkMusicBingoEnv({ ...sink, ERROR_SINK_TOKEN: "x".repeat(ERROR_SINK_TOKEN_MIN_LENGTH) })).toEqual([]);
  });

  test("an error sink must be https", () => {
    const problems = checkMusicBingoEnv({ ...PRODUCTION_OK, ERROR_SINK_URL: "http://example.com/api/errors", ERROR_SINK_TOKEN: "x".repeat(40) });
    expect(problems.some((problem) => problem.startsWith("ERROR_SINK_URL"))).toBe(true);
  });
});

describe("the events feed and review link settings (spec M-7)", () => {
  test("a production build needs the events key", () => {
    const { ANCHOR_API_KEY: _key, ...withoutKey } = PRODUCTION_OK;
    expect(checkMusicBingoEnv(withoutKey).join(" ")).toContain("ANCHOR_API_KEY is not set");
  });

  test("the old MANAGEMENT_API_TOKEN still satisfies a production build for one release", () => {
    const { ANCHOR_API_KEY: _key, ...withoutKey } = PRODUCTION_OK;
    expect(checkMusicBingoEnv({ ...withoutKey, MANAGEMENT_API_TOKEN: "an-older-token" })).toEqual([]);
  });

  test("local and preview builds go without a key (the TV shows \"See what's on\")", () => {
    expect(checkMusicBingoEnv(AUTH_OK)).toEqual([]);
    expect(checkMusicBingoEnv({ ...AUTH_OK, VERCEL_ENV: "preview" })).toEqual([]);
  });

  test("a set ANCHOR_API_KEY must look like a key", () => {
    const problems = checkMusicBingoEnv({ ...AUTH_OK, ANCHOR_API_KEY: "vercel env add ANCHOR_API_KEY" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("ANCHOR_API_KEY does not look like a management API key");
  });

  test("the events address must be https", () => {
    expect(checkMusicBingoEnv({ ...AUTH_OK, ANCHOR_API_BASE_URL: "http://mgmt.example.com/api" }).join(" ")).toContain("must use https");
    expect(checkMusicBingoEnv({ ...AUTH_OK, MANAGEMENT_API_BASE_URL: "http://mgmt.example.com" }).join(" ")).toContain("must use https");
  });

  test("the review link is optional and only ever an https the-anchor.pub link", () => {
    expect(checkMusicBingoEnv({ ...AUTH_OK, REVIEW_SHORT_URL: "https://l.the-anchor.pub/mbreview" })).toEqual([]);
    expect(checkMusicBingoEnv({ ...AUTH_OK, REVIEW_SHORT_URL: "http://l.the-anchor.pub/mbreview" })).not.toEqual([]);
    expect(checkMusicBingoEnv({ ...AUTH_OK, REVIEW_SHORT_URL: "https://g.page/r/the-anchor/review" })).not.toEqual([]);
    expect(checkMusicBingoEnv({ ...AUTH_OK, REVIEW_SHORT_URL: "https://l.the-anchor.pub.evil.example/x" })).not.toEqual([]);
  });
});

describe("the address and Spotify callback (spec M-10)", () => {
  test("a production build needs its own address and Spotify callback", () => {
    const { NEXT_PUBLIC_SITE_URL: _site, SPOTIFY_WEB_REDIRECT_URI: _redirect, ...without } = PRODUCTION_OK;
    const problems = checkMusicBingoEnv(without);
    expect(problems.some((p) => p.startsWith("NEXT_PUBLIC_SITE_URL is not set"))).toBe(true);
    expect(problems.some((p) => p.startsWith("SPOTIFY_WEB_REDIRECT_URI is not set"))).toBe(true);
  });

  test("local and preview builds go without either (links and the callback follow the request's address)", () => {
    expect(checkMusicBingoEnv(AUTH_OK)).toEqual([]);
    expect(checkMusicBingoEnv({ ...AUTH_OK, VERCEL_ENV: "preview" })).toEqual([]);
  });

  test("the new address passes once both settings name it", () => {
    const env = {
      ...PRODUCTION_OK,
      NEXT_PUBLIC_APP_URL: "https://musicbingo.the-anchor.pub",
      NEXT_PUBLIC_SITE_URL: "https://musicbingo.the-anchor.pub",
      SPOTIFY_WEB_REDIRECT_URI: "https://musicbingo.the-anchor.pub/api/spotify/callback",
    };
    expect(checkMusicBingoEnv(env)).toEqual([]);
  });

  test("the Spotify callback must be on NEXT_PUBLIC_APP_URL's address", () => {
    const problems = checkMusicBingoEnv({
      ...PRODUCTION_OK,
      SPOTIFY_WEB_REDIRECT_URI: "https://oj-music-bingo.vercel.app/api/spotify/callback",
    });
    expect(problems.some((p) => p.startsWith("SPOTIFY_WEB_REDIRECT_URI must be on the same address as NEXT_PUBLIC_APP_URL"))).toBe(true);
  });

  test("the Spotify callback must be this app's callback path, with no query", () => {
    for (const value of [
      "https://musicbingo.example.com/callback",
      "https://musicbingo.example.com/api/spotify/callback?x=1",
      "https://musicbingo.example.com/api/spotify/callback/",
    ]) {
      const problems = checkMusicBingoEnv({ ...PRODUCTION_OK, SPOTIFY_WEB_REDIRECT_URI: value });
      expect(problems.some((p) => p.includes(`must be this app's ${SPOTIFY_CALLBACK_PATH}`)), value).toBe(true);
    }
  });

  test("the Spotify callback must use https, except a loopback address on a local run", () => {
    const prod = checkMusicBingoEnv({ ...PRODUCTION_OK, SPOTIFY_WEB_REDIRECT_URI: "http://musicbingo.example.com/api/spotify/callback" });
    expect(prod.some((p) => p.startsWith("SPOTIFY_WEB_REDIRECT_URI must use https"))).toBe(true);
    const local = {
      ...AUTH_OK,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      SPOTIFY_WEB_REDIRECT_URI: "http://127.0.0.1:3000/api/spotify/callback",
    };
    expect(checkMusicBingoEnv(local)).toEqual([]);
  });

  test("the public address must be a bare https origin and agree with NEXT_PUBLIC_APP_URL", () => {
    const pathy = checkMusicBingoEnv({ ...PRODUCTION_OK, NEXT_PUBLIC_SITE_URL: "https://musicbingo.example.com/host" });
    expect(pathy.some((p) => p.startsWith("NEXT_PUBLIC_SITE_URL"))).toBe(true);
    const other = checkMusicBingoEnv({ ...PRODUCTION_OK, NEXT_PUBLIC_SITE_URL: "https://musicbingo.the-anchor.pub" });
    expect(other.some((p) => p.startsWith("NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_APP_URL must be the same address"))).toBe(true);
  });

  test("the sister nights' addresses are optional, and https origins when set", () => {
    expect(checkMusicBingoEnv({ ...AUTH_OK, NEXT_PUBLIC_QUIZ_NIGHT_URL: "https://quiz.example.com" })).toEqual([]);
    expect(checkMusicBingoEnv({ ...AUTH_OK, NEXT_PUBLIC_CASH_BINGO_URL: "http://bingo.example.com" })).not.toEqual([]);
  });

  test("the front page reads the same sister-night names the build checks", () => {
    expect({ ...APP_OTHER_NIGHT_URL_ENV }).toEqual({ ...OTHER_NIGHT_URL_ENV });
  });
});

describe("validateMusicBingoEnv", () => {
  test("throws one error listing every problem", () => {
    expect(() => validateMusicBingoEnv({ VERCEL_ENV: "production" })).toThrow(
      /Environment check failed:[\s\S]*NEXT_PUBLIC_SUPABASE_URL[\s\S]*SUPABASE_URL[\s\S]*LIVE_LINK_SECRET/,
    );
  });

  test("does not throw when all is well", () => {
    expect(() => validateMusicBingoEnv(PRODUCTION_OK)).not.toThrow();
  });
});
