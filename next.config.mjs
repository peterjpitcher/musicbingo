import { buildIdFromEnv } from "@anchor-nights/kit/env";

import { validateMusicBingoEnv } from "./lib/buildEnv.mjs";

// Fails the build (and `next dev` start-up) naming every missing or malformed
// variable. See lib/buildEnv.mjs for what a production build needs.
validateMusicBingoEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The shared kit ships TypeScript source.
  transpilePackages: ["@anchor-nights/kit"],
  // The release this bundle was built from, for the kit's build-update check.
  env: { NEXT_PUBLIC_BUILD_ID: buildIdFromEnv() },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" }, // Spotify CDN album art
    ],
  },
};

export default nextConfig;
