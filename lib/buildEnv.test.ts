import { describe, expect, test } from "vitest";

import { ERROR_SINK_TOKEN_MIN_LENGTH, checkMusicBingoEnv, validateMusicBingoEnv } from "./buildEnv.mjs";

const PRODUCTION_OK = {
  VERCEL_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SPOTIFY_CLIENT_ID: "id",
  SPOTIFY_CLIENT_SECRET: "secret",
  APP_ADMIN_SECRET: "admin",
};

describe("checkMusicBingoEnv", () => {
  test("a local or CI build with no settings passes", () => {
    expect(checkMusicBingoEnv({})).toEqual([]);
  });

  test("a preview build with no settings passes", () => {
    expect(checkMusicBingoEnv({ VERCEL_ENV: "preview" })).toEqual([]);
  });

  test("a production build names every missing setting", () => {
    const problems = checkMusicBingoEnv({ VERCEL_ENV: "production" });
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "APP_ADMIN_SECRET"]) {
      expect(problems.some((problem) => problem.startsWith(`${name} is not set`))).toBe(true);
    }
  });

  test("a complete production environment passes", () => {
    expect(checkMusicBingoEnv(PRODUCTION_OK)).toEqual([]);
  });

  test("a malformed Supabase URL fails", () => {
    expect(checkMusicBingoEnv({ ...PRODUCTION_OK, SUPABASE_URL: "not a url" })).toContain("SUPABASE_URL is not a URL.");
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
    expect(() => validateMusicBingoEnv({ VERCEL_ENV: "production" })).toThrow(/Environment check failed:[\s\S]*SUPABASE_URL[\s\S]*APP_ADMIN_SECRET/);
  });

  test("does not throw when all is well", () => {
    expect(() => validateMusicBingoEnv(PRODUCTION_OK)).not.toThrow();
  });
});
