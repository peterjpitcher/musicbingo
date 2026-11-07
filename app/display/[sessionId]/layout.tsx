import type { ReactNode } from "react";

import { PromoProvider } from "@/components/promo/PromoProvider";
import { resolveReviewUrl } from "@/lib/reviewLink";

export const dynamic = "force-dynamic";

/**
 * Gives the TV display its events feed and review link (spec M-7). The link
 * is read on the server (REVIEW_SHORT_URL, else the fallback short link), so
 * changing it needs only a redeploy. Holds no game data.
 */
export default function DisplayLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return <PromoProvider reviewUrl={resolveReviewUrl()}>{children}</PromoProvider>;
}
