import type { ReactElement } from "react";
import Link from "next/link";
import { FrontPage } from "@anchor-nights/kit/front";

import { eventsFeed } from "@/lib/eventsFeed";
import { loadOtherNights, readOtherNightUrls } from "@/lib/otherNights";
import { reportError } from "@/lib/reportError";

// The front page every night shares (spec M-10, S2.3): the kit's three tiles
// (host console, pub TV, admin) and the "Other nights" row. The row needs the
// events feed, so the page renders per request and the build never calls the
// management app; the kit holds the feed for five minutes (lib/eventsFeed.ts).
// Signed-out visitors see the page; each tile's own page asks them to sign in.
export const dynamic = "force-dynamic";

export default async function Home(): Promise<ReactElement> {
  const otherNights = await loadOtherNights({
    getFeed: () => eventsFeed.getFeed(),
    urls: readOtherNightUrls(),
    report: (scope, err) => void reportError({ scope }, err),
  });

  return (
    <FrontPage
      appName="Music Bingo"
      otherNights={otherNights}
      backdropSrc="/the-anchor-bar.jpg"
      linkComponent={Link}
    />
  );
}
