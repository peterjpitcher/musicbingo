import type { Metadata } from "next";
import { isRehearsalRequest, TvPageShell } from "@anchor-nights/kit/pairing";

import { LiveDisplay } from "@/components/display/LiveDisplay";
import { TvIdleLoop } from "@/components/display/TvIdleLoop";
import { PromoProvider } from "@/components/promo/PromoProvider";
import { authHelpers } from "@/lib/auth/server";
import { listSessionsOnDates } from "@/lib/live/sessionRepo";
import { createFindTonight } from "@/lib/live/tonight";
import { resolveMusicBingoTvView } from "@/lib/live/tvView";
import { resolveReviewUrl } from "@/lib/reviewLink";
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
 * the proxy's protected routes: the TV is never signed in. With no game
 * tonight it loops the management app's upcoming events (spec M-7).
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
  const reviewUrl = resolveReviewUrl();
  return (
    <TvPageShell
      view={view}
      pairing={{ appName: "Music Bingo" }}
      renderGame={(game) => (
        <PromoProvider reviewUrl={reviewUrl}>
          <LiveDisplay sessionId={game.id} mode="tv" />
        </PromoProvider>
      )}
      renderIdle={() => (
        <PromoProvider reviewUrl={reviewUrl}>
          <TvIdleLoop recheckMs={IDLE_RECHECK_MS} />
        </PromoProvider>
      )}
    />
  );
}
