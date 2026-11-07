import { securityHeaders } from "@anchor-nights/kit/auth/headers";
import { buildIdFromEnv } from "@anchor-nights/kit/env";
import { EVENT_IMAGE_REMOTE_PATTERN } from "@anchor-nights/kit/events/image-host";

import { validateMusicBingoEnv } from "./lib/buildEnv.mjs";

// Fails the build (and `next dev` start-up) naming every missing or malformed
// variable. See lib/buildEnv.mjs for what each build needs.
validateMusicBingoEnv();

/**
 * The auth standard's security headers on every response (section 3): HSTS,
 * nosniff, frame denial, referrer and permissions policies, and the CSP as
 * Report-Only until two weeks of clean reports (then cspMode: "enforce").
 * App exceptions, each with its reason (recorded in CLAUDE.md):
 *   scriptSrc 'unsafe-inline'  Next's inline bootstrap scripts carry no nonce yet.
 *   styleSrc 'unsafe-inline'   React style props and Next's injected styles.
 *   imgSrc i.scdn.co           Spotify album art.
 *   imgSrc the Supabase origin venue logos in the brand-assets bucket.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const headers = securityHeaders({
  supabaseUrl,
  cspMode: "report-only",
  extra: {
    scriptSrc: ["'unsafe-inline'"],
    styleSrc: ["'unsafe-inline'"],
    imgSrc: ["https://i.scdn.co", new URL(supabaseUrl).origin],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Stop `next dev` writing its agent block into CLAUDE.md (AGENTS.md is a
  // symlink to it); the project's own rules live there.
  agentRules: false,
  compress: true,
  // The shared kit ships TypeScript source.
  transpilePackages: ["@anchor-nights/kit"],
  // The release this bundle was built from, for the kit's build-update check.
  env: { NEXT_PUBLIC_BUILD_ID: buildIdFromEnv() },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" }, // Spotify CDN album art
      // Event artwork on the TV's events loops (spec M-7), from the management
      // app's event-images bucket only. The kit draws it through Next's
      // optimiser, so the browser loads it from this origin.
      EVENT_IMAGE_REMOTE_PATTERN,
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
