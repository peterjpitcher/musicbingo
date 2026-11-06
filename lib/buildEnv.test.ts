import { describe, expect, test } from "vitest";

import {
  CRON_SECRET_MIN_LENGTH,
  ERROR_SINK_TOKEN_MIN_LENGTH,
  LIVE_LINK_SECRET_MIN_LENGTH,
  checkMusicBingoEnv,
  validateMusicBingoEnv,
} from "./buildEnv.mjs";

/** What every build needs since staff sign-in (M-8), with placeholder values. */
const AUTH_OK = {
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
  LIVE_LINK_SECRET: "l".repeat(LIVE_LINK_SECRET_MIN_LENGTH),
  CRON_SECRET: "c".repeat(CRON_SECRET_MIN_LENGTH),
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
