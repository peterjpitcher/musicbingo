import { describe, expect, test } from "vitest";

import { SPOTIFY_CALLBACK_PATH, siteOrigin, spotifyAddressMismatch, spotifyRedirectUri } from "./siteUrl";

const NEW_ADDRESS = "https://musicbingo.the-anchor.pub";
const OLD_ALIAS = "https://oj-music-bingo.vercel.app";

describe("siteOrigin (spec M-10)", () => {
  test("production uses NEXT_PUBLIC_SITE_URL, whichever alias the request came in on", () => {
    expect(siteOrigin(OLD_ALIAS, { VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: NEW_ADDRESS })).toBe(NEW_ADDRESS);
  });

  test("a preview never hands out the production address", () => {
    const env = {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SITE_URL: NEW_ADDRESS,
      VERCEL_BRANCH_URL: "oj-music-bingo-git-feat-front.vercel.app",
    };
    expect(siteOrigin("https://anything.vercel.app", env)).toBe("https://oj-music-bingo-git-feat-front.vercel.app");
  });

  test("a local run uses the request's own address", () => {
    expect(siteOrigin("http://localhost:3000", {})).toBe("http://localhost:3000");
  });

  test("production never hands out a loopback address, even when set by mistake", () => {
    const origin = siteOrigin(OLD_ALIAS, {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://localhost",
      VERCEL_PROJECT_PRODUCTION_URL: "oj-music-bingo.vercel.app",
    });
    expect(origin).toBe(OLD_ALIAS);
  });
});

describe("the Spotify callback (spec M-10)", () => {
  test("SPOTIFY_WEB_REDIRECT_URI wins when set", () => {
    const env = { SPOTIFY_WEB_REDIRECT_URI: `${NEW_ADDRESS}${SPOTIFY_CALLBACK_PATH}` };
    expect(spotifyRedirectUri(OLD_ALIAS, env)).toBe(`${NEW_ADDRESS}/api/spotify/callback`);
  });

  test("unset, it is the request's own callback (local runs and previews)", () => {
    expect(spotifyRedirectUri("http://127.0.0.1:3000", {})).toBe("http://127.0.0.1:3000/api/spotify/callback");
  });

  test("sign-in started on another address is sent to the registered one", () => {
    const env = { SPOTIFY_WEB_REDIRECT_URI: `${NEW_ADDRESS}${SPOTIFY_CALLBACK_PATH}` };
    expect(spotifyAddressMismatch(OLD_ALIAS, env)).toBe(NEW_ADDRESS);
    expect(spotifyAddressMismatch(NEW_ADDRESS, env)).toBeNull();
    expect(spotifyAddressMismatch(OLD_ALIAS, {})).toBeNull();
  });
});
