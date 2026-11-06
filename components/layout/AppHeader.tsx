import type { ReactNode } from "react";
import { AnchorLogo } from "@anchor-nights/kit/ui";

import { AccountActions } from "@/components/layout/AccountActions";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /**
   * The register the page is in: desk (light cream, the default for prep,
   * the games list, venue and admin pages) or night (the host console).
   * Picks the black or white Anchor wordmark.
   */
  register?: "desk" | "night";
  /** Show the Account link and Sign out. Every page with this header is staff only. Default true. */
  account?: boolean;
};

/** The black wordmark for light surfaces; the kit's AnchorLogo defaults to the white one. */
const ANCHOR_LOGO_BLACK_SRC = "/the-anchor-pub-logo-black-transparent.png";

/** The top bar on every page outside the TV: the Anchor wordmark, the page title and its actions. */
export function AppHeader({ title, subtitle, actions, register = "desk", account = true }: AppHeaderProps): React.JSX.Element {
  return (
    <header className="host-bar">
      <div className="brandlock">
        <AnchorLogo height={40} priority src={register === "desk" ? ANCHOR_LOGO_BLACK_SRC : undefined} />
        <div className="host-title">
          {title}
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
      </div>
      {actions || account ? (
        <div className="right">
          {actions}
          {account ? <AccountActions /> : null}
        </div>
      ) : null}
    </header>
  );
}
