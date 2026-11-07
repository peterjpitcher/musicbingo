"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { ScreenFeed } from "@anchor-nights/kit/events/shared";
import { useScreenFeed } from "@anchor-nights/kit/promo";

export interface PromoValue {
  /** The screen route's feed; null until it first arrives (and while it never has). */
  feed: ScreenFeed | null;
  /** The review short link, resolved on the server (lib/reviewLink.ts). */
  reviewUrl: string | null;
}

/** Exported for tests and previews that supply a fixed value. */
export const PromoContext = createContext<PromoValue>({ feed: null, reviewUrl: null });

/** The events feed and review link for the screens below (the TV and the host's preview). */
export function usePromo(): PromoValue {
  return useContext(PromoContext);
}

export interface PromoProviderProps {
  reviewUrl: string;
  children: ReactNode;
}

/**
 * Holds one copy of the events feed for every screen below it (spec M-7,
 * S7.1). It reads /api/screen/events on mount and every 10 minutes (the kit's
 * useScreenFeed); a failed read keeps the last good feed and is logged, never
 * shown. The server side reports the management app's failures itself
 * (lib/eventsFeed.ts).
 */
export function PromoProvider({ reviewUrl, children }: PromoProviderProps): React.JSX.Element {
  const onError = useCallback((err: unknown) => {
    console.warn("[events-feed] the TV could not refresh the events:", err instanceof Error ? err.message : String(err));
  }, []);
  const feed = useScreenFeed(null, { onError });
  const value = useMemo<PromoValue>(() => ({ feed, reviewUrl }), [feed, reviewUrl]);
  return <PromoContext.Provider value={value}>{children}</PromoContext.Provider>;
}
