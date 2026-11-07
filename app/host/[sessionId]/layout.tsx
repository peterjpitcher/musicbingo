import type { ReactNode } from "react";

import { PromoProvider } from "@/components/promo/PromoProvider";
import { resolveReviewUrl } from "@/lib/reviewLink";

export const dynamic = "force-dynamic";

/**
 * Gives the host console's TV preview the same events feed and review link
 * as the TV (spec M-7), so the Thank You preview shows what the room will
 * see. The page itself is gated by proxy.ts.
 */
export default function HostSessionLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return <PromoProvider reviewUrl={resolveReviewUrl()}>{children}</PromoProvider>;
}
