import type { Metadata } from "next";
import { isRehearsalRequest, TvPageShell } from "@anchor-nights/kit/pairing";
import { TvNotice } from "@anchor-nights/kit/pairing/screens";

import { LiveDisplay } from "@/components/display/LiveDisplay";
import { authHelpers } from "@/lib/auth/server";
import { listSessionsOnDates } from "@/lib/live/sessionRepo";
import { createFindTonight } from "@/lib/live/tonight";
import { resolveMusicBingoTvView } from "@/lib/live/tvView";
import { tvPairing } from "@/lib/tv-pairing";

export const metadata: Metadata = { title: "Pub TV | Music Bingo" };
export const dynamic = "force-dynamic";

/** How often the idle screen looks again for tonight's game. */
const IDLE_RECHECK_MS = 60_000;

const findTonight = createFindTonight(listSessionsOnDates);

/**
 * The pub TV (spec M-9, S3.1, S3.2). Open /tv on the screen: unpaired it
 * shows a 6-digit code to type into the host console; paired it finds
 * tonight's game by itself (the game for today's date in London). Outside
 * the proxy's protected routes: the TV is never signed in.
 */
export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const view = await resolveMusicBingoTvView({
    pairing: tvPairing(),
    findTonight,
    staffRole: () => authHelpers().getCurrentRole(),
    rehearsal: isRehearsalRequest(params),
    requestedSessionId: typeof params.session === "string" ? params.session : null,
  });
  return (
    <TvPageShell
      view={view}
      pairing={{ appName: "Music Bingo" }}
      renderGame={(game) => <LiveDisplay sessionId={game.id} mode="tv" />}
      renderIdle={() => (
        <TvNotice
          title="Music Bingo"
          message="Tonight's game appears here by itself once it is set up for today."
          reloadAfterMs={IDLE_RECHECK_MS}
        />
      )}
    />
  );
}
